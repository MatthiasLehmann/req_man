"""
KI-Qualitätsprüfung für Anforderungen – provider-agnostisch.

Unterstützte Anbieter (via Umgebungsvariablen):
  AI_PROVIDER=anthropic   → Anthropic Claude API (ANTHROPIC_API_KEY)
  AI_PROVIDER=openai      → OpenAI API (OPENAI_API_KEY)
  AI_PROVIDER=ollama      → Lokale KI via OpenAI-kompatiblem Endpunkt (kein Key nötig)
  AI_PROVIDER=openai_compatible → Beliebige OpenAI-kompatible API (AI_BASE_URL + OPENAI_API_KEY)

Betriebsparameter (optional, ohne Angabe gelten die Standardwerte):
  AI_TIMEOUT=60        Zeitlimit je Aufruf in Sekunden
  AI_MAX_TOKENS=2048   maximale Antwortlänge in Token
  AI_NUM_CTX=<n>       Kontextlänge, nur bei AI_PROVIDER=ollama (Standard: Ollama-Standard)
  AI_MAX_RETRIES=<n>   automatische SDK-Wiederholungen (Standard: SDK-Standard 2)
  AI_TEMPERATURE=0, AI_SEED=42 (AI_SEED=none schaltet den Seed ab)

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
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml
from pydantic import BaseModel
from typing_extensions import Protocol

import doorstop_service as ds
from doorstop.core.types import UID
from doorstop import DoorstopError

logger = logging.getLogger(__name__)


def _uid_to_prefix(uid: str) -> Optional[str]:
    """Extrahiert das Dokument-Präfix aus einer UID über die doorstop-Grammatik.

    Präfixe können Zahlen, '_', '-' und '.' enthalten (z. B. "SYS_A-001"),
    ein simples ^[A-Za-z]+ reicht daher nicht.
    """
    try:
        return str(UID(uid).prefix)
    except DoorstopError:
        return None


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
# Standard-Zeitlimit je Aufruf in Sekunden; per AI_TIMEOUT überschreibbar (G1 in #31, L12 in #33)
REQUEST_TIMEOUT = 60.0

# Sampling: temperature 0 und fester Seed, damit gleiche Eingaben möglichst
# gleiche Ergebnisse liefern (L10 in #33). Per Umgebungsvariable überschreibbar.
DEFAULT_TEMPERATURE = 0.0
DEFAULT_SEED = 42

# Mehrere Befunde mit vollständig umformulierter Anforderung brauchen mehr als
# 1024 Token, sonst wird das JSON abgeschnitten (G3 in #31, L12 in #33).
MAX_TOKENS = 2048

PROFILES_DIR = Path(__file__).parent.parent / "data" / "ai_quality_profiles"

# Protokoll je Analyse (L15 in #33, H2 in #31): System-Prompt, User-Prompt, Rohantwort,
# Modell, Dauer und Regelbefunde in <UID>.ai-quality-log.yml neben dem Sidecar.
# Standard an; AI_QUALITY_PROTOCOL=0/false/off/no/nein schaltet es ab.
PROTOCOL_ENV = "AI_QUALITY_PROTOCOL"
PROTOCOL_SUFFIX = ".ai-quality-log.yml"


def get_default_model() -> str:
    """Gibt das Standard-Modell für den konfigurierten Provider zurück."""
    provider = os.environ.get("AI_PROVIDER", DEFAULT_PROVIDER).lower()
    env_model = os.environ.get("AI_MODEL")
    if env_model:
        return env_model
    return DEFAULT_MODELS.get(provider, DEFAULT_MODELS["anthropic"])


def get_temperature() -> float:
    """Sampling-Temperatur aus AI_TEMPERATURE, Standard 0 (reproduzierbar)."""
    try:
        return float(os.environ.get("AI_TEMPERATURE", DEFAULT_TEMPERATURE))
    except ValueError:
        return DEFAULT_TEMPERATURE


def protocol_enabled() -> bool:
    """True, solange AI_QUALITY_PROTOCOL nicht auf 0/false/off/no/nein steht."""
    return os.environ.get(PROTOCOL_ENV, "1").strip().lower() not in ("0", "false", "off", "no", "nein")


def get_seed() -> Optional[int]:
    """Seed aus AI_SEED, Standard 42. AI_SEED=none schaltet ihn ab."""
    raw = os.environ.get("AI_SEED", str(DEFAULT_SEED))
    if raw.lower() in ("", "none", "off"):
        return None
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_SEED


# ─── Betriebsparameter (L12 in #33) ───────────────────────────────────────────
# Ohne gesetzte Variable gelten die bisherigen Werte. Ungültige oder nicht
# positive Werte fallen auf den Standard zurück. Die Standards werden erst beim
# Aufruf gelesen, damit Tests und das Messframework REQUEST_TIMEOUT / MAX_TOKENS
# zur Laufzeit setzen können.


def _positive_env(name: str, cast: Any) -> Optional[Any]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return None
    try:
        value = cast(raw)
    except ValueError:
        return None
    return value if value > 0 else None


def get_request_timeout() -> float:
    """Zeitlimit je KI-Aufruf in Sekunden aus AI_TIMEOUT, Standard REQUEST_TIMEOUT (60)."""
    value = _positive_env("AI_TIMEOUT", float)
    return value if value is not None else REQUEST_TIMEOUT


_call_limits = threading.local()


def get_max_tokens() -> int:
    """Maximale Antwortlänge in Token aus AI_MAX_TOKENS, Standard MAX_TOKENS (2048).
    V28: Ein kurzer Zusatzaufruf kann für seinen Thread ein kleineres Limit setzen."""
    override = getattr(_call_limits, "max_tokens", None)
    if override:
        return override
    value = _positive_env("AI_MAX_TOKENS", int)
    return value if value is not None else MAX_TOKENS


def get_num_ctx() -> Optional[int]:
    """Kontextlänge für Ollama (num_ctx) aus AI_NUM_CTX.

    Standard: nicht gesetzt → es wird nichts mitgeschickt, Ollama nutzt seinen
    eigenen Standard (wie bisher). Andere Provider kennen den Parameter nicht.
    """
    return _positive_env("AI_NUM_CTX", int)


def get_max_retries() -> Optional[int]:
    """Automatische Wiederholungen des SDK (gleiche Parameter) aus AI_MAX_RETRIES.

    Standard: nicht gesetzt → SDK-Standard (2), Verhalten wie bisher. 0 schaltet sie ab.
    """
    raw = os.environ.get("AI_MAX_RETRIES", "").strip()
    try:
        value = int(raw) if raw else None
    except ValueError:
        return None
    return value if value is not None and value >= 0 else None


class AiProviderError(RuntimeError):
    """Klarer Fehler des KI-Anbieters (Zeitüberschreitung, keine Verbindung).

    Bewusst kein ValueError: der Router meldet ihn als 502 mit dieser Meldung.
    """


# Kennzeichen einer Fehlermeldung, die auf einen nicht unterstützten Parameter hinweist
_UNSUPPORTED_MARKERS = (
    "unsupported", "not supported", "unknown", "unrecognized", "unexpected",
    "invalid", "not allowed", "nicht unterstützt", "extra inputs", "extra_forbidden",
)
# Parameter, auf die der gezielte Rückfall verzichten darf
_OPTIONAL_PARAMS = ("response_format", "seed")


def _unsupported_params(error: Exception) -> List[str]:
    """Welche optionalen Parameter laut Fehlermeldung nicht unterstützt werden."""
    text = str(error)
    body = getattr(error, "body", None)
    if body is not None:
        text += " " + str(body)
    text = text.lower()
    if not any(marker in text for marker in _UNSUPPORTED_MARKERS):
        return []
    return [p for p in _OPTIONAL_PARAMS if p in text]


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
    # V19 (L9): Mindestnote des Profils und ob die Gesamtnote sie erreicht
    min_score: Optional[int] = None
    passed: Optional[bool] = None


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

    def complete(self, system_prompt: str, user_prompt: str, model: Optional[str] = None) -> str:
        """Sendet die Prompts an das LLM und gibt den Antwort-Text zurück.

        ``model`` überschreibt das beim Erzeugen gesetzte Modell für diesen Aufruf.
        """
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
        client_args: Dict[str, Any] = {"api_key": api_key}
        retries = get_max_retries()
        if retries is not None:
            client_args["max_retries"] = retries
        self._client = _anthropic.Anthropic(**client_args)

    def complete(self, system_prompt: str, user_prompt: str, model: Optional[str] = None) -> str:
        import anthropic as _anthropic

        timeout = get_request_timeout()
        try:
            message = self._client.messages.create(
                model=model or self.model,
                max_tokens=get_max_tokens(),
                # Anthropic kennt keinen Seed und kein num_ctx, nur die Temperatur
                temperature=get_temperature(),
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
                timeout=timeout,
            )
        except _anthropic.APITimeoutError as e:
            raise AiProviderError(
                f"Zeitüberschreitung: keine Antwort des KI-Modells nach {timeout:g} s (AI_TIMEOUT)"
            ) from e
        except _anthropic.APIConnectionError as e:
            raise AiProviderError(f"Keine Verbindung zum KI-Anbieter: {e}") from e
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

        # API-Key: für lokale Provider wird ein Dummy-Wert verwendet.
        # or-Verknüpfung behandelt leere Strings ("", "not-set") korrekt.
        raw_key = os.environ.get("OPENAI_API_KEY", "")
        local_providers = ("ollama", "openai_compatible", "lmstudio")
        api_key = raw_key if raw_key and raw_key != "not-set" else (
            "ollama" if provider in local_providers else None
        )
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
        self._provider_name = provider
        client_args: Dict[str, Any] = {
            "api_key": api_key,
            "base_url": resolved_base_url,
            "timeout": get_request_timeout(),
        }
        retries = get_max_retries()
        if retries is not None:
            client_args["max_retries"] = retries
        self._client = _openai.OpenAI(**client_args)

    def _request_args(self, system_prompt: str, user_prompt: str, used_model: str) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "model": used_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": get_max_tokens(),
            # response_format erzwingt valides JSON (Ollama + OpenAI unterstützen das)
            "response_format": {"type": "json_object"},
            "temperature": get_temperature(),
            "timeout": get_request_timeout(),
        }
        seed = get_seed()
        if seed is not None:
            args["seed"] = seed
        num_ctx = get_num_ctx()
        # num_ctx versteht nur Ollama (Feld "options"); anderen Anbietern nichts Unbekanntes schicken
        if num_ctx is not None and getattr(self, "_provider_name", "") == "ollama":
            args["extra_body"] = {"options": {"num_ctx": num_ctx}}
        return args

    def complete(self, system_prompt: str, user_prompt: str, model: Optional[str] = None) -> str:
        import openai as _openai

        args = self._request_args(system_prompt, user_prompt, model or self.model)
        try:
            response = self._create(args)
        except (_openai.BadRequestError, _openai.UnprocessableEntityError) as e:
            # Gezielter Rückfall (L12): nur wenn der Anbieter response_format oder seed
            # ausdrücklich ablehnt. Nur diesen Parameter weglassen, Temperatur,
            # Seed (falls nicht betroffen) und alle übrigen Einstellungen bleiben.
            dropped = [p for p in _unsupported_params(e) if p in args]
            if not dropped:
                raise
            for param in dropped:
                args.pop(param)
            response = self._create(args)
        return response.choices[0].message.content or "{}"

    def _create(self, args: Dict[str, Any]) -> Any:
        """Ein Aufruf; Zeitüberschreitung und Verbindungsfehler werden NICHT erneut
        mit anderen Parametern versucht, sondern als klarer Fehler gemeldet."""
        import openai as _openai

        try:
            return self._client.chat.completions.create(**args)
        except _openai.APITimeoutError as e:
            raise AiProviderError(
                f"Zeitüberschreitung: keine Antwort des KI-Modells nach "
                f"{args['timeout']:g} s (AI_TIMEOUT)"
            ) from e
        except _openai.APIConnectionError as e:
            raise AiProviderError(f"Keine Verbindung zum KI-Anbieter: {e}") from e


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
    prefix = _uid_to_prefix(uid)
    if not prefix:
        return None
    doc_prefix = prefix.upper()
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


def save_quality_result(
    project_id: str,
    uid: str,
    result: AiQualityResult,
    protocol: Optional[Dict[str, Any]] = None,
) -> Path:
    """Speichert das KI-Qualitätsergebnis als Sidecar-YAML.

    Mit ``protocol`` (und eingeschaltetem Protokoll) zusätzlich das Protokoll
    der Analyse als ``<UID>.ai-quality-log.yml`` daneben. Das Sidecar selbst
    bleibt unverändert.
    """
    path = get_quality_yaml_path(project_id, uid)
    if not path:
        raise ValueError(f"Konnte Speicherpfad für {uid} nicht bestimmen")
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(result.model_dump(), f, allow_unicode=True, default_flow_style=False)
    if protocol is not None and protocol_enabled():
        save_quality_protocol(path.with_name(f"{uid}{PROTOCOL_SUFFIX}"), protocol)
    return path


class _ProtocolDumper(yaml.SafeDumper):
    """Mehrzeilige Texte (Prompts, Rohantwort) als lesbare Blöcke (|)."""


def _str_representer(dumper: yaml.SafeDumper, data: str) -> yaml.ScalarNode:
    style = "|" if "\n" in data else None
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)


_ProtocolDumper.add_representer(str, _str_representer)


def save_quality_protocol(path: Path, protocol: Dict[str, Any]) -> Optional[Path]:
    """Schreibt das Protokoll einer Analyse. Fehler beim Schreiben brechen die
    Analyse nie ab (das Ergebnis ist dann schon gespeichert)."""
    try:
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(protocol, f, Dumper=_ProtocolDumper, allow_unicode=True,
                      default_flow_style=False, sort_keys=False, width=1_000_000)
        return path
    except Exception:
        return None


def get_quality_protocol_path(project_id: str, uid: str) -> Optional[Path]:
    """Pfad der Protokolldatei <UID>.ai-quality-log.yml (neben dem Sidecar)."""
    path = get_quality_yaml_path(project_id, uid)
    return path.with_name(f"{uid}{PROTOCOL_SUFFIX}") if path else None


def load_quality_protocol(project_id: str, uid: str) -> Optional[Dict[str, Any]]:
    """Lädt das Protokoll der letzten Analyse, falls vorhanden."""
    path = get_quality_protocol_path(project_id, uid)
    if not path or not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or None


# ─── Prompt-Bau ───────────────────────────────────────────────────────────────


class PromptBuilder:
    """Baut System- und User-Prompt aus Item-Daten und einem Qualitätsprofil."""

    # V7: zusätzlich ein festgelegter, zurückhaltender Schweregrad (in V4 war fast
    # jeder Befund "high", auch bei korrigierten Anforderungen; E3 in #31).
    # Prüfliste statt allgemeiner Qualitätsdimensionen, definierte Notenskala und
    # Beispiele aus fachfremden Bereichen (L5 in #33); jeder Befund mit wörtlicher
    # Textstelle und umformulierter Anforderung (L11 in #33, Teil im Prompt).
    SYSTEM_TEMPLATE = """\
Du bist ein erfahrener Requirements-Engineer (INCOSE CSEP) und prüfst einzelne Anforderungen \
aus der Luft- und Raumfahrt sowie der Automobilindustrie.

{profile_context}

Gehe die Anforderung Punkt für Punkt durch und melde JEDEN zutreffenden Fehler als eigenen Befund:
1. Vage oder subjektive Begriffe ohne Maßstab (z. B. „geeignet“, „regelmäßig“, „robust“, „ordnungsgemäß“, \
„viele“, „nahe“)
2. Zahl oder Größe ohne Einheit, fehlende Toleranz, fehlender Werte- oder Gültigkeitsbereich
3. Zwei verschiedene Angaben für dieselbe Sache im selben Text (zwei Werte, zwei Namen, zwei Bezugssysteme, „bzw.“)
4. Unvollständig: Wer ist verantwortlich, wann oder wie oft, unter welcher Bedingung, mit welchem Ergebnis; \
fehlendes Verhalten bei Fehlern, Grenzwerten oder ungültigen Eingaben
5. Lösungsvorgabe statt Anforderung: Der Text schreibt vor, WIE etwas umgesetzt wird (Werkzeug, Verfahren, \
Algorithmus, Parameterwerte), statt WAS erreicht werden muss
6. Nicht prüfbar: kein objektives Abnahme- oder Prüfkriterium

Schweregrad: "high" nur, wenn die Anforderung so nicht umsetzbar oder nicht prüfbar ist. "medium", wenn \
eine Angabe fehlt oder unklar ist, die Anforderung aber prüfbar bleibt. "low" für Formulierung und Stil. \
Nennt die Anforderung schon Wert, Einheit und Bedingung, ist ein Befund höchstens "medium". \
Im Zweifel den niedrigeren Schweregrad wählen.

Ziel ist, den Autor auf den Fehler hinzuweisen, nicht die Anforderung neu zu schreiben. \
Jeder Befund nennt in "description" in EINEM kurzen Satz die betroffene Textstelle wörtlich in \
Anführungszeichen und was daran fehlt oder falsch ist. \
"suggestion" ist optional: höchstens ein kurzer Halbsatz, der sich nur auf die betroffenen ein bis zwei \
Wörter bezieht und sagt, was dort zu tun ist (z. B. was angegeben, ergänzt oder festgelegt werden muss). \
Formuliere nie die ganze Anforderung um und schlage keine konkreten Werte, Einheiten oder Namen vor, die \
nicht im Text stehen. Schreibe den Vorschlag nur, wenn er sicher richtig ist; sonst lass "suggestion" leer (""). \
Melde keine Befunde, die du nicht begründen kannst. \
Hat die Anforderung keinen Fehler, bleibt "issues" leer.

Noten je Dimension: 90–100 keine Mängel, 70–89 kleine Mängel, 40–69 mindestens ein wesentlicher Mangel, \
0–39 so nicht verwendbar.

Die Beispiele zeigen nur das Format. Übernimm daraus keine Formulierungen, Werte oder Einheiten.

Beispiel 1 – Anforderung: 'Die Bahnsteigtür soll sich zügig über den Spindelantrieb SP-4 öffnen.'
Befunde: [{{"category": "Clarity", "severity": "high", \
"description": "„zügig“ ist ohne Maßstab nicht prüfbar.", \
"suggestion": "Öffnungszeit mit Wert und Einheit angeben."}}, \
{{"category": "Completeness", "severity": "medium", \
"description": "„über den Spindelantrieb SP-4“ legt die Umsetzung fest.", \
"suggestion": ""}}]

Beispiel 2 – Anforderung: 'Das Heizungssteuergerät soll die Raumtemperatur mit einem PID-Regler mit Kp=3 regeln.'
Befund: {{"category": "Completeness", "severity": "high", \
"description": "„mit einem PID-Regler mit Kp=3“ gibt die Lösung vor, das geforderte Verhalten fehlt.", \
"suggestion": ""}}

Beispiel 3 – Anforderung: 'Die Pumpe muss bei 20 °C ± 2 K mindestens 12 l/min fördern.' → "issues": []

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
      "category": "<Clarity|Testability|Completeness|Consistency>",
      "severity": "<low|medium|high|critical>",
      "description": "<„Textstelle“: was fehlt oder falsch ist, ein Satz>",
      "suggestion": "<Halbsatz zu den betroffenen Wörtern, nur wenn sicher, sonst leer>"
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

        prefix = _uid_to_prefix(uid)
        doc_prefix = prefix.upper() if prefix else "?"

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


# ─── Feste Regeln ─────────────────────────────────────────────────────────────

# Eindeutig entscheidbare Prüfungen laufen im Code statt in der KI (L6 in #33).
# Die Befunde sind reproduzierbar und stehen vor den KI-Befunden. Gegenüber V3
# ohne Modalverb-Regel (meldete 64 % der korrigierten Anforderungen) und ohne
# Hinweis an die KI (V3: die KI wiederholte die Regelbefunde nur).
RULE_PREFIX = "Regelprüfung: "

# Unbestimmte Begriffe nach ISO/IEC/IEEE 29148 (5.2.7) und INCOSE Guide to Writing
# Requirements (R7 vage Begriffe, R8 Schlupflöcher, R26 Absolutes), gilt für alle Profile.
VAGUE_TERMS = (
    "angemessen", "ausreichend", "hinreichend", "geeignet", "geeigneten", "geeignetem", "geeigneter",
    "regelmäßig", "ordnungsgemäß", "robust", "zuverlässig", "schnell", "zügig", "einfach",
    "benutzerfreundlich", "flexibel", "effizient", "optimal", "möglichst", "nach Möglichkeit",
    "falls möglich", "bei Bedarf", "gegebenenfalls", "ggf.", "eventuell", "etwa", "ungefähr", "ca.",
    "nahe", "viele", "wenige", "einige", "mehrere", "relevant", "relevanten", "relevante",
    "im Wesentlichen", "weitgehend", "gut", "alle denkbaren", "usw.", "etc.", "und so weiter",
)

# „bzw.“ und „und/oder“ lassen offen, welche von zwei Angaben gilt (INCOSE R15/R19).
AMBIGUOUS_CONJUNCTIONS = ("bzw.", "beziehungsweise", "und/oder")

# Verben, mit denen eine Anforderung ein Mittel statt eines Ziels vorschreibt (INCOSE R31 „solution free“)
SOLUTION_VERBS = ("verwenden", "verwendet", "einsetzen", "eingesetzt", "nutzen", "genutzt", "benutzen", "benutzt",
                  "implementieren", "implementiert", "einbauen", "eingebaut")
MODAL_VERBS = ("soll", "sollen", "sollte", "sollten", "muss", "müssen", "darf", "dürfen", "kann", "können")
WEAK_MODAL_VERBS = ("soll", "sollen", "sollte", "sollten", "kann", "können", "könnte", "könnten",
                    "should", "may", "might", "could")
STRONG_MODAL_VERBS = ("muss", "müssen", "darf", "dürfen", "shall", "must")

# V22: Tippfehler beim Modalverb. Nur geprüft, wenn der Text gar kein Modalverb enthält; echte Wörter mit einem
# Buchstaben Abstand („voll“, „Zoll“, „toll“, „Kuss“ …) sind ausgenommen.
_MODAL_TARGETS = ("soll", "sollen", "sollte", "muss", "müssen", "darf", "dürfen", "kann", "können")
_NOT_TYPOS = {"voll", "toll", "zoll", "moll", "roll", "kuss", "fuss", "nuss", "russ", "bus", "mus", "dorf", "darm",
              "kamm", "kahn", "kann", "miss", "mist", "wann", "dann", "mann", "bann", "tann", "sole", "solo", "rollen", "wollen",
              "sollen", "zollen", "mussten", "dürfte", "durfte", "muster", "musst", "hallo", "soll", "bald", "fall"}


def _edit1(a: str, b: str) -> bool:
    """True, wenn a und b genau eine Einfügung, Löschung, Ersetzung oder Vertauschung auseinanderliegen."""
    if a == b or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        diff = [i for i in range(len(a)) if a[i] != b[i]]
        return len(diff) == 1 or (len(diff) == 2 and diff[1] == diff[0] + 1
                                  and a[diff[0]] == b[diff[1]] and a[diff[1]] == b[diff[0]])
    kurz, lang = (a, b) if len(a) < len(b) else (b, a)
    return any(lang[:i] + lang[i + 1:] == kurz for i in range(len(lang)))


def _modal_typo(text: str) -> Optional[tuple]:
    """Erstes Wort, das ein vertipptes Modalverb sein dürfte: (Wort, gemeintes Modalverb) oder None."""
    for w in re.findall(r"\w+", text):
        lw = w.lower()
        if len(lw) < 3 or lw in _NOT_TYPOS:
            continue
        for m in _MODAL_TARGETS:
            if _edit1(lw, m):
                return w, m
    return None

# Passiv ohne Handelnden (INCOSE R2: aktiv formulieren, Verantwortlichen nennen); das Partizip darf eine
# trennbare Vorsilbe haben („freigegeben“, „eingesetzt“)
_PASSIVE = re.compile(r"\b(wird|werden|wurde|wurden)\b(?:\s+\S+){0,6}?\s+(\w*ge\w+(?:t|en)|\w+iert)\b", re.IGNORECASE)
_AGENT = re.compile(r"\b(durch|von|vom|seitens)\s", re.IGNORECASE)

# Einheiten, nach denen eine Zahl als bemaßt gilt
UNITS = (
    "%", "‰", "°", "°C", "K", "s", "ms", "µs", "us", "ns", "min", "h", "d", "Hz", "kHz", "MHz", "GHz",
    "m", "mm", "cm", "km", "µm", "m/s", "m/s²", "m/s^2", "km/h", "kn", "ft", "g", "kg", "t", "N", "kN",
    "Nm", "Pa", "kPa", "MPa", "bar", "mbar", "V", "mV", "kV", "A", "mA", "W", "kW", "MW", "Wh", "kWh",
    "J", "kJ", "l", "ml", "l/min", "dB", "dBm", "rad", "deg", "U/min", "rpm", "bit", "Bit", "B", "Byte",
    "kB", "MB", "GB", "Bit/s", "kbit/s", "Mbit/s", "fps", "Zeichen", "Pixel", "px", "lx", "cd", "mol",
)

_NUMBER = re.compile(r"(?<![\w=.,/-])(\d+(?:[.,]\d+)?)(?![\w.,]*\d)\s*([^\s,;.)]*)")

# Präpositionen, nach denen eine Zahl eine Größe ist, und Wörter, die einen Bereich fortsetzen
MEASURE_PREPOSITIONS = ("von", "mit", "auf", "um", "bei", "nach", "innerhalb", "binnen", "alle", "je", "pro",
                        "unter", "über", "maximal", "minimal", "mindestens", "höchstens", "bis")
RANGE_WORDS = ("bis", "und", "oder", "/", "…", "...")


def _find_words(text: str, words: Any) -> List[str]:
    """Findet ganze Wörter (ohne Groß-/Kleinschreibung), in Reihenfolge der Liste."""
    found = []
    for word in words:
        pattern = r"(?<!\w)" + re.escape(str(word)) + r"(?!\w)"
        if re.search(pattern, text, re.IGNORECASE):
            found.append(str(word))
    return found


def _numbers_without_unit(text: str) -> List[str]:
    """Zahlen ohne Einheit, bewusst vorsichtig: nur eine Zahl direkt nach einer
    Präposition wie „von“ oder „mit“ („Zeitschritt von 1“), auf die weder eine
    Einheit noch ein Bereichsende („0 bis 20 km“) folgt. Anzahlen („2000
    Iterationen“), Zuweisungen („κ = 1,4“), Bezeichner („M-77“, „6-DOF“) und
    Norm- oder Versionsnummern zählen nicht."""
    found = []
    for match in _NUMBER.finditer(text):
        number, following = match.group(1), match.group(2)
        before = text[:match.start()].split()
        previous = before[-1] if before else ""
        if previous.lower() not in MEASURE_PREPOSITIONS:
            continue
        if following in UNITS or following.rstrip("²³") in UNITS:
            continue
        if following[:1].isupper() or following[:1] in "-–×x." or following.lower() in RANGE_WORDS:
            continue
        found.append(number)
    return found


def _alternatives(text: str) -> List[str]:
    """Die Wörter direkt vor und nach „bzw.“ bzw. „und/oder“, z. B. „acc_command bzw. a_cmd“."""
    found = []
    for match in re.finditer(r"(\S+)\s+(bzw\.|beziehungsweise|und/oder)\s+(\S+)", text, re.IGNORECASE):
        found.append(f"'{match.group(1)}' {match.group(2)} '{match.group(3).rstrip('.,;')}'")
    return found


def _prescribed_means(text: str) -> Optional[str]:
    """Der Teil zwischen Modalverb und Verb wie „verwenden“, z. B. „den Solver X … verwenden“."""
    words = text.rstrip(".").split()
    lower = [w.lower().strip(",;") for w in words]
    for i, word in enumerate(lower):
        if word in SOLUTION_VERBS:
            start = max((j for j in range(i) if lower[j] in MODAL_VERBS), default=-1)
            if start >= 0 and i - start > 1:
                return " ".join(words[start + 1:i + 1])
    return None


def _passive_without_agent(text: str) -> Optional[str]:
    """Passivsatz ohne „durch“/„von“, z. B. „werden vor Verwendung freigegeben“."""
    match = _PASSIVE.search(text)
    if match and not _AGENT.search(text):
        return match.group(0)
    return None


def check_rules(item: Dict[str, Any], profile: Dict[str, Any], context: Dict[str, Any]) -> List[AiQualityIssue]:
    """Prüft feste Regeln: unbestimmte und verbotene Begriffe, mehrdeutige
    Verknüpfungen, Zahlen ohne Einheit, fehlender Link nach oben und fehlende
    Pflichtattribute; V14 zusätzlich schwache Modalverben (Schwere low)."""
    text = item.get("text") or ""
    normative = bool(item.get("normative", False))
    issues: List[AiQualityIssue] = []

    terms = list(dict.fromkeys(list(profile.get("forbidden_keywords") or []) + list(VAGUE_TERMS)))
    vague = _find_words(text, terms)
    if vague:
        issues.append(AiQualityIssue(
            category="Clarity",
            severity="medium",
            description=RULE_PREFIX + "Unbestimmte Begriffe: " + ", ".join(f"'{w}'" for w in vague),
            suggestion="Begriffe durch eindeutige, messbare Angaben ersetzen (Wert, Einheit, Toleranz).",
        ))

    ambiguous = _find_words(text, AMBIGUOUS_CONJUNCTIONS)
    if ambiguous:
        issues.append(AiQualityIssue(
            category="Consistency",
            severity="medium",
            description=RULE_PREFIX + "Mehrdeutige Verknüpfung: "
                        + (", ".join(_alternatives(text)) or ", ".join(f"'{w}'" for w in ambiguous))
                        + " lässt offen, welche Angabe gilt",
            suggestion="Genau eine Angabe festlegen (ein Wert, ein Name, ein Bezugssystem) "
                       "oder die Fälle als getrennte Anforderungen formulieren.",
        ))

    unitless = _numbers_without_unit(text)
    if unitless:
        issues.append(AiQualityIssue(
            category="Completeness",
            severity="medium",
            description=RULE_PREFIX + "Zahl ohne Einheit: " + ", ".join(f"'{n}'" for n in unitless),
            suggestion="Zu jedem Zahlenwert die Einheit angeben, z. B. s, ms, m/s oder Hz.",
        ))

    means = _prescribed_means(text) if normative else None
    if means:
        issues.append(AiQualityIssue(
            category="Completeness",
            severity="medium",
            description=RULE_PREFIX + f"Lösungsvorgabe: „{means}“ schreibt ein Mittel vor statt eines Ziels",
            suggestion="Lösungsneutral formulieren: die geforderte Eigenschaft oder das Ergebnis angeben und die "
                       "Wahl von Werkzeug, Verfahren und Parametern der Umsetzung überlassen.",
        ))

    passive = _passive_without_agent(text) if normative else None
    if passive:
        issues.append(AiQualityIssue(
            category="Completeness",
            severity="medium",
            description=RULE_PREFIX + f"Passiv ohne Verantwortlichen: „{passive}“ – wer führt die Handlung aus?",
            suggestion="Aktiv formulieren und den Verantwortlichen als Subjekt nennen.",
        ))

    parent = context.get("parent_document")
    if normative and parent and not item.get("derived") and not item.get("links"):
        issues.append(AiQualityIssue(
            category="Traceability",
            severity="high",
            description=RULE_PREFIX + f"Kein Link zum Parent-Dokument {parent}, "
                        "obwohl die Anforderung nicht als abgeleitet markiert ist.",
            suggestion=f"Mit der übergeordneten Anforderung in {parent} verlinken "
                       "oder die Anforderung begründet als abgeleitet (derived) kennzeichnen.",
        ))

    # V14: Modalverb nur per Regel, die KI wird darauf nicht hingewiesen. Schwere "low" (Stil), damit
    # Korpora mit durchgehend „soll“ keine Fehlalarme high/critical erzeugen. Erkennt nur die eindeutigen
    # Fälle (schwaches Modalverb ohne verbindliches im selben Text).
    weak = _find_words(text, WEAK_MODAL_VERBS)
    strong = _find_words(text, STRONG_MODAL_VERBS)
    if normative and weak and not strong:
        issues.append(AiQualityIssue(
            category="ModalVerb",
            severity="low",
            description=RULE_PREFIX + "Normative Anforderung ohne verbindliches Modalverb: "
                        + ", ".join(f"'{w}'" for w in weak),
            suggestion="Verbindlich formulieren mit 'muss' bzw. 'darf nicht'.",
        ))
    elif normative and not weak and not strong and _modal_typo(text):
        # V22: kein Modalverb, aber ein vertipptes („sol“, „müsen“). Fehlt das Modalverb ganz, meldet die Regel
        # nichts: Im Korpus beträfe das 139 von 351 Texten (oft Bedingungssätze) – zu viel Rauschen.
        typo = _modal_typo(text)
        issues.append(AiQualityIssue(
            category="ModalVerb",
            severity="low",
            description=RULE_PREFIX + f"Modalverb vermutlich vertippt: '{typo[0]}' (gemeint '{typo[1]}'?)",
            suggestion=f"'{typo[0]}' korrigieren; verbindlich mit 'muss' bzw. 'darf nicht'.",
        ))

    missing = context.get("missing_attributes") or []
    if missing:
        issues.append(AiQualityIssue(
            category="Completeness",
            severity="medium",
            description=RULE_PREFIX + "Pflichtattribute fehlen: " + ", ".join(missing),
            suggestion="Fehlende Pflichtattribute ergänzen: " + ", ".join(missing) + ".",
        ))

    return issues


def build_item_context(project_id: str, item: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    """Sammelt Angaben außerhalb des Items für die Regeln: Parent-Dokument und
    fehlende Pflichtattribute (aus der Attribut-Konfiguration mit ``required:
    true`` und optional ``required_attributes`` im Profil)."""
    prefix = (_uid_to_prefix(item.get("uid", "")) or "").upper()
    context: Dict[str, Any] = {"parent_document": None}
    try:
        for doc in ds.list_documents(project_id):
            if str(doc.get("prefix", "")).upper() == prefix:
                parent = doc.get("parent")
                context["parent_document"] = str(parent) if parent else None
                break
    except Exception:
        pass

    expected: Dict[str, str] = {}
    try:
        for attr in ds.load_attribute_config():
            applies = [str(p).upper() for p in attr.get("applies_to") or []]
            if attr.get("required") and (not applies or prefix in applies):
                expected[attr["key"]] = attr.get("display_name") or attr["key"]
    except Exception:
        pass
    for key in profile.get("required_attributes") or []:
        expected.setdefault(key, key)

    values = item.get("custom_attributes", {})
    context["missing_attributes"] = [
        name for key, name in expected.items()
        if values.get(key) in (None, "", [])
    ]
    return context


def _keywords(text: str) -> set:
    """Wörter ab 4 Zeichen in Kleinschreibung, für den Duplikat-Vergleich."""
    return {w for w in re.findall(r"\w+", text.lower()) if len(w) >= 4}


def drop_rule_duplicates(ai_issues: List[AiQualityIssue], rule_issues: List[AiQualityIssue]) -> List[AiQualityIssue]:
    """Entfernt KI-Befunde, die nur einen Regelbefund wiederholen (mindestens
    60 % gemeinsame Wörter mit dem Regelbefund)."""
    rule_words = [_keywords(i.description[len(RULE_PREFIX):]) for i in rule_issues]
    kept = []
    for issue in ai_issues:
        words = _keywords(issue.description)
        duplicate = any(
            words and rw and len(words & rw) / min(len(words), len(rw)) >= 0.6
            for rw in rule_words
        )
        if not duplicate:
            kept.append(issue)
    return kept


# ─── Gesamtnote (L9 in #33) ───────────────────────────────────────────────────

# Die Gesamtnote rechnet der Code, nicht die KI:
#   Grundnote = mit den Profilgewichten gewichteter Mittelwert der KI-Teilnoten
#   Abzug     = Summe über alle Befunde (KI und Regelprüfung) von
#               Punkte(Schweregrad) × Profilgewicht der Befund-Kategorie
#   Gesamt    = Grundnote − Abzug, begrenzt auf 0–100
#   bestanden = Gesamt ≥ min_score des Profils
# Die Punkte verdoppeln sich je Stufe (vorab festgelegt, nicht am Korpus
# angepasst): ein kritischer Befund senkt eine perfekte Note unter jede
# Mindestnote der Profile (70–80), ein mittlerer kostet so viel wie ein
# KI-Notenschritt von 5 Punkten.
SEVERITY_PENALTY = {"low": 2, "medium": 5, "high": 10, "critical": 20}
SCORE_KEYS = ("clarity", "testability", "completeness", "consistency")
_CATEGORY_KEYS = {
    "clarity": "clarity", "testability": "testability", "completeness": "completeness",
    "consistency": "consistency", "modalverb": "modal_verb", "modal_verb": "modal_verb",
}


def category_weight(profile: Dict[str, Any], key: Optional[str]) -> float:
    """Gewicht einer Kategorie im Profil; unbekannt 1,0, abgeschaltet 0."""
    cfg = (profile.get("categories") or {}).get(key) if key else None
    if not isinstance(cfg, dict):
        return 1.0
    if cfg.get("enabled") is False:
        return 0.0
    try:
        return max(0.0, float(cfg.get("weight", 1.0)))
    except (TypeError, ValueError):
        return 1.0


def issue_penalty(issue: AiQualityIssue, profile: Dict[str, Any]) -> float:
    key = _CATEGORY_KEYS.get(re.sub(r"[\s-]", "", (issue.category or "").lower()))
    points = SEVERITY_PENALTY.get((issue.severity or "").strip().lower(), SEVERITY_PENALTY["medium"])
    return points * category_weight(profile, key)


def compute_score(score: AiQualityScore, issues: List[AiQualityIssue], profile: Dict[str, Any]) -> AiQualityScore:
    """Berechnet Gesamtnote und Bestanden-Kennzeichen (siehe oben)."""
    parts = [(getattr(score, k), category_weight(profile, k)) for k in SCORE_KEYS]
    parts = [(v, w) for v, w in parts if v is not None and w > 0]
    if parts:
        base = sum(v * w for v, w in parts) / sum(w for _, w in parts)
    else:
        base = score.overall
    overall = max(0, min(100, int(round(base - sum(issue_penalty(i, profile) for i in issues)))))
    min_score = _clamp(profile.get("min_score"))
    return score.model_copy(update={
        "overall": overall,
        "min_score": min_score,
        "passed": None if min_score is None else overall >= min_score,
    })
_QUOTED = re.compile(r"[„“\"'‚‘]([^„“\"'‚‘]{1,80})[“”\"'‘’]")


def _quoted_words(text: str) -> set:
    """Wörter (ab 3 Zeichen) und Zahlen aus zitierten Textstellen, ohne Modalverben."""
    words = set()
    for part in _QUOTED.findall(text or ""):
        for w in re.findall(r"\w+", part.lower()):
            if (len(w) >= 3 or w.isdigit()) and w not in MODAL_VERBS and w not in WEAK_MODAL_VERBS:
                words.add(w)
    return words


VERIFY_SYSTEM = """\
Du prüfst die Befunde einer Qualitätsprüfung zu GENAU EINER Anforderung. Entscheide für jeden Befund einzeln:
true  – der Befund trifft auf diese Anforderung zu UND ein eventueller Vorschlag ist richtig und passt zum Befund.
false – der Befund passt nicht zu dieser Anforderung, ist allgemein oder sinnlos, oder der Vorschlag ist falsch.
Nur true oder false in die Liste schreiben, keinen Text.
Antworte AUSSCHLIESSLICH als JSON: {"gueltig": [true|false, ...]} – ein Eintrag je Befund, in derselben Reihenfolge."""


def verify_issues(provider: "LlmProvider", text: str, issues: List[AiQualityIssue],
                  model: Optional[str] = None) -> List[AiQualityIssue]:
    """V18/V23: Ein zusätzlicher Aufruf für alle KI-Befunde zusammen. Was das Modell ausdrücklich als false
    markiert, wird abgestuft (Schwere low, ohne Vorschlag); bei unlesbarer Antwort bleibt alles (sicherer Rückfall)."""
    if not issues:
        return issues
    lines = [f"Anforderung: '{text}'", "", "Befunde:"]
    for n, i in enumerate(issues, 1):
        lines.append(f"{n}. {i.description}" + (f" Vorschlag: {i.suggestion}" if i.suggestion else ""))
    try:
        raw = provider.complete(VERIFY_SYSTEM, "\n".join(lines), model=model)
        data = json.loads(QualityResultParser._extract_json(raw))
        flags = data.get("gueltig") if isinstance(data, dict) else None
    except Exception as e:  # noqa: BLE001 – Selbstprüfung darf die Analyse nie verhindern
        logger.warning("Selbstprüfung fehlgeschlagen, alle Befunde bleiben: %s", e)
        return issues
    # Das Modell hängt oft Text an die Liste an („[false, "Einheit ergänzen"]“): nur Wahrheitswerte zählen
    flags = [f for f in flags if isinstance(f, bool)] if isinstance(flags, list) else []
    if len(flags) != len(issues):
        return issues
    # V23: Abgelehnte Befunde nicht löschen (kostete in V18 offline 6 von 96 Hinweisen), sondern abstufen:
    # Schwere „low“, Vorschlag entfernt – der Hinweis bleibt, der womöglich falsche Vorschlag verschwindet.
    return [i if ok else i.model_copy(update={"severity": "low", "suggestion": ""}) for i, ok in zip(issues, flags)]


def drop_same_spot(ai_issues: List[AiQualityIssue], rule_issues: List[AiQualityIssue]) -> List[AiQualityIssue]:
    """V17: Entfernt KI-Befunde zu einer Textstelle, die eine Regel schon gemeldet hat (gleiches zitiertes
    Wort). Die Modalverb-Regel zählt nicht mit, sonst fiele jeder Befund weg, der einen Satz mit „soll“ zitiert."""
    spots = set()
    for i in rule_issues:
        if (i.category or "") != "ModalVerb":
            spots |= _quoted_words(i.description[len(RULE_PREFIX):])
    if not spots:
        return ai_issues
    return [i for i in ai_issues if not (_quoted_words(i.description) & spots)]


# ─── V28: projektweite Widerspruchsprüfung (Plan A7) ──────────────────────────
#
# Fehler wie SRD022 (250 statt 300 m/s² aus SRD008) sieht man nur im Vergleich mit anderen Anforderungen,
# die nicht unbedingt verlinkt sind. Der Haupt-Prompt bleibt unverändert (Lehre aus V9/V10); stattdessen
# holt der Wissensindex (A1) bis zu drei ähnliche Anforderungen, und ein kurzer zweiter Aufruf fragt nur
# nach Widersprüchen. Schaltbar über AI_PROJECT_CHECK (Standard aus = Verhalten wie V23).

PROJECT_CHECK_ENV = "AI_PROJECT_CHECK"
CONTRADICTION_K = 3
CONTRADICTION_MAX_TOKENS = 300

CONTRADICTION_SYSTEM = """\
Du vergleichst eine Anforderung A mit anderen Anforderungen desselben Projekts.
Widerspricht A einer der anderen bei einem Zahlenwert, einer Grenze, einer Einheit oder einem Namen für dieselbe Sache?
Nur echte Widersprüche zur selben Sache melden, keine bloßen Unterschiede im Thema. Im Zweifel leere Liste.
"andere_uid" ist die UID der ANDEREN Anforderung (B), der A widerspricht – nie die UID von A.
Antworte nur mit {"widersprueche": [{"andere_uid": "...", "stelle": "...", "begruendung": "..."}]}"""

_UID_IN_TEXT = re.compile(r"[A-Za-z][\w.-]*\d")


def project_check_enabled() -> bool:
    return os.environ.get(PROJECT_CHECK_ENV, "").strip().lower() in ("1", "true", "on", "yes", "ja")


def find_neighbours(project_id: str, uid: str) -> List[Dict[str, Any]]:
    """Ähnliche Anforderungen aus dem Wissensindex (A1) ab SIMILAR_MIN. Jeder Fehler (Ollama fehlt,
    Item nicht im Index …) führt zu einer leeren Liste – die Prüfung läuft dann wie V23."""
    try:
        import rag_service  # spät importieren: rag_service importiert dieses Modul
        hits = rag_service.similar(project_id, uid, k=CONTRADICTION_K)
        return [h for h in hits if h["score"] >= rag_service.SIMILAR_MIN]
    except Exception as e:  # noqa: BLE001 – Zusatzprüfung darf die Analyse nie verhindern
        logger.warning("Projektweite Prüfung übersprungen (%s): %s", uid, e)
        return []


def check_contradictions(provider: "LlmProvider", uid: str, text: str, neighbours: List[Dict[str, Any]],
                         model: Optional[str] = None) -> Tuple[List[AiQualityIssue], Dict[str, Any]]:
    """Ein kurzer Zusatzaufruf. Liefert (Befunde, Protokoll). UIDs, die nicht unter den Nachbarn waren,
    werden verworfen; bei unlesbarer Antwort gibt es keine Befunde."""
    lines = [f"A [{uid}]: {text}", "", "Andere Anforderungen:"]
    lines += [f"B [{h['uid']}]: {h['text']}" for h in neighbours]
    user_prompt = "\n".join(lines)
    protocol: Dict[str, Any] = {
        "neighbours": [{"uid": h["uid"], "score": h["score"]} for h in neighbours],
        "system_prompt": CONTRADICTION_SYSTEM, "user_prompt": user_prompt, "raw_response": None,
    }
    allowed = {h["uid"].upper(): h["uid"] for h in neighbours}
    _call_limits.max_tokens = CONTRADICTION_MAX_TOKENS
    try:
        raw = provider.complete(CONTRADICTION_SYSTEM, user_prompt, model=model)
        protocol["raw_response"] = raw
        json_str = QualityResultParser._extract_json(raw)
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError:
            from json_repair import repair_json
            data = json.loads(repair_json(json_str))
    except Exception as e:  # noqa: BLE001
        logger.warning("Widerspruchsprüfung fehlgeschlagen (%s): %s", uid, e)
        protocol["error"] = str(e)
        return [], protocol
    finally:
        _call_limits.max_tokens = None

    found = data.get("widersprueche") if isinstance(data, dict) else None
    issues: List[AiQualityIssue] = []
    seen = set()
    for f in found if isinstance(found, list) else []:
        if not isinstance(f, dict):
            continue
        named = str(f.get("andere_uid") or f.get("uid") or "").strip().strip("[]").upper()
        other = allowed.get(named)
        if not other:
            # llama3.2 schreibt oft die eigene UID ins Feld und nennt die andere nur im Text
            # („Widerspricht B [SRD008] …“): dann die erste Nachbar-UID aus Stelle/Begründung nehmen.
            text_f = f"{f.get('stelle') or ''} {f.get('begruendung') or ''}"
            other = next((allowed[m.upper()] for m in _UID_IN_TEXT.findall(text_f) if m.upper() in allowed), None)
        if not other or other in seen:
            continue  # erfundene UID oder doppelt
        seen.add(other)
        stelle = str(f.get("stelle") or "").strip()
        grund = str(f.get("begruendung") or "").strip()
        detail = "; ".join(p for p in (f"Stelle: {stelle}" if stelle else "", grund) if p)
        issues.append(AiQualityIssue(
            category="Consistency", severity="high",
            description=f"Widerspruch zu {other}: {detail}" if detail else f"Widerspruch zu {other}",
            suggestion=f"Mit {other} abgleichen",
        ))
    protocol["dropped"] = len(found) - len(issues) if isinstance(found, list) else 0
    return issues, protocol


# ─── L1: Zahlenabgleich ohne Sprachmodell (Nachfolger von V28) ────────────────
#
# V28 fragte llama3.2 nach Widersprüchen und verdreifachte die Fehlalarme. Hier vergleicht reiner Code:
# Aus jedem Text werden Tripel (Bezeichner, Wert, Einheit) gezogen; nennt eine ähnliche (k=5, ab SIMILAR_MIN)
# oder verlinkte Anforderung für denselben Bezeichner in derselben Einheit einen anderen Wert, gibt es einen
# Befund Consistency/medium. Kein Modellaufruf. Schaltbar über AI_NUMBER_CHECK (Standard aus = Verhalten wie V23).

NUMBER_CHECK_ENV = "AI_NUMBER_CHECK"
NUMBER_CHECK_K = 5

_N = r"[-−–+±]?\s?\d+(?:[.,]\d+)?"
_U = (r"(?:m/s(?:²|\^2|2)|m/s|rad/s|km/h|°/s|°C|°|%|kHz|MHz|Hz|ms|µs|us|min|km|cm|mm|kg|dB|bar|kPa|Pa|"
      r"m|s|g|N|V|A|W|K)(?![\w/²])")
_ID = r"[A-Za-zλ][A-Za-z0-9λ]*(?:_[A-Za-z0-9]+)+|[A-Za-zλ][A-Za-z0-9λ]{0,3}"
_ASSIGN = re.compile(rf"(?<![\w])(?P<id>{_ID})\s*(?P<op><=|>=|=|≤|≥|<|>|:)\s*(?P<num>{_N})\s*(?P<unit>{_U})")
_AUF = re.compile(rf"(?<![\w])(?P<id>{_ID})\s+auf\s+(?:(?P<cmp>höchstens|mindestens|maximal|minimal)\s+)?"
                  rf"(?P<num>{_N})\s*(?P<unit>{_U})")
_NOUN = re.compile(rf"(?<![\w])(?P<id>[A-ZÄÖÜ][a-zäöüß]{{3,}})\s+(?:soll|muss|darf|sollen|müssen|beträgt|ist)\b"
                   rf"(?P<mid>[^.;()=]{{0,40}}?)(?P<num>{_N})\s*(?P<unit>{_U})")
_LIMIT_WORD = re.compile(r"begrenz|limit|sättig", re.IGNORECASE)
_LIMITED = re.compile(rf"(?<![\w])(?P<id>{_ID})\s+auf\b")
_SENTENCE = re.compile(r"(?<=[.;!?])\s+(?=[A-ZÄÖÜ])|\n+")
_NOUN_STOP = {"software", "system", "subsystem", "funktion", "komponente", "modul", "anforderung", "schnittstelle",
              "wert", "ausgabe", "eingabe", "ergebnis", "betrieb", "test", "dokument", "anwendung"}
_MAX_WORDS = ("höchstens", "maximal", "nicht mehr als", "bis zu", "nicht größer", "nicht über")
_MIN_WORDS = ("mindestens", "minimal", "nicht weniger als", "nicht kleiner", "nicht unter")

Triple = Tuple[str, float, str, str]  # (Bezeichner klein, Wert, Einheit, Vergleich)


def _num(s: str) -> float:
    s = s.strip().replace("−", "-").replace("–", "-").replace(" ", "")
    if s.startswith("±"):
        s = s[1:]
    return float(s.lstrip("+").replace(",", "."))


def _unit(u: str) -> str:
    return re.sub(r"\^?2$", "²", u) if u.startswith("m/s") else u


def _cmp(op: str = "", before: str = "") -> str:
    if op in ("≤", "<=", "<"):
        return "<="
    if op in ("≥", ">=", ">"):
        return ">="
    low = before.lower()
    if any(w in low for w in _MAX_WORDS):
        return "<="
    if any(w in low for w in _MIN_WORDS):
        return ">="
    return "="


def extract_triples(text: str) -> List[Triple]:
    """Tripel (Bezeichner, Wert, Einheit, Vergleich) aus einem Anforderungstext, nur per regulärem Ausdruck.
    Berücksichtigt: „a_max = 300 m/s²“, „a_cmd auf 250 m/s² begrenzen“ (Obergrenze, Vergleich „<=“), „Die Beschleunigung soll
    höchstens 300 m/s² betragen“ und bei Begrenzungssätzen den Wert für die begrenzte Größe
    („a_cmd auf ±a_max begrenzen (a_max = 300 m/s²)“ → a_cmd = 300 m/s²)."""
    out: List[Triple] = []
    for sentence in _SENTENCE.split(text or ""):
        found: List[Triple] = []
        for m in _ASSIGN.finditer(sentence):
            found.append((m["id"].lower(), _num(m["num"]), _unit(m["unit"]), _cmp(m["op"])))
        assigned = list(found)
        limiting = bool(_LIMIT_WORD.search(sentence))
        for m in _AUF.finditer(sentence) if limiting else ():  # „a_cmd auf 0 m/s² setzen“ ist keine Grenze
            found.append((m["id"].lower(), _num(m["num"]), _unit(m["unit"]), _cmp("", m["cmp"] or "höchstens")))
        for m in _NOUN.finditer(sentence):
            if m["id"].lower() not in _NOUN_STOP:
                found.append((m["id"].lower(), _num(m["num"]), _unit(m["unit"]), _cmp("", m["mid"])))
        if assigned and limiting:
            limited = _LIMITED.search(sentence)
            if limited:
                name = limited["id"].lower()
                found += [(name, v, u, "<=") for (i, v, u, c) in assigned if i != name]
        out += [t for t in found if t not in out]
    return out


def _fmt(v: float) -> str:
    return f"{v:g}".replace(".", ",")


def compare_numbers(uid: str, text: str, others: List[Dict[str, Any]]) -> List[AiQualityIssue]:
    """Gleicher Bezeichner, gleiche Einheit, gleicher Vergleich, anderer Wert → Consistency/medium."""
    mine = extract_triples(text)
    issues: List[AiQualityIssue] = []
    if not mine:
        return issues
    seen = set()
    for other in others:
        for (name, value, unit, cmp_) in mine:
            for (o_name, o_value, o_unit, o_cmp) in extract_triples(other.get("text") or ""):
                if (name, unit, cmp_) != (o_name, o_unit, o_cmp) or abs(value - o_value) < 1e-9:
                    continue
                if (other["uid"], name) in seen:
                    continue
                seen.add((other["uid"], name))
                issues.append(AiQualityIssue(
                    category="Consistency", severity="medium",
                    description=(f"Zahlenabgleich: {uid} nennt {_fmt(value)} {unit}, {other['uid']} nennt "
                                 f"{_fmt(o_value)} {unit} für {name}"),
                    suggestion=f"Wert mit {other['uid']} abgleichen und nur an einer Stelle festlegen",
                ))
    return issues


def number_check_enabled() -> bool:
    return os.environ.get(NUMBER_CHECK_ENV, "").strip().lower() in ("1", "true", "on", "yes", "ja")


def find_number_peers(project_id: str, uid: str, item: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Ähnliche (k=5, ab SIMILAR_MIN) und alle verlinkten Anforderungen mit vollem Text. Fehler im
    Wissensindex führen dazu, dass nur die verlinkten verglichen werden."""
    peers: Dict[str, Dict[str, Any]] = {}
    linked = {str(link).split(":")[0] for link in item.get("links") or []}
    try:
        import rag_service
        for h in rag_service.similar(project_id, uid, k=NUMBER_CHECK_K):
            if h["score"] >= rag_service.SIMILAR_MIN:
                peers[h["uid"]] = {"uid": h["uid"], "text": h["text"], "score": h["score"]}
        entries, _ = rag_service._index(project_id)
        linked |= {e["uid"] for e in entries if uid in e["links"]}
    except Exception as e:  # noqa: BLE001 – Zusatzprüfung darf die Analyse nie verhindern
        logger.warning("Zahlenabgleich: Wissensindex nicht verfügbar (%s): %s", uid, e)
    for other in sorted(linked | set(peers)):
        if other == uid:
            continue
        try:  # voller Text statt der gekürzten Fassung des Index
            full = ds.get_item(project_id, other)
            if full and not full.get("header"):
                peers[other] = {"uid": other, "text": full.get("text") or "",
                                "score": peers.get(other, {}).get("score")}
        except Exception:  # noqa: BLE001
            pass
    return [p for u, p in peers.items() if u != uid and p["text"]]


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
        json_str = self._extract_json(raw_json)
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError:
            # Fallback: json-repair repariert häufige LLM-Fehler (fehlende Kommas etc.)
            from json_repair import repair_json
            data = json.loads(repair_json(json_str))

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

    @staticmethod
    def _extract_json(raw: str) -> str:
        """Extrahiert und bereinigt JSON aus einer LLM-Antwort.

        Behandelt:
        - Markdown-Codeblöcke (```json ... ```)
        - Text vor/nach dem JSON-Objekt
        - Trailing commas vor } oder ] (häufiger LLM-Fehler)
        """
        text = raw.strip()

        # 1. Markdown-Codeblock extrahieren
        md_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
        if md_match:
            text = md_match.group(1).strip()

        # 2. Erstes { bis letztes } extrahieren (ignoriert Text davor/danach)
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start:end + 1]

        # 3. Trailing commas entfernen
        text = re.sub(r",\s*([}\]])", r"\1", text)

        return text


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

        profile = load_profile(profile_name)
        used_model = resolve_model(model, profile)

        system_prompt = self._prompt_builder.build_system_prompt(profile)
        user_prompt = self._prompt_builder.build_user_prompt(item, profile)

        # LLM aufrufen (synchron – im FastAPI-Kontext per run_in_executor).
        # Das Modell wird explizit übergeben, damit model_used im Ergebnis
        # immer dem tatsächlich angefragten Modell entspricht.
        started = time.perf_counter()
        raw = self._provider.complete(system_prompt, user_prompt, model=used_model)
        llm_seconds = time.perf_counter() - started
        result = self._parser.parse(raw, uid, used_model, profile_name)
        ai_issues_parsed = list(result.issues)
        # Regelbefunde zuerst; KI-Befunde, die nur eine Regel wiederholen, entfallen
        rule_issues = check_rules(item, profile, build_item_context(project_id, item, profile))
        # V14: Modalverb prüft nur die Regel; KI-Befunde dazu entfallen
        ai_issues = [i for i in result.issues if (i.category or "").strip().lower() != "modalverb"]
        # V17: KI-Befunde zu einer Stelle, die eine Regel schon meldet, entfallen
        ai_issues = drop_same_spot(drop_rule_duplicates(ai_issues, rule_issues), rule_issues)
        # V18/V23: Selbstprüfung – ein zweiter, kurzer Aufruf; abgelehnte KI-Befunde werden abgestuft
        ai_issues = verify_issues(self._provider, text, ai_issues, used_model)
        # V28: projektweite Widerspruchsprüfung mit ähnlichen Anforderungen aus dem Wissensindex
        project_protocol = None
        if project_check_enabled():
            neighbours = find_neighbours(project_id, uid)
            if neighbours:
                found, project_protocol = check_contradictions(
                    self._provider, uid, text, neighbours, used_model)
                ai_issues = ai_issues + found
        # L1: Zahlenabgleich ohne Sprachmodell
        number_issues: List[AiQualityIssue] = []
        peers: List[Dict[str, Any]] = []
        if number_check_enabled():
            peers = find_number_peers(project_id, uid, item)
            number_issues = compare_numbers(uid, text, peers)
        result.issues = rule_issues + ai_issues + number_issues
        # V19: Gesamtnote aus Teilnoten, Profilgewichten und den endgültigen Befunden
        result.score = compute_score(result.score, result.issues, profile)

        protocol = None
        if protocol_enabled():
            # L15: nachvollziehbar, wie das Ergebnis zustande kam (nur lesend, ändert nichts am Ergebnis)
            protocol = build_protocol(
                result, item, used_model, system_prompt, user_prompt, raw,
                llm_seconds, time.perf_counter() - started, rule_issues, ai_issues_parsed,
            )
            if number_check_enabled():
                protocol["number_check"] = {
                    "peers": [{"uid": p["uid"], "score": p.get("score")} for p in peers],
                    "triples": extract_triples(text),
                    "findings": [i.description for i in number_issues]}
            if project_protocol is not None:
                protocol["project_check"] = project_protocol
        save_quality_result(project_id, uid, result, protocol=protocol)
        return result


def build_protocol(
    result: AiQualityResult,
    item: Dict[str, Any],
    model: str,
    system_prompt: str,
    user_prompt: str,
    raw_response: str,
    llm_seconds: float,
    total_seconds: float,
    rule_issues: List[AiQualityIssue],
    ai_issues_parsed: List[AiQualityIssue],
) -> Dict[str, Any]:
    """Protokoll einer Analyse (L15 in #33). Feldnamen vermeiden doorstop-Schlüssel
    wie ``text`` oder ``links``, weil doorstop die Datei als Item mitliest."""
    return {
        "requirement_uid": result.requirement_uid,
        "timestamp": result.timestamp,  # gleich wie im Sidecar, damit zuordenbar
        "provider": os.environ.get("AI_PROVIDER", DEFAULT_PROVIDER).lower(),
        "model": model,
        "profile": result.profile_used,
        "temperature": get_temperature(),
        "seed": get_seed(),
        "max_tokens": MAX_TOKENS,
        "llm_duration_s": round(llm_seconds, 3),
        "total_duration_s": round(total_seconds, 3),
        "requirement_text": item.get("text") or "",
        "system_prompt": system_prompt,
        "user_prompt": user_prompt,
        "raw_response": raw_response,
        "rule_issues": [i.model_dump() for i in rule_issues],
        "ai_issues_parsed": [i.model_dump() for i in ai_issues_parsed],
        "final_issue_count": len(result.issues),
    }


def resolve_model(requested: Optional[str], profile: Dict[str, Any]) -> str:
    """Bestimmt das Modell für eine Analyse.

    Reihenfolge: Anfrage > AI_MODEL (Startkonfiguration) > Profil > Provider-Standard.
    AI_MODEL steht vor dem Profil, damit z. B. ``start.sh --model`` nicht von
    einem Profil-Modell überschrieben wird.
    """
    if requested:
        return requested
    env_model = os.environ.get("AI_MODEL")
    if env_model:
        return env_model
    profile_model = profile.get("model")
    provider_name = os.environ.get("AI_PROVIDER", DEFAULT_PROVIDER).lower()
    if profile_model and _model_matches_provider(profile_model, provider_name):
        return profile_model
    return get_default_model()


_ANTHROPIC_PREFIXES = ("claude",)
_OPENAI_PREFIXES = ("gpt-", "o1", "o3", "o4")


def _model_matches_provider(model_name: str, provider: str) -> bool:
    """Prüft ob ein Modellname zum konfigurierten Provider passt."""
    model_lower = model_name.lower()
    if provider == "anthropic":
        return model_lower.startswith(_ANTHROPIC_PREFIXES)
    if provider == "openai":
        return model_lower.startswith(_OPENAI_PREFIXES)
    # Für ollama/openai_compatible: alles akzeptieren außer Modellen, die
    # erkennbar zu Anthropic oder OpenAI gehören (z. B. Profil-Standard
    # "claude-sonnet-4-6" – den kennt ein lokaler Ollama-Server nicht)
    return not model_lower.startswith(_ANTHROPIC_PREFIXES + _OPENAI_PREFIXES)


# ─── Modul-Level Singleton (lazy) ─────────────────────────────────────────────

_analyzer: Optional[QualityAnalyzer] = None


def get_analyzer() -> QualityAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = QualityAnalyzer()
    return _analyzer
