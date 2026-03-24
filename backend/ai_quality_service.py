"""
KI-Qualitätsprüfung für Anforderungen – provider-agnostisch.

Unterstützte Anbieter (via Umgebungsvariablen):
  AI_PROVIDER=anthropic   → Anthropic Claude API (ANTHROPIC_API_KEY)
  AI_PROVIDER=openai      → OpenAI API (OPENAI_API_KEY)
  AI_PROVIDER=ollama      → Lokale KI via OpenAI-kompatiblem Endpunkt (kein Key nötig)
  AI_PROVIDER=openai_compatible → Beliebige OpenAI-kompatible API (AI_BASE_URL + OPENAI_API_KEY)

Kernklassen:
  - LlmProvider           – Protokoll: alle Provider implementieren complete()
  - AnthropicProvider     – Anthropic Claude API
  - OpenAiCompatibleProvider – OpenAI / Ollama / LM Studio / Groq / Mistral / vLLM
  - PromptBuilder         – baut System- und User-Prompt aus Item-Daten + Profil
  - QualityResultParser   – parst die JSON-Antwort zu Pydantic-Modellen
  - QualityAnalyzer       – orchestriert Analyse: Provider → Prompt → Parse → Persistenz
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from pydantic import BaseModel
from typing_extensions import Protocol

import doorstop_service as ds

# ─── Konfiguration ────────────────────────────────────────────────────────────

# Standard-Provider: anthropic (Rückwärtskompatibilität)
DEFAULT_PROVIDER = "anthropic"

# Standard-Modelle je Provider
DEFAULT_MODELS: Dict[str, str] = {
    "anthropic": "claude-sonnet-4-6",
    "openai": "gpt-4o-mini",
    "ollama": "llama3.2",
    "openai_compatible": "gpt-4o-mini",
}

DEFAULT_PROFILE = "standard"
REQUEST_TIMEOUT = 60.0

PROFILES_DIR = Path(__file__).parent.parent / "data" / "ai_quality_profiles"


def get_default_model() -> str:
    """Gibt das Standard-Modell für den konfigurierten Provider zurück."""
    provider = os.environ.get("AI_PROVIDER", DEFAULT_PROVIDER).lower()
    env_model = os.environ.get("AI_MODEL")
    if env_model:
        return env_model
    return DEFAULT_MODELS.get(provider, DEFAULT_MODELS["anthropic"])


# ─── Pydantic-Modelle ─────────────────────────────────────────────────────────


class AiQualityIssue(BaseModel):
    category: str   # 'Clarity' | 'Testability' | 'Completeness' | 'Consistency' | 'ModalVerb'
    severity: str   # 'low' | 'medium' | 'high' | 'critical'
    description: str
    suggestion: str


class AiQualityScore(BaseModel):
    overall: int
    clarity: Optional[int] = None
    testability: Optional[int] = None
    completeness: Optional[int] = None
    consistency: Optional[int] = None


class AiQualityResult(BaseModel):
    requirement_uid: str
    score: AiQualityScore
    issues: List[AiQualityIssue]
    summary: str
    model_used: str
    profile_used: str
    timestamp: str


class AiQualityRequest(BaseModel):
    profile: str = DEFAULT_PROFILE
    model: Optional[str] = None


# ─── LLM-Provider-Protokoll ───────────────────────────────────────────────────


class LlmProvider(Protocol):
    """Minimales Protokoll: jeder Provider implementiert genau diese Methode."""

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        """Sendet die Prompts an das LLM und gibt den Antwort-Text zurück."""
        ...


# ─── Provider-Implementierungen ───────────────────────────────────────────────


class AnthropicProvider:
    """Anthropic Claude API via anthropic-SDK."""

    def __init__(self, model: str) -> None:
        import anthropic as _anthropic  # lazy import

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY ist nicht gesetzt. "
                "Bitte in .env-Datei oder als Umgebungsvariable konfigurieren."
            )
        self.model = model
        self._client = _anthropic.Anthropic(api_key=api_key)

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        message = self._client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            timeout=REQUEST_TIMEOUT,
        )
        return message.content[0].text if message.content else "{}"


class OpenAiCompatibleProvider:
    """
    OpenAI-kompatibler Provider – deckt ab:
      - OpenAI API        (AI_PROVIDER=openai,  OPENAI_API_KEY=sk-...)
      - Ollama lokal      (AI_PROVIDER=ollama,  AI_BASE_URL=http://localhost:11434/v1)
      - LM Studio lokal   (AI_PROVIDER=openai_compatible, AI_BASE_URL=http://localhost:1234/v1)
      - Groq              (AI_PROVIDER=openai_compatible, AI_BASE_URL=https://api.groq.com/openai/v1)
      - Mistral, vLLM, ... analog
    """

    def __init__(self, model: str, base_url: Optional[str] = None) -> None:
        import openai as _openai  # lazy import

        provider = os.environ.get("AI_PROVIDER", "openai").lower()

        # API-Key: für lokale Provider wird "ollama" o.ä. als Dummy verwendet
        api_key = os.environ.get("OPENAI_API_KEY", "ollama" if provider == "ollama" else None)
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY ist nicht gesetzt. "
                "Bitte in .env-Datei oder als Umgebungsvariable konfigurieren."
            )

        # Base-URL: Ollama-Standard-Endpunkt falls nicht überschrieben
        resolved_base_url = base_url or os.environ.get("AI_BASE_URL")
        if not resolved_base_url and provider == "ollama":
            resolved_base_url = "http://localhost:11434/v1"

        self.model = model
        self._client = _openai.OpenAI(
            api_key=api_key,
            base_url=resolved_base_url,
            timeout=REQUEST_TIMEOUT,
        )

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        response = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1024,
        )
        return response.choices[0].message.content or "{}"


# ─── Provider-Factory ─────────────────────────────────────────────────────────


def create_provider(model: Optional[str] = None) -> LlmProvider:
    """
    Erzeugt den konfigurierten LLM-Provider anhand von Umgebungsvariablen.

    AI_PROVIDER  Beschreibung
    -----------  -----------------------------------------------
    anthropic    Anthropic Claude (Standard, rückwärtskompatibel)
    openai       OpenAI-API
    ollama       Lokale KI via Ollama (OpenAI-kompatibler Endpunkt)
    openai_compatible  Beliebige OpenAI-kompatible API (AI_BASE_URL setzen)
    """
    provider_name = os.environ.get("AI_PROVIDER", DEFAULT_PROVIDER).lower()
    used_model = model or get_default_model()

    if provider_name == "anthropic":
        return AnthropicProvider(model=used_model)
    elif provider_name in ("openai", "ollama", "openai_compatible", "lmstudio", "groq"):
        return OpenAiCompatibleProvider(
            model=used_model,
            base_url=os.environ.get("AI_BASE_URL"),
        )
    else:
        raise ValueError(
            f"Unbekannter AI_PROVIDER: '{provider_name}'. "
            f"Erlaubt: anthropic, openai, ollama, openai_compatible"
        )


def get_provider_info() -> Dict[str, Any]:
    """Gibt Konfigurations-Status des aktuellen Providers zurück (für Settings-Endpunkt)."""
    provider = os.environ.get("AI_PROVIDER", DEFAULT_PROVIDER).lower()
    model = get_default_model()

    if provider == "anthropic":
        key_set = bool(os.environ.get("ANTHROPIC_API_KEY"))
        key_var = "ANTHROPIC_API_KEY"
    else:
        key_set = bool(os.environ.get("OPENAI_API_KEY"))
        key_var = "OPENAI_API_KEY"

    return {
        "provider": provider,
        "api_key_configured": key_set,
        "api_key_env_var": key_var,
        "default_model": model,
        "base_url": os.environ.get("AI_BASE_URL"),
        "default_profile": DEFAULT_PROFILE,
        "available_profiles": list_profiles(),
    }


# ─── Profil-Laden ─────────────────────────────────────────────────────────────


def list_profiles() -> List[str]:
    """Gibt eine Liste aller verfügbaren Qualitätsprofile zurück."""
    if not PROFILES_DIR.exists():
        return [DEFAULT_PROFILE]
    return sorted(
        p.stem for p in PROFILES_DIR.glob("*.yml") if p.is_file()
    )


def load_profile(profile_name: str) -> Dict[str, Any]:
    """Lädt ein Qualitätsprofil aus der YAML-Datei."""
    profile_path = PROFILES_DIR / f"{profile_name}.yml"
    if not profile_path.exists():
        profile_path = PROFILES_DIR / "standard.yml"
    if not profile_path.exists():
        return {}
    with open(profile_path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


# ─── YAML-Persistenz ──────────────────────────────────────────────────────────


def get_quality_yaml_path(project_id: str, uid: str) -> Optional[Path]:
    """Gibt den Pfad zur Sidecar-YAML-Datei zurück (neben der Anforderungsdatei)."""
    project = ds.get_project(project_id)
    if not project:
        return None
    project_path = Path(project["path"])
    prefix = re.match(r"^([A-Za-z]+)", uid)
    if not prefix:
        return None
    doc_prefix = prefix.group(1).upper()
    doc_dir = project_path / doc_prefix
    if not doc_dir.exists():
        for d in project_path.iterdir():
            if d.is_dir() and d.name.upper() == doc_prefix:
                doc_dir = d
                break
    return doc_dir / f"{uid}.ai-quality.yml"


def load_quality_result(project_id: str, uid: str) -> Optional[AiQualityResult]:
    """Lädt das gespeicherte KI-Qualitätsergebnis aus der Sidecar-YAML."""
    path = get_quality_yaml_path(project_id, uid)
    if not path or not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not data:
        return None
    try:
        return AiQualityResult(**data)
    except Exception:
        return None


def save_quality_result(project_id: str, uid: str, result: AiQualityResult) -> Path:
    """Speichert das KI-Qualitätsergebnis als Sidecar-YAML."""
    path = get_quality_yaml_path(project_id, uid)
    if not path:
        raise ValueError(f"Konnte Speicherpfad für {uid} nicht bestimmen")
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(result.model_dump(), f, allow_unicode=True, default_flow_style=False)
    return path


# ─── Prompt-Bau ───────────────────────────────────────────────────────────────


class PromptBuilder:
    """Baut System- und User-Prompt aus Item-Daten und einem Qualitätsprofil."""

    SYSTEM_TEMPLATE = """\
Du bist ein erfahrener Requirements-Engineer (INCOSE CSEP) und Experte für \
normkonforme Anforderungen in der Luft- und Raumfahrt sowie Automobilindustrie.

{profile_context}

Analysiere die übergebene Anforderung auf folgende Qualitätsdimensionen:
1. Eindeutigkeit (Clarity) – keine Vagheit, kein 'schnell', 'ausreichend', 'möglichst'
2. Testbarkeit (Testability) – messbare Akzeptanzkriterien vorhanden
3. Vollständigkeit (Completeness) – Subjekt, Prädikat, Bedingung, Qualitätsmerkmal
4. Konsistenz (Consistency) – kein Widerspruch zu Kontext (Prefix, Links)
5. Modalverb-Konformität – 'muss'/'darf nicht' statt 'soll'/'sollte'/'kann'

Antworte AUSSCHLIESSLICH als valides JSON gemäß folgendem Schema:
{{
  "overall_score": <0-100>,
  "scores": {{
    "clarity": <0-100>,
    "testability": <0-100>,
    "completeness": <0-100>,
    "consistency": <0-100>
  }},
  "issues": [
    {{
      "category": "<Clarity|Testability|Completeness|Consistency|ModalVerb>",
      "severity": "<low|medium|high|critical>",
      "description": "<natürlichsprachige Problembeschreibung>",
      "suggestion": "<konkreter Verbesserungsvorschlag>"
    }}
  ],
  "summary": "<1 Satz Gesamtbewertung>"
}}

Gib NUR das JSON zurück, keinerlei Markdown-Formatierung oder Erklärungstext.\
"""

    def build_system_prompt(self, profile: Dict[str, Any]) -> str:
        profile_lines = []
        if profile.get("name"):
            profile_lines.append(f"Aktiviertes Qualitätsprofil: {profile['name']}")
        if profile.get("norm_references"):
            profile_lines.append(f"Normen: {', '.join(profile['norm_references'])}")
        if profile.get("forbidden_keywords"):
            kws = profile["forbidden_keywords"]
            profile_lines.append(f"Verbotene Schlüsselwörter: {', '.join(kws)}")
        if profile.get("min_score"):
            profile_lines.append(f"Mindest-Score: {profile['min_score']}")
        if profile.get("additional_criteria"):
            for c in profile["additional_criteria"]:
                profile_lines.append(f"Zusatzkriterium: {c}")

        profile_context = "\n".join(profile_lines) if profile_lines else ""
        return self.SYSTEM_TEMPLATE.format(profile_context=profile_context)

    def build_user_prompt(self, item: Dict[str, Any], profile: Dict[str, Any]) -> str:
        uid = item.get("uid", "?")
        text = item.get("text", "")
        normative = item.get("normative", False)
        links = item.get("links", [])
        custom_attrs = item.get("custom_attributes", {})

        m = re.match(r"^([A-Za-z]+)", uid)
        doc_prefix = m.group(1).upper() if m else "?"

        relevant_keys = {"safety_level", "asil", "priority", "criticality", "sil"}
        custom_info = {
            k: v for k, v in custom_attrs.items()
            if k.lower() in relevant_keys and v is not None and v != ""
        }

        lines = [
            f"UID: {uid}",
            f"Dokument: {doc_prefix}",
            f"Normativ: {'ja (muss-Anforderung)' if normative else 'nein (informativ)'}",
            f"Links: {len(links)} ({'keine' if not links else ', '.join(str(l) for l in links[:5])})",
        ]
        if custom_info:
            attr_str = ", ".join(f"{k}={v}" for k, v in custom_info.items())
            lines.append(f"Custom-Attr: {attr_str}")
        if profile.get("name"):
            lines.append(f"Qualitätsprofil: {profile['name']}")

        lines.extend(["", "Anforderungstext:", f"'{text}'", "",
                       "Prüfe diese Anforderung nach dem oben definierten Schema."])
        return "\n".join(lines)


# ─── Hilfsfunktionen ──────────────────────────────────────────────────────────


def _clamp(value: Any) -> Optional[int]:
    """Konvertiert einen Wert zu int und begrenzt ihn auf [0, 100]. None bleibt None."""
    if value is None:
        return None
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return None


# ─── Ergebnis-Parser ──────────────────────────────────────────────────────────


class QualityResultParser:
    """Parst die JSON-Antwort des LLM zu AiQualityResult."""

    def parse(self, raw_json: str, uid: str, model: str, profile_name: str) -> AiQualityResult:
        json_str = raw_json.strip()
        if "```" in json_str:
            match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", json_str)
            if match:
                json_str = match.group(1)

        data = json.loads(json_str)

        raw_scores = data.get("scores", {})
        clarity     = _clamp(raw_scores.get("clarity"))
        testability = _clamp(raw_scores.get("testability"))
        completeness = _clamp(raw_scores.get("completeness"))
        consistency  = _clamp(raw_scores.get("consistency"))

        # Overall immer aus Unterkriterien berechnen, nie blind dem LLM vertrauen
        sub = [s for s in (clarity, testability, completeness, consistency) if s is not None]
        if sub:
            overall = int(round(sum(sub) / len(sub)))
        else:
            # Fallback: LLM-Wert, aber geclampt
            overall = _clamp(data.get("overall_score", 0)) or 0

        score = AiQualityScore(
            overall=overall,
            clarity=clarity,
            testability=testability,
            completeness=completeness,
            consistency=consistency,
        )

        issues = [
            AiQualityIssue(
                category=issue.get("category", ""),
                severity=issue.get("severity", "medium"),
                description=issue.get("description", ""),
                suggestion=issue.get("suggestion", ""),
            )
            for issue in data.get("issues", [])
        ]

        return AiQualityResult(
            requirement_uid=uid,
            score=score,
            issues=issues,
            summary=data.get("summary", ""),
            model_used=model,
            profile_used=profile_name,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )


# ─── Haupt-Analyzer ───────────────────────────────────────────────────────────


class QualityAnalyzer:
    """Orchestriert die KI-Analyse: Provider → Prompt → Parse → YAML-Persistenz."""

    def __init__(self, provider: Optional[LlmProvider] = None) -> None:
        # Erlaubt Injection eines Providers (z.B. für Tests)
        self._provider = provider or create_provider()
        self._prompt_builder = PromptBuilder()
        self._parser = QualityResultParser()

    async def analyze(
        self,
        project_id: str,
        uid: str,
        profile_name: str = DEFAULT_PROFILE,
        model: Optional[str] = None,
    ) -> AiQualityResult:
        """Analysiert eine Anforderung und speichert das Ergebnis als Sidecar-YAML."""
        item = ds.get_item(project_id, uid)
        if not item:
            raise ValueError(f"Anforderung {uid} nicht gefunden")

        if item.get("header"):
            raise ValueError(
                f"{uid} ist eine Überschrift (header=true) – keine Anforderungsanalyse möglich"
            )

        text = (item.get("text") or "").strip()
        if len(text) < 10:
            raise ValueError(
                f"Anforderungstext zu kurz ({len(text)} Zeichen). Mindestens 10 Zeichen erforderlich."
            )

        # Profil laden; Modell: Anfrage > Profil > Provider-Standard
        profile = load_profile(profile_name)
        if model:
            used_model = model
        elif profile.get("model"):
            # Profil-Modell nur verwenden wenn es zum konfigurierten Provider passt
            # (Anthropic-Modelle beginnen mit "claude-", OpenAI mit "gpt-" usw.)
            provider_name = os.environ.get("AI_PROVIDER", DEFAULT_PROVIDER).lower()
            profile_model = profile["model"]
            if _model_matches_provider(profile_model, provider_name):
                used_model = profile_model
            else:
                used_model = get_default_model()
        else:
            used_model = get_default_model()

        system_prompt = self._prompt_builder.build_system_prompt(profile)
        user_prompt = self._prompt_builder.build_user_prompt(item, profile)

        # LLM aufrufen (synchron – im FastAPI-Kontext per run_in_executor)
        raw = self._provider.complete(system_prompt, user_prompt)
        result = self._parser.parse(raw, uid, used_model, profile_name)

        save_quality_result(project_id, uid, result)
        return result


def _model_matches_provider(model_name: str, provider: str) -> bool:
    """Prüft ob ein Modellname zum konfigurierten Provider passt."""
    model_lower = model_name.lower()
    if provider == "anthropic":
        return model_lower.startswith("claude")
    if provider == "openai":
        return model_lower.startswith(("gpt-", "o1", "o3", "o4"))
    # Für ollama/openai_compatible: immer akzeptieren (Nutzer weiß was er tut)
    return True


# ─── Modul-Level Singleton (lazy) ─────────────────────────────────────────────

_analyzer: Optional[QualityAnalyzer] = None


def get_analyzer() -> QualityAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = QualityAnalyzer()
    return _analyzer
