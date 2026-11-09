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
from doorstop.core.types import UID
from doorstop import DoorstopError


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
REQUEST_TIMEOUT = 60.0

# Sampling: temperature 0 und fester Seed, damit gleiche Eingaben möglichst
# gleiche Ergebnisse liefern (L10 in #33). Per Umgebungsvariable überschreibbar.
DEFAULT_TEMPERATURE = 0.0
DEFAULT_SEED = 42

# Mehrere Befunde mit vollständig umformulierter Anforderung brauchen mehr als
# 1024 Token, sonst wird das JSON abgeschnitten (G3 in #31, L12 in #33).
MAX_TOKENS = 2048

PROFILES_DIR = Path(__file__).parent.parent / "data" / "ai_quality_profiles"


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


def get_seed() -> Optional[int]:
    """Seed aus AI_SEED, Standard 42. AI_SEED=none schaltet ihn ab."""
    raw = os.environ.get("AI_SEED", str(DEFAULT_SEED))
    if raw.lower() in ("", "none", "off"):
        return None
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_SEED


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
        self._client = _anthropic.Anthropic(api_key=api_key)

    def complete(self, system_prompt: str, user_prompt: str, model: Optional[str] = None) -> str:
        message = self._client.messages.create(
            model=model or self.model,
            max_tokens=MAX_TOKENS,
            # Anthropic kennt keinen Seed, nur die Temperatur
            temperature=get_temperature(),
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
        self._client = _openai.OpenAI(
            api_key=api_key,
            base_url=resolved_base_url,
            timeout=REQUEST_TIMEOUT,
        )

    def complete(self, system_prompt: str, user_prompt: str, model: Optional[str] = None) -> str:
        used_model = model or self.model
        sampling: Dict[str, Any] = {"temperature": get_temperature()}
        seed = get_seed()
        if seed is not None:
            sampling["seed"] = seed
        try:
            # response_format erzwingt valides JSON (Ollama + OpenAI unterstützen das)
            response = self._client.chat.completions.create(
                model=used_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=MAX_TOKENS,
                response_format={"type": "json_object"},
                **sampling,
            )
        except Exception:
            # Fallback für Provider die response_format oder seed nicht unterstützen
            response = self._client.chat.completions.create(
                model=used_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=MAX_TOKENS,
                temperature=sampling["temperature"],
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
Ein schwaches Modalverb („soll“ statt „muss“) ist höchstens ein Befund mit severity "low" und ersetzt \
keine der Prüfungen 1–6.

Schweregrad: "high" nur, wenn die Anforderung so nicht umsetzbar oder nicht prüfbar ist. "medium", wenn \
eine Angabe fehlt oder unklar ist, die Anforderung aber prüfbar bleibt. "low" für Formulierung und Stil. \
Nennt die Anforderung schon Wert, Einheit und Bedingung, ist ein Befund höchstens "medium". \
Im Zweifel den niedrigeren Schweregrad wählen.

Jeder Befund nennt in "description" die betroffene Textstelle wörtlich in Anführungszeichen und den Fehler. \
"suggestion" ist die vollständig umformulierte Anforderung, in der genau dieser Fehler behoben ist; \
bei einer Lösungsvorgabe nennt sie das Ziel und lässt Werkzeug, Verfahren und Parameter weg. \
Fehlende Werte setzt du als Platzhalter in spitze Klammern, z. B. <Wert> <Einheit>. \
Hat die Anforderung keinen Fehler, bleibt "issues" leer.

Noten je Dimension: 90–100 keine Mängel, 70–89 kleine Mängel, 40–69 mindestens ein wesentlicher Mangel, \
0–39 so nicht verwendbar.

Die Beispiele zeigen nur das Format. Übernimm daraus keine Formulierungen, Werte oder Einheiten.

Beispiel 1 – Anforderung: 'Die Bahnsteigtür soll sich zügig über den Spindelantrieb SP-4 öffnen.'
Befunde: [{{"category": "Clarity", "severity": "high", \
"description": "„zügig“ ist ohne Maßstab nicht prüfbar.", \
"suggestion": "Die Bahnsteigtür muss sich innerhalb von <Wert> s vollständig öffnen."}}, \
{{"category": "Completeness", "severity": "medium", \
"description": "„über den Spindelantrieb SP-4“ legt die Umsetzung fest.", \
"suggestion": "Die Bahnsteigtür muss sich auf Anforderung des Zugpersonals vollständig öffnen."}}]

Beispiel 2 – Anforderung: 'Das Heizungssteuergerät soll die Raumtemperatur mit einem PID-Regler mit Kp=3 regeln.'
Befund: {{"category": "Completeness", "severity": "high", \
"description": "„mit einem PID-Regler mit Kp=3“ gibt die Lösung vor, das geforderte Verhalten fehlt.", \
"suggestion": "Das Heizungssteuergerät muss die Raumtemperatur im eingeschwungenen Zustand mit höchstens \
0,5 K Abweichung vom Sollwert halten."}}

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
      "category": "<Clarity|Testability|Completeness|Consistency|ModalVerb>",
      "severity": "<low|medium|high|critical>",
      "description": "<„Textstelle“: Problembeschreibung>",
      "suggestion": "<vollständig umformulierte Anforderung>"
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
    Pflichtattribute."""
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
        raw = self._provider.complete(system_prompt, user_prompt, model=used_model)
        result = self._parser.parse(raw, uid, used_model, profile_name)
        # Regelbefunde zuerst; KI-Befunde, die nur eine Regel wiederholen, entfallen
        rule_issues = check_rules(item, profile, build_item_context(project_id, item, profile))
        result.issues = rule_issues + drop_rule_duplicates(result.issues, rule_issues)

        save_quality_result(project_id, uid, result)
        return result


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
