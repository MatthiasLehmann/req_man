"""
Tests für ai_quality_service.py

Ausführen:
    cd backend && ../.venv/bin/pytest test_ai_quality_service.py -v
"""
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest
import yaml

# ai_quality_service direkt importieren (kein Systemstart nötig)
import sys
sys.path.insert(0, str(Path(__file__).parent))

import ai_quality_service as aqs


# ─── Fixtures ────────────────────────────────────────────────────────────────

SAMPLE_ITEM: Dict[str, Any] = {
    "uid": "SRS001",
    "text": "Das System muss Benutzereingaben innerhalb von 200 ms verarbeiten.",
    "normative": True,
    "active": True,
    "header": False,
    "links": ["SYS042"],
    "custom_attributes": {"safety_level": "ASIL-B", "priority": "HIGH"},
}

SAMPLE_ITEM_VAGUE: Dict[str, Any] = {
    "uid": "SRS002",
    "text": "Das System soll möglichst schnell reagieren und bei Fehlern eine Meldung ausgeben.",
    "normative": False,
    "active": True,
    "header": False,
    "links": [],
    "custom_attributes": {},
}

SAMPLE_JSON_RESPONSE = json.dumps({
    "overall_score": 72,
    "scores": {
        "clarity": 80,
        "testability": 75,
        "completeness": 70,
        "consistency": 65,
    },
    "issues": [
        {
            "category": "Consistency",
            "severity": "medium",
            "description": "Kein Link zu übergeordneter Systemanforderung.",
            "suggestion": "Verlinke mit SYS-Anforderung.",
        }
    ],
    "summary": "Anforderung ist weitgehend gut, Traceability fehlt.",
})

SAMPLE_JSON_LOW_SCORE = json.dumps({
    "overall_score": 22,
    "scores": {"clarity": 20, "testability": 5, "completeness": 30, "consistency": 50},
    "issues": [
        {
            "category": "Testability",
            "severity": "critical",
            "description": "Kein messbarer Zeitwert.",
            "suggestion": "Ersetze durch konkreten Wert.",
        },
        {
            "category": "Clarity",
            "severity": "high",
            "description": "Vagheit: 'möglichst schnell'.",
            "suggestion": "Verwende 200 ms als konkreten Wert.",
        },
    ],
    "summary": "Kritische Mängel: nicht testbar, unvollständig.",
})


# ─── Mock-Provider für Tests ──────────────────────────────────────────────────

class MockProvider:
    """Einfacher Test-Provider der eine feste Antwort zurückgibt."""
    def __init__(self, response: str = SAMPLE_JSON_RESPONSE):
        self.response = response
        self.calls: list = []
        self.models: list = []

    def complete(self, system_prompt: str, user_prompt: str, model: str | None = None) -> str:
        self.calls.append((system_prompt, user_prompt))
        self.models.append(model)
        return self.response


# ─── PromptBuilder Tests ──────────────────────────────────────────────────────

class TestPromptBuilder:
    def setup_method(self):
        self.builder = aqs.PromptBuilder()

    def test_build_system_prompt_standard(self):
        profile = {"name": "INCOSE Standard", "forbidden_keywords": ["möglichst", "schnell"]}
        prompt = self.builder.build_system_prompt(profile)
        assert "INCOSE Standard" in prompt
        assert "möglichst" in prompt
        assert "JSON" in prompt
        assert "overall_score" in prompt

    def test_build_system_prompt_empty_profile(self):
        prompt = self.builder.build_system_prompt({})
        assert "overall_score" in prompt
        assert "issues" in prompt

    def test_system_prompt_has_checklist(self):
        prompt = self.builder.build_system_prompt({})
        for punkt in ("ohne Einheit", "Lösungsvorgabe", "verantwortlich", "Nicht prüfbar", "bzw."):
            assert punkt in prompt

    def test_system_prompt_defines_score_scale(self):
        prompt = self.builder.build_system_prompt({})
        assert "90–100 keine Mängel" in prompt
        assert "0–39" in prompt

    def test_system_prompt_short_findings_optional_suggestion(self):
        # V13: Hinweis zuerst, Vorschlag nur wenn sicher; Beispiele erfinden keine Werte
        prompt = self.builder.build_system_prompt({})
        assert "EINEM kurzen Satz" in prompt
        assert 'lass "suggestion" leer' in prompt
        assert "0,5 K" not in prompt
        assert "vollständig umformulierte Anforderung" not in prompt

    def test_system_prompt_examples_render(self):
        # Die Beispiele enthalten JSON; die geschweiften Klammern müssen das format() überstehen
        prompt = self.builder.build_system_prompt({"name": "X"})
        assert '{"category": "Clarity"' in prompt
        assert "Übernimm daraus keine Formulierungen" in prompt

    def test_system_prompt_defines_cautious_severity(self):
        prompt = self.builder.build_system_prompt({})
        assert '"high" nur, wenn die Anforderung so nicht umsetzbar oder nicht prüfbar ist' in prompt
        assert "Im Zweifel den niedrigeren Schweregrad" in prompt

    def test_max_tokens_raised(self):
        assert aqs.MAX_TOKENS == 2048

    def test_build_user_prompt_with_context(self):
        profile = {"name": "INCOSE Standard"}
        prompt = self.builder.build_user_prompt(SAMPLE_ITEM, profile)
        assert "SRS001" in prompt
        assert "SRS" in prompt
        assert "normativ" in prompt.lower() or "ja" in prompt
        assert "ASIL-B" in prompt
        assert "Das System muss" in prompt

    def test_build_user_prompt_no_links(self):
        profile = {}
        prompt = self.builder.build_user_prompt(SAMPLE_ITEM_VAGUE, profile)
        assert "0" in prompt  # keine Links
        assert "SRS002" in prompt

    def test_doc_prefix_extraction(self):
        item = {**SAMPLE_ITEM, "uid": "SWD042"}
        prompt = self.builder.build_user_prompt(item, {})
        assert "SWD" in prompt


# ─── QualityResultParser Tests ───────────────────────────────────────────────

class TestQualityResultParser:
    def setup_method(self):
        self.parser = aqs.QualityResultParser()

    def test_parse_valid_json(self):
        result = self.parser.parse(SAMPLE_JSON_RESPONSE, "SRS001", "claude-sonnet-4-6", "standard")
        assert result.requirement_uid == "SRS001"
        assert result.score.overall == 72
        assert result.score.clarity == 80
        assert result.score.testability == 75
        assert len(result.issues) == 1
        assert result.issues[0].severity == "medium"
        assert result.model_used == "claude-sonnet-4-6"
        assert result.profile_used == "standard"

    def test_parse_low_score(self):
        result = self.parser.parse(SAMPLE_JSON_LOW_SCORE, "SRS002", "claude-sonnet-4-6", "standard")
        # Overall wird aus Unterkriterien berechnet: (20+5+30+50)/4 = 26.25 → 26
        assert result.score.overall == 26
        assert len(result.issues) == 2
        severities = {i.severity for i in result.issues}
        assert "critical" in severities
        assert "high" in severities

    def test_parse_with_markdown_codeblock(self):
        wrapped = f"```json\n{SAMPLE_JSON_RESPONSE}\n```"
        result = self.parser.parse(wrapped, "SRS001", "claude-sonnet-4-6", "standard")
        assert result.score.overall == 72  # (80+75+70+65)/4 = 72.5 → 72 (Banker's Rounding)

    def test_overall_score_calculated_not_from_llm(self):
        """LLM gibt overall=100, Unterkriterien sind niedriger → muss Durchschnitt liefern."""
        tricky = json.dumps({
            "overall_score": 100,  # LLM lügt
            "scores": {"clarity": 60, "testability": 40, "completeness": 50, "consistency": 70},
            "issues": [],
            "summary": "Test",
        })
        result = self.parser.parse(tricky, "SRS001", "model", "standard")
        # Erwarteter Durchschnitt: (60+40+50+70)/4 = 55
        assert result.score.overall == 55
        assert result.score.overall != 100

    def test_overall_score_all_perfect(self):
        """Alle Unterkriterien 100 → Overall muss auch 100 sein."""
        perfect = json.dumps({
            "overall_score": 100,
            "scores": {"clarity": 100, "testability": 100, "completeness": 100, "consistency": 100},
            "issues": [],
            "summary": "Perfekt",
        })
        result = self.parser.parse(perfect, "SRS001", "model", "standard")
        assert result.score.overall == 100

    def test_overall_score_all_zero(self):
        """Alle Unterkriterien 0 → Overall muss 0 sein."""
        zero = json.dumps({
            "overall_score": 50,
            "scores": {"clarity": 0, "testability": 0, "completeness": 0, "consistency": 0},
            "issues": [],
            "summary": "Schlecht",
        })
        result = self.parser.parse(zero, "SRS001", "model", "standard")
        assert result.score.overall == 0

    def test_overall_score_partial_subscores(self):
        """Nur 2 Unterkriterien vorhanden → Durchschnitt aus diesen 2."""
        partial = json.dumps({
            "overall_score": 99,
            "scores": {"clarity": 80, "testability": 60},
            "issues": [],
            "summary": "Teilweise",
        })
        result = self.parser.parse(partial, "SRS001", "model", "standard")
        assert result.score.overall == 70  # (80+60)/2 = 70

    def test_score_clamped_above_100(self):
        """Werte über 100 vom LLM werden auf 100 begrenzt."""
        clamped = json.dumps({
            "overall_score": 150,
            "scores": {"clarity": 110, "testability": 120, "completeness": 90, "consistency": 80},
            "issues": [],
            "summary": "Overflow",
        })
        result = self.parser.parse(clamped, "SRS001", "model", "standard")
        assert result.score.clarity == 100
        assert result.score.testability == 100
        assert result.score.overall <= 100

    def test_score_clamped_below_zero(self):
        """Negative Werte vom LLM werden auf 0 begrenzt."""
        clamped = json.dumps({
            "overall_score": -10,
            "scores": {"clarity": -5, "testability": 50, "completeness": 0, "consistency": 10},
            "issues": [],
            "summary": "Negativ",
        })
        result = self.parser.parse(clamped, "SRS001", "model", "standard")
        assert result.score.clarity == 0
        assert result.score.overall >= 0

    def test_parse_timestamp_set(self):
        result = self.parser.parse(SAMPLE_JSON_RESPONSE, "SRS001", "claude-sonnet-4-6", "standard")
        assert result.timestamp  # nicht leer
        assert "T" in result.timestamp  # ISO-Format

    def test_parse_invalid_json_raises(self):
        with pytest.raises(Exception):
            self.parser.parse("kein valides json", "SRS001", "model", "standard")


# ─── YAML-Persistenz Tests ───────────────────────────────────────────────────

class TestYamlPersistence:
    def _make_result(self) -> aqs.AiQualityResult:
        return aqs.AiQualityResult(
            requirement_uid="SRS001",
            score=aqs.AiQualityScore(overall=72, clarity=80, testability=75),
            issues=[
                aqs.AiQualityIssue(
                    category="Consistency",
                    severity="medium",
                    description="Kein Link.",
                    suggestion="Link hinzufügen.",
                )
            ],
            summary="Gut, aber Traceability fehlt.",
            model_used="claude-sonnet-4-6",
            profile_used="standard",
            timestamp="2026-03-23T10:00:00+00:00",
        )

    def test_save_and_load_roundtrip(self, tmp_path):
        # Temporäre Projektstruktur anlegen
        doc_dir = tmp_path / "SRS"
        doc_dir.mkdir()
        (doc_dir / "SRS001.yml").write_text("active: true\ntext: Test\n")

        result = self._make_result()
        target = doc_dir / "SRS001.ai-quality.yml"

        # Direkt speichern (ohne Projektlookup)
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "w", encoding="utf-8") as f:
            yaml.dump(result.model_dump(), f, allow_unicode=True, default_flow_style=False)

        # Laden
        with open(target, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        loaded = aqs.AiQualityResult(**data)

        assert loaded.requirement_uid == "SRS001"
        assert loaded.score.overall == 72
        assert loaded.issues[0].severity == "medium"
        assert loaded.profile_used == "standard"

    def test_yaml_contains_unicode(self, tmp_path):
        doc_dir = tmp_path / "SRS"
        doc_dir.mkdir()
        result = self._make_result()
        result.summary = "Änderung erforderlich: Überprüfung nötig."
        target = doc_dir / "SRS001.ai-quality.yml"

        with open(target, "w", encoding="utf-8") as f:
            yaml.dump(result.model_dump(), f, allow_unicode=True, default_flow_style=False)

        content = target.read_text(encoding="utf-8")
        assert "Änderung" in content  # allow_unicode=True


# ─── Profil-Tests ────────────────────────────────────────────────────────────

class TestProfiles:
    def test_list_profiles_returns_list(self):
        profiles = aqs.list_profiles()
        assert isinstance(profiles, list)
        assert len(profiles) > 0

    def test_standard_profile_loadable(self):
        profile = aqs.load_profile("standard")
        # Profil kann leer sein wenn Datei fehlt (kein Fehler)
        assert isinstance(profile, dict)

    def test_nonexistent_profile_falls_back(self):
        # Sollte keinen Fehler werfen
        profile = aqs.load_profile("does_not_exist_xyz")
        assert isinstance(profile, dict)


# ─── _clamp Tests ────────────────────────────────────────────────────────────

class TestClamp:
    def test_normal_value(self):
        assert aqs._clamp(50) == 50

    def test_zero(self):
        assert aqs._clamp(0) == 0

    def test_hundred(self):
        assert aqs._clamp(100) == 100

    def test_above_100(self):
        assert aqs._clamp(150) == 100

    def test_negative(self):
        assert aqs._clamp(-10) == 0

    def test_none(self):
        assert aqs._clamp(None) is None

    def test_string_number(self):
        assert aqs._clamp("75") == 75

    def test_invalid_string(self):
        assert aqs._clamp("abc") is None

    def test_float(self):
        assert aqs._clamp(72.9) == 72  # int() truncates


# ─── Provider-Tests ───────────────────────────────────────────────────────────

class TestProviders:
    def test_create_provider_anthropic(self):
        with patch.dict(os.environ, {"AI_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "test-key"}):
            with patch("anthropic.Anthropic"):
                provider = aqs.create_provider("claude-sonnet-4-6")
                assert isinstance(provider, aqs.AnthropicProvider)

    def test_create_provider_openai(self):
        with patch.dict(os.environ, {"AI_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}):
            with patch("openai.OpenAI"):
                provider = aqs.create_provider("gpt-4o-mini")
                assert isinstance(provider, aqs.OpenAiCompatibleProvider)

    def test_create_provider_ollama(self):
        with patch.dict(os.environ, {"AI_PROVIDER": "ollama"}, clear=False):
            with patch("openai.OpenAI"):
                provider = aqs.create_provider("llama3.2")
                assert isinstance(provider, aqs.OpenAiCompatibleProvider)

    def test_create_provider_unknown_raises(self):
        with patch.dict(os.environ, {"AI_PROVIDER": "unknown_xyz"}):
            with pytest.raises(ValueError, match="Unbekannter AI_PROVIDER"):
                aqs.create_provider()

    def test_anthropic_provider_no_key_raises(self):
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("ANTHROPIC_API_KEY", None)
            os.environ.pop("AI_PROVIDER", None)
            with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
                aqs.AnthropicProvider(model="claude-sonnet-4-6")

    def test_openai_provider_no_key_raises(self):
        with patch.dict(os.environ, {"AI_PROVIDER": "openai"}, clear=False):
            os.environ.pop("OPENAI_API_KEY", None)
            with pytest.raises(ValueError, match="OPENAI_API_KEY"):
                aqs.OpenAiCompatibleProvider(model="gpt-4o-mini")

    def test_get_provider_info_anthropic(self):
        with patch.dict(os.environ, {"AI_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "test-key"}):
            info = aqs.get_provider_info()
            assert info["provider"] == "anthropic"
            assert info["api_key_configured"] is True
            assert info["api_key_env_var"] == "ANTHROPIC_API_KEY"

    def test_get_provider_info_openai(self):
        with patch.dict(os.environ, {"AI_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}):
            info = aqs.get_provider_info()
            assert info["provider"] == "openai"
            assert info["api_key_configured"] is True
            assert info["api_key_env_var"] == "OPENAI_API_KEY"

    def test_get_provider_info_no_key(self):
        env = {"AI_PROVIDER": "openai"}
        with patch.dict(os.environ, env, clear=False):
            os.environ.pop("OPENAI_API_KEY", None)
            info = aqs.get_provider_info()
            assert info["api_key_configured"] is False

    def test_model_matches_provider(self):
        assert aqs._model_matches_provider("claude-sonnet-4-6", "anthropic") is True
        assert aqs._model_matches_provider("gpt-4o-mini", "anthropic") is False
        assert aqs._model_matches_provider("gpt-4o-mini", "openai") is True
        assert aqs._model_matches_provider("llama3.2", "ollama") is True
        # Profil-Standard "claude-sonnet-4-6" kennt ein lokaler Ollama-Server nicht
        assert aqs._model_matches_provider("claude-sonnet-4-6", "ollama") is False
        assert aqs._model_matches_provider("gpt-4o-mini", "ollama") is False

    def test_resolve_model_priority(self, monkeypatch):
        profile = {"model": "claude-sonnet-4-6"}
        monkeypatch.setenv("AI_PROVIDER", "anthropic")
        monkeypatch.delenv("AI_MODEL", raising=False)
        assert aqs.resolve_model("claude-opus-x", profile) == "claude-opus-x"
        assert aqs.resolve_model(None, profile) == "claude-sonnet-4-6"
        monkeypatch.setenv("AI_MODEL", "claude-haiku-x")
        assert aqs.resolve_model(None, profile) == "claude-haiku-x"

    def test_resolve_model_ollama_ignores_claude_profile(self, monkeypatch):
        monkeypatch.setenv("AI_PROVIDER", "ollama")
        monkeypatch.delenv("AI_MODEL", raising=False)
        assert aqs.resolve_model(None, {"model": "claude-sonnet-4-6"}) == "llama3.2"

    def test_sampling_defaults_are_deterministic(self, monkeypatch):
        monkeypatch.delenv("AI_TEMPERATURE", raising=False)
        monkeypatch.delenv("AI_SEED", raising=False)
        assert aqs.get_temperature() == 0.0
        assert aqs.get_seed() == 42

    def test_sampling_env_override(self, monkeypatch):
        monkeypatch.setenv("AI_TEMPERATURE", "0.7")
        monkeypatch.setenv("AI_SEED", "none")
        assert aqs.get_temperature() == 0.7
        assert aqs.get_seed() is None

    def test_openai_provider_sends_temperature_and_seed(self, monkeypatch):
        monkeypatch.delenv("AI_TEMPERATURE", raising=False)
        monkeypatch.delenv("AI_SEED", raising=False)
        calls = []

        class FakeCompletions:
            def create(self, **kwargs):
                calls.append(kwargs)
                msg = MagicMock()
                msg.choices = [MagicMock()]
                msg.choices[0].message.content = "{}"
                return msg

        provider = object.__new__(aqs.OpenAiCompatibleProvider)
        provider.model = "llama3.2"
        provider._client = MagicMock()
        provider._client.chat.completions = FakeCompletions()
        provider.complete("sys", "user")

        assert calls[0]["temperature"] == 0.0
        assert calls[0]["seed"] == 42


# ─── QualityAnalyzer Tests (mit MockProvider) ─────────────────────────────────

class TestQualityAnalyzer:
    def test_analyzer_init_with_mock_provider(self):
        mock = MockProvider()
        analyzer = aqs.QualityAnalyzer(provider=mock)
        assert analyzer is not None

    @patch("doorstop_service.get_item")
    @patch("doorstop_service.get_project")
    @patch("ai_quality_service.save_quality_result")
    def test_analyze_happy_path(self, mock_save, mock_get_project, mock_get_item):
        import asyncio

        mock_get_item.return_value = SAMPLE_ITEM
        mock_get_project.return_value = {"id": "proj1", "path": "/tmp/proj"}

        mock_provider = MockProvider(SAMPLE_JSON_RESPONSE)
        analyzer = aqs.QualityAnalyzer(provider=mock_provider)
        result = asyncio.run(analyzer.analyze("proj1", "SRS001"))

        # V19: 72,5 (Teilnoten, Gewichte 1,0) − 5 (Consistency medium) = 67,5 → 68
        assert result.score.overall == 68
        assert result.score.min_score == 70
        assert result.score.passed is False
        assert result.requirement_uid == "SRS001"
        mock_save.assert_called_once()
        assert len(mock_provider.calls) == 1  # Provider wurde genau einmal aufgerufen

    @patch("doorstop_service.get_item")
    def test_analyze_header_item_raises(self, mock_get_item):
        import asyncio
        mock_get_item.return_value = {**SAMPLE_ITEM, "header": True}
        analyzer = aqs.QualityAnalyzer(provider=MockProvider())
        with pytest.raises(ValueError, match="header"):
            asyncio.run(analyzer.analyze("proj1", "SRS001"))

    @patch("doorstop_service.get_item")
    def test_analyze_short_text_raises(self, mock_get_item):
        import asyncio
        mock_get_item.return_value = {**SAMPLE_ITEM, "text": "kurz"}
        analyzer = aqs.QualityAnalyzer(provider=MockProvider())
        with pytest.raises(ValueError, match="kurz"):
            asyncio.run(analyzer.analyze("proj1", "SRS001"))

    @patch("doorstop_service.get_item")
    @patch("doorstop_service.get_project")
    @patch("ai_quality_service.save_quality_result")
    def test_analyze_uses_mock_provider_response(self, mock_save, mock_get_project, mock_get_item):
        import asyncio
        mock_get_item.return_value = SAMPLE_ITEM_VAGUE
        mock_get_project.return_value = {"id": "proj1", "path": "/tmp/proj"}

        mock_provider = MockProvider(SAMPLE_JSON_LOW_SCORE)
        analyzer = aqs.QualityAnalyzer(provider=mock_provider)
        result = asyncio.run(analyzer.analyze("proj1", "SRS002"))

        # V19: 26,25 − 5 (Regel: 'möglichst', 'schnell', ersetzt den KI-Clarity-Befund)
        # − 20 (Testability critical) = 1,25 → 1
        assert result.score.overall == 1
        assert len(result.issues) == 2
        assert result.issues[0].description.startswith(aqs.RULE_PREFIX)

    @patch("doorstop_service.get_item")
    @patch("doorstop_service.get_project")
    @patch("ai_quality_service.save_quality_result")
    def test_analyze_model_used_matches_called_model(
        self, mock_save, mock_get_project, mock_get_item, monkeypatch
    ):
        """Regression: model_used zeigte das Profil-Modell, obwohl Ollama antwortete."""
        import asyncio
        monkeypatch.setenv("AI_PROVIDER", "ollama")
        monkeypatch.setenv("AI_MODEL", "llama3.2")
        mock_get_item.return_value = SAMPLE_ITEM
        mock_get_project.return_value = {"id": "proj1", "path": "/tmp/proj"}

        mock_provider = MockProvider(SAMPLE_JSON_RESPONSE)
        analyzer = aqs.QualityAnalyzer(provider=mock_provider)
        result = asyncio.run(analyzer.analyze("proj1", "SRS001", profile_name="standard"))

        assert mock_provider.models == ["llama3.2"]
        assert result.model_used == "llama3.2"


# ─── Pydantic-Modell-Validierung ─────────────────────────────────────────────

class TestPydanticModels:
    def test_ai_quality_issue_valid(self):
        issue = aqs.AiQualityIssue(
            category="Clarity",
            severity="high",
            description="Vagheit",
            suggestion="Konkretisieren",
        )
        assert issue.severity == "high"

    def test_ai_quality_score_optional_fields(self):
        score = aqs.AiQualityScore(overall=85)
        assert score.overall == 85
        assert score.clarity is None

    def test_ai_quality_result_full(self):
        result = aqs.AiQualityResult(
            requirement_uid="TST001",
            score=aqs.AiQualityScore(overall=90),
            issues=[],
            summary="Sehr gut.",
            model_used="claude-sonnet-4-6",
            profile_used="standard",
            timestamp="2026-03-23T00:00:00Z",
        )
        d = result.model_dump()
        assert d["requirement_uid"] == "TST001"
        assert d["score"]["overall"] == 90


# ─── Feste Regeln (V5) ────────────────────────────────────────────────────────

def _rules(text, profile=None, context=None, **item):
    item = {"text": text, "normative": True, **item}
    return [i.description for i in aqs.check_rules(item, profile or {}, context or {})]


class TestRules:
    def test_vague_term(self):
        found = _rules("Die Pumpe muss ausreichend fördern.")
        assert any("Unbestimmte Begriffe" in d and "ausreichend" in d for d in found)

    def test_profile_forbidden_keyword(self):
        found = _rules("Der Wert muss sofort vorliegen.", profile={"forbidden_keywords": ["sofort"]})
        assert any("sofort" in d for d in found)

    def test_ambiguous_conjunction(self):
        found = _rules("Das Signal x_soll bzw. x_ref muss begrenzt sein.")
        assert any("Mehrdeutige Verknüpfung" in d for d in found)

    def test_number_without_unit(self):
        assert any("Zahl ohne Einheit: '1'" in d for d in _rules("Die Simulation muss mit einem Zeitschritt von 1 rechnen."))

    def test_numbers_with_unit_count_or_designator_are_fine(self):
        for text in (
            "Das Ladegerät muss den Akku bei 25 °C in 90 min von 10 % auf 80 % laden.",
            "Der Zähler muss 3 Versuche zulassen.",
            "Der Regler muss mit Kp=2,0 arbeiten.",
            "Zeitstempel müssen ISO 8601 und Version 2.1 entsprechen.",
            "Der Motor M-77 muss abschalten.",
        ):
            assert not any("Zahl ohne Einheit" in d for d in _rules(text)), text

    def test_modal_verb_rule_low(self):
        # V14: Modalverb nur per Regel, Schwere low (kein Fehlalarm high/critical)
        issues = aqs.check_rules({"text": "Das System soll beim Start 2 s lang piepen.", "normative": True}, {}, {})
        assert [i.category for i in issues] == ["ModalVerb"]
        assert issues[0].severity == "low"
        assert _rules("Das System muss beim Start 2 s lang piepen.") == []
        assert _rules("Das System soll beim Start 2 s lang piepen.", normative=False) == []

    def test_prompt_does_not_mention_modal_verbs(self):
        prompt = aqs.PromptBuilder().build_system_prompt({})
        assert "Modalverb" not in prompt and "ModalVerb" not in prompt

    def test_missing_link_only_with_parent(self):
        assert any("Kein Link" in d for d in _rules("Das System muss starten.", context={"parent_document": "SYS"}))
        assert _rules("Das System muss starten.", context={"parent_document": None}) == []
        assert _rules("Das System muss starten.", context={"parent_document": "SYS"}, links=["SYS001"]) == []

    def test_missing_attributes(self):
        found = _rules("Das System muss starten.", context={"missing_attributes": ["Verifikationsmethode"]})
        assert any("Pflichtattribute fehlen: Verifikationsmethode" in d for d in found)

    def test_rule_findings_have_prefix(self):
        issues = aqs.check_rules({"text": "Die Pumpe muss ausreichend fördern.", "normative": True}, {}, {})
        assert issues and all(i.description.startswith(aqs.RULE_PREFIX) for i in issues)

    def test_drop_rule_duplicates(self):
        rule = aqs.AiQualityIssue(category="Clarity", severity="medium",
                                  description=aqs.RULE_PREFIX + "Unbestimmte Begriffe: 'ausreichend'",
                                  suggestion="x")
        dup = aqs.AiQualityIssue(category="Clarity", severity="low",
                                 description="Unbestimmte Begriffe wie 'ausreichend'", suggestion="y")
        own = aqs.AiQualityIssue(category="Completeness", severity="high",
                                 description="Es fehlt das Verhalten bei Sensorausfall", suggestion="z")
        assert aqs.drop_rule_duplicates([dup, own], [rule]) == [own]


class TestRulesV8:
    def test_solution_prescribed(self):
        found = _rules("Das Heizgerät muss einen PID-Regler mit Kp=3 einsetzen.")
        assert any("Lösungsvorgabe: „einen PID-Regler mit Kp=3 einsetzen“" in d for d in found)

    def test_no_solution_rule_without_means(self):
        assert not any("Lösungsvorgabe" in d for d in _rules("Die Pumpe muss 12 l/min fördern."))

    def test_passive_without_agent(self):
        found = _rules("Die Kennfelder werden vor Verwendung freigegeben.")
        assert any("Passiv ohne Verantwortlichen: „werden vor Verwendung freigegeben“" in d for d in found)

    def test_passive_with_agent_is_fine(self):
        assert not any("Passiv" in d for d in _rules("Die Daten werden täglich vom Administrator gesichert."))

    def test_ambiguous_conjunction_names_alternatives(self):
        found = _rules("Das Signal x_soll bzw. x_ref muss begrenzt sein.")
        assert any("'x_soll' bzw. 'x_ref'" in d for d in found)

    def test_informative_text_not_checked(self):
        assert _rules("Die Kennfelder werden vor Verwendung freigegeben.", normative=False) == []



# ─── Gesamtnote im Code (V19, L9 in #33) ──────────────────────────────────────


def _issue(category="Clarity", severity="medium"):
    return aqs.AiQualityIssue(category=category, severity=severity, description="d", suggestion="s")


def _score(c=80, t=80, k=80, s=80):
    return aqs.AiQualityScore(overall=0, clarity=c, testability=t, completeness=k, consistency=s)


class TestComputeScore:
    def test_no_issues_equal_weights_is_mean(self):
        result = aqs.compute_score(_score(80, 60, 70, 90), [], {})
        assert result.overall == 75
        assert result.min_score is None and result.passed is None

    def test_profile_weights_shift_base(self):
        profile = {"categories": {"clarity": {"weight": 3.0}, "testability": {"weight": 1.0},
                                  "completeness": {"weight": 0.0}, "consistency": {"weight": 0.0}}}
        assert aqs.compute_score(_score(100, 60, 0, 0), [], profile).overall == 90

    def test_disabled_category_ignored(self):
        profile = {"categories": {"testability": {"weight": 2.0, "enabled": False}}}
        assert aqs.compute_score(_score(80, 0, 80, 80), [], profile).overall == 80

    def test_penalty_by_severity(self):
        issues = [_issue(severity=s) for s in ("low", "medium", "high", "critical")]
        assert aqs.compute_score(_score(), issues, {}).overall == 80 - 2 - 5 - 10 - 20

    def test_unknown_severity_counts_as_medium(self):
        assert aqs.compute_score(_score(), [_issue(severity="???")], {}).overall == 75

    def test_penalty_weighted_by_category(self):
        profile = {"categories": {"testability": {"weight": 1.5}, "modal_verb": {"weight": 0.8}}}
        issues = [_issue("Testability", "high"), _issue("ModalVerb", "low")]
        # Grundnote 80 (alle Teilnoten gleich) − 15 − 1,6 = 63,4 → 63
        assert aqs.compute_score(_score(), issues, profile).overall == 63

    def test_rule_issues_count(self):
        rule = aqs.AiQualityIssue(category="Traceability", severity="high",
                                  description=aqs.RULE_PREFIX + "x", suggestion="")
        assert aqs.compute_score(_score(), [rule], {}).overall == 70

    def test_clamped_at_zero(self):
        assert aqs.compute_score(_score(10, 10, 10, 10), [_issue(severity="critical")], {}).overall == 0

    def test_passed_against_min_score(self):
        profile = {"min_score": 75}
        assert aqs.compute_score(_score(), [_issue(severity="medium")], profile).passed is True
        assert aqs.compute_score(_score(), [_issue(severity="high")], profile).passed is False

    def test_no_subscores_uses_llm_overall(self):
        score = aqs.AiQualityScore(overall=90)
        assert aqs.compute_score(score, [_issue(severity="low")], {}).overall == 88

    def test_real_profiles_load(self):
        for name in ("standard", "iso26262", "aspice", "do178c"):
            profile = aqs.load_profile(name)
            result = aqs.compute_score(_score(), [], profile)
            assert result.overall == 80 and result.passed == (80 >= profile["min_score"])

    def test_old_result_without_new_fields_loads(self):
        old = {"overall": 70, "clarity": 70}
        assert aqs.AiQualityScore(**old).passed is None
