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

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        self.calls.append((system_prompt, user_prompt))
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

        assert result.score.overall == 72
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

        assert result.score.overall == 26  # (20+5+30+50)/4 = 26.25 → 26
        assert len(result.issues) == 2


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
