"""
Tests für Rückmeldung zu Befunden und Fallspeicher (L2) – ohne Ollama, mit austauschbarem Einbetter.

Ausführen:
    cd backend && .venv/bin/pytest test_feedback.py -v
"""
import sys
import zlib
from pathlib import Path

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).parent))

import ai_quality_service as aqs
import cases_service as cases
import doorstop_service as ds
import embedding_service as emb
import proposals_service
import rag_service as rag
from auth import get_current_user
from database import Base, FindingFeedback, User, get_db
from routers import feedback_router


def fake_embed(texts):
    m = np.zeros((len(texts), 256), dtype=np.float32)
    for i, t in enumerate(texts):
        for w in t.lower().split():
            m[i, zlib.crc32(w.encode()) % 256] += 1
    return m


@pytest.fixture(autouse=True)
def fake():
    emb.set_embedder(fake_embed)
    yield
    emb.set_embedder(None)


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 't.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)


@pytest.fixture
def project(tmp_path, monkeypatch):
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    monkeypatch.setattr(rag, "RAG_ROOT", tmp_path / "rag")
    pid = ds.create_project("Test", path=str(tmp_path / "proj"))["id"]
    ds.create_document(pid, "SRS")
    a = ds.create_item(pid, "SRS", {"text": "Die Beschleunigung soll ausreichend schnell sein."})["uid"]
    b = ds.create_item(pid, "SRS", {"text": "Die Bremsung soll ausreichend schnell erfolgen."})["uid"]
    c = ds.create_item(pid, "SRS", {"text": "Das Display zeigt die Temperatur in Grad Celsius an."})["uid"]
    return {"pid": pid, "a": a, "b": b, "c": c}


def make_client(db_session, role="editor", name="u1"):
    app = FastAPI()
    app.include_router(feedback_router.router)

    def _db():
        s = db_session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = lambda: User(username=name, role=role, is_active=True)
    return TestClient(app)


def url(project):
    return f"/api/projects/{project['pid']}/finding-feedback"


def issue(sev="high", cat="Clarity", desc="Vage Angabe"):
    return aqs.AiQualityIssue(category=cat, severity=sev, description=desc, suggestion="Wert nennen")


def case(key, uid, text, verdict="not_applies", cat="Clarity"):
    return {"key": key, "kind": "finding", "verdict": verdict, "category": cat, "finding": "x", "uid": uid, "text": text}


# ─── Router / Tabelle ─────────────────────────────────────────────────────────

def test_post_stores_row_and_case(db_session, project):
    c = make_client(db_session)
    r = c.post(url(project), json={"uid": project["a"], "category": "Clarity", "finding": "Vage Angabe",
                                   "verdict": "not_applies"})
    assert r.status_code == 201
    body = r.json()
    assert body["verdict"] == "not_applies" and body["created_by"] == "u1"
    assert body["requirement_text"] == "Die Beschleunigung soll ausreichend schnell sein."
    assert len(body["text_hash"]) == 64
    assert cases.count(project["pid"]) == 1
    hit = cases.similar_cases(project["pid"], "Die Beschleunigung soll ausreichend schnell sein.")[0]
    assert hit["verdict"] == "not_applies" and hit["uid"] == project["a"] and hit["score"] > 0.99


def test_same_user_same_finding_replaces_verdict(db_session, project):
    c = make_client(db_session)
    payload = {"uid": project["a"], "category": "Clarity", "finding": "Vage Angabe"}
    c.post(url(project), json={**payload, "verdict": "applies"})
    c.post(url(project), json={**payload, "verdict": "not_applies"})
    rows = c.get(url(project)).json()
    assert len(rows) == 1 and rows[0]["verdict"] == "not_applies"
    assert cases.count(project["pid"]) == 1
    # anderer Benutzer: eigenes Urteil
    make_client(db_session, name="u2").post(url(project), json={**payload, "verdict": "applies"})
    assert len(c.get(url(project)).json()) == 2 and cases.count(project["pid"]) == 2


def test_validation_and_roles(db_session, project):
    c = make_client(db_session)
    bad = c.post(url(project), json={"uid": project["a"], "category": "Clarity", "finding": "x", "verdict": "vielleicht"})
    assert bad.status_code == 400
    missing = c.post(url(project), json={"uid": "NIX999", "category": "Clarity", "finding": "x", "verdict": "applies"})
    assert missing.status_code == 404
    viewer = make_client(db_session, role="viewer")
    assert viewer.post(url(project), json={"uid": project["a"], "category": "Clarity", "finding": "x",
                                           "verdict": "applies"}).status_code == 403
    assert viewer.get(url(project)).status_code == 200


def test_withdraw_own_verdict_removes_case(db_session, project):
    c = make_client(db_session)
    fid = c.post(url(project), json={"uid": project["a"], "category": "Clarity", "finding": "x",
                                     "verdict": "applies"}).json()["id"]
    other = make_client(db_session, name="u2")
    assert other.delete(f"{url(project)}/{fid}").status_code == 403
    assert c.delete(f"{url(project)}/{fid}").status_code == 204
    assert c.get(url(project)).json() == [] and cases.count(project["pid"]) == 0


def test_sync_cases_rebuilds_from_db_including_accepted_proposals(db_session, project):
    import json
    s = db_session()
    s.add(FindingFeedback(project_id=project["pid"], uid=project["a"], category="Clarity", finding="f",
                          requirement_text="Alter Text", text_hash="h", verdict="not_applies", created_by="u1"))
    from database import Proposal
    s.add(Proposal(project_id=project["pid"], kind="change_text", uid=project["b"], status="accepted",
                   payload=json.dumps({"old_text": "Die Bremsung soll schnell sein.",
                                       "new_text": "Die Bremsung muss in 40 m anhalten."}), reason="Grenzwert"))
    s.add(Proposal(project_id=project["pid"], kind="change_text", uid=project["c"], status="rejected",
                   payload=json.dumps({"old_text": "abgelehnt", "new_text": "egal"}), reason="x"))
    s.commit()
    s.close()
    r = make_client(db_session).post(f"{url(project)}/sync-cases")
    assert r.json() == {"findings": 1, "proposals": 1}
    kinds = sorted(e["kind"] for e in cases._load(project["pid"])[0]["entries"])
    assert kinds == ["finding", "proposal"]
    make_client(db_session).post(f"{url(project)}/sync-cases")   # idempotent
    assert cases.count(project["pid"]) == 2


def test_accepting_proposal_stores_old_to_new_case(db_session, project):
    s = db_session()
    p = proposals_service.create(s, project["pid"], "change_text", "u1", "Grenzwert eindeutig machen",
                                 uid=project["a"], new_text="Die Beschleunigung muss höchstens 4 s betragen.")
    proposals_service.accept(s, project["pid"], p.id, "u1")
    entries = cases._load(project["pid"])[0]["entries"]
    assert len(entries) == 1 and entries[0]["kind"] == "proposal"
    assert entries[0]["text"].startswith("Die Beschleunigung soll") and entries[0]["new_text"].startswith("Die Beschleunigung muss")
    s.close()


def test_case_store_survives_reload_and_model_change(project, monkeypatch):
    cases.upsert_cases(project["pid"], [case("k1", "SRS001", "Text eins zwei drei")])
    assert cases.count(project["pid"]) == 1
    monkeypatch.setenv("EMBED_MODEL", "anderes-modell")
    assert cases.similar_cases(project["pid"], "Text eins zwei drei") == []   # Vektoren eines anderen Modells nie mischen


# ─── Wirkung im Code ──────────────────────────────────────────────────────────

TEXT = "Die Beschleunigung soll ausreichend schnell sein."


def test_two_rejections_demote_one_step_and_mark(project):
    cases.upsert_cases(project["pid"], [case("k1", "SRS012", "Die Bremsung soll ausreichend schnell sein."),
                                        case("k2", "SRS013", "Die Lenkung soll ausreichend schnell sein.")])
    out, info = aqs.apply_feedback(project["pid"], TEXT, [issue("high"), issue("medium", "Testability")], min_sim=0.5)
    assert out[0].severity == "medium" and "Rückmeldung: von high auf medium" in out[0].description
    assert "SRS012" in out[0].description and "2 abgelehnten" in out[0].description
    assert out[1].severity == "medium" and out[1].description == "Vage Angabe"   # andere Kategorie: unberührt
    assert len(info["demoted"]) == 1 and len(out) == 2                            # nie ausgeblendet


def test_one_rejection_is_not_enough(project):
    cases.upsert_cases(project["pid"], [case("k1", "SRS012", "Die Bremsung soll ausreichend schnell sein.")])
    out, _ = aqs.apply_feedback(project["pid"], TEXT, [issue("high")], min_sim=0.5)
    assert out[0].severity == "high"


def test_two_cases_from_same_requirement_count_once(project):
    cases.upsert_cases(project["pid"], [case("k1", "SRS012", "Die Bremsung soll ausreichend schnell sein."),
                                        case("k2", "SRS012", "Die Bremsung soll ausreichend schnell sein.")])
    out, _ = aqs.apply_feedback(project["pid"], TEXT, [issue("high")], min_sim=0.5)
    assert out[0].severity == "high"


def test_low_similarity_does_not_count(project):
    cases.upsert_cases(project["pid"], [case("k1", "SRS012", "Das Display zeigt Grad Celsius an."),
                                        case("k2", "SRS013", "Die Tür öffnet nach Schlüsselkontakt.")])
    out, _ = aqs.apply_feedback(project["pid"], TEXT, [issue("high")], min_sim=0.5)
    assert out[0].severity == "high"


def test_confirmations_outweigh_rejections(project):
    cases.upsert_cases(project["pid"], [case("k1", "SRS012", "Die Bremsung soll ausreichend schnell sein."),
                                        case("k2", "SRS013", "Die Lenkung soll ausreichend schnell sein."),
                                        case("k3", "SRS014", "Der Antrieb soll ausreichend schnell sein.", "applies"),
                                        case("k4", "SRS015", "Die Kupplung soll ausreichend schnell sein.", "applies")])
    out, _ = aqs.apply_feedback(project["pid"], TEXT, [issue("high")], min_sim=0.5)
    assert out[0].severity == "high"


def test_never_below_medium_for_high_critical_and_low_stays(project):
    cases.upsert_cases(project["pid"], [case("k1", "SRS012", "Die Bremsung soll ausreichend schnell sein."),
                                        case("k2", "SRS013", "Die Lenkung soll ausreichend schnell sein.")])
    out, _ = aqs.apply_feedback(project["pid"], TEXT, [issue("critical"), issue("high"), issue("low")], min_sim=0.5)
    assert [i.severity for i in out] == ["high", "medium", "low"]
    assert out[2].description == "Vage Angabe"   # low: nichts zu senken, keine Kennzeichnung


def test_category_match_ignores_case(project):
    cases.upsert_cases(project["pid"], [case("k1", "SRS012", "Die Bremsung soll ausreichend schnell sein.", cat="clarity"),
                                        case("k2", "SRS013", "Die Lenkung soll ausreichend schnell sein.", cat="CLARITY")])
    out, _ = aqs.apply_feedback(project["pid"], TEXT, [issue("high")], min_sim=0.5)
    assert out[0].severity == "medium"


def test_proposal_cases_do_not_demote(project):
    prop = {"key": "proposal|1", "kind": "proposal", "uid": "SRS012", "text": TEXT, "new_text": "neu"}
    cases.upsert_cases(project["pid"], [prop, {**prop, "key": "proposal|2", "uid": "SRS013", "text": TEXT + " x"}])
    out, _ = aqs.apply_feedback(project["pid"], TEXT, [issue("high")], min_sim=0.5)
    assert out[0].severity == "high"


def test_empty_store_and_embedder_failure_leave_issues_untouched(project):
    issues = [issue("high")]
    assert aqs.apply_feedback(project["pid"], TEXT, issues)[0][0].severity == "high"
    cases.upsert_cases(project["pid"], [case("k1", "SRS012", "Die Bremsung soll ausreichend schnell sein.")])

    def boom(texts):
        raise emb.EmbeddingError("aus")
    emb.set_embedder(boom)
    out, info = aqs.apply_feedback(project["pid"], TEXT, issues)
    assert out[0].severity == "high" and "error" in info


def test_switch_default_off(monkeypatch):
    monkeypatch.delenv("AI_FEEDBACK", raising=False)
    assert aqs.feedback_enabled() is False
    monkeypatch.setenv("AI_FEEDBACK", "1")
    assert aqs.feedback_enabled() is True


def test_min_sim_from_env(monkeypatch):
    assert aqs.feedback_min_sim() == 0.80
    monkeypatch.setenv("AI_FEEDBACK_MIN_SIM", "0,7")
    assert aqs.feedback_min_sim() == 0.7


class _Provider:
    def complete(self, system_prompt, user_prompt, model=None):
        return ('{"overall_score": 60, "scores": {"clarity": 60, "testability": 60, "completeness": 60, '
                '"consistency": 60}, "issues": [{"category": "Clarity", "severity": "high", '
                '"description": "Vage Angabe", "suggestion": "Wert nennen"}], "summary": "s"}')


def test_analyze_uses_feedback_only_when_switched_on(project, monkeypatch):
    import asyncio
    monkeypatch.setattr(aqs, "save_quality_result", lambda *a, **k: None)
    cases.upsert_cases(project["pid"], [case("k1", "SRS012", "Die Bremsung soll ausreichend schnell sein."),
                                        case("k2", "SRS013", "Die Lenkung soll ausreichend schnell sein.")])
    monkeypatch.setenv("AI_FEEDBACK_MIN_SIM", "0.5")
    az = aqs.QualityAnalyzer(provider=_Provider())

    def sev(result):
        return [i.severity for i in result.issues if i.description.startswith("Vage")]

    monkeypatch.delenv("AI_FEEDBACK", raising=False)
    assert sev(asyncio.run(az.analyze(project["pid"], project["a"]))) == ["high"]
    monkeypatch.setenv("AI_FEEDBACK", "1")
    assert sev(asyncio.run(az.analyze(project["pid"], project["a"]))) == ["medium"]
