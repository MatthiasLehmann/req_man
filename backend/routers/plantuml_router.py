"""
PlantUML-Diagramme lokal rendern (kein Internet erforderlich).

Endpunkte:
  POST /api/plantuml/render  – Rendert PlantUML-Quelltext zu SVG via Java

plantuml.jar wird beim ersten Aufruf automatisch heruntergeladen und unter
backend/lib/plantuml.jar abgelegt. Danach ist kein Internet mehr nötig.
"""

import asyncio
import os
import subprocess
import urllib.request
from pathlib import Path

from auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["plantuml"])

# ─── plantuml.jar Verwaltung ───────────────────────────────────────────────────

_BACKEND_DIR = Path(__file__).parent.parent
_JAR_PATH = _BACKEND_DIR / "lib" / "plantuml.jar"
_JAR_URL = (
    "https://github.com/plantuml/plantuml/releases/download/"
    "v1.2024.7/plantuml-1.2024.7.jar"
)

_jar_lock = asyncio.Lock()
_jar_ready: bool = False


async def _ensure_jar() -> None:
    """Lädt plantuml.jar beim ersten Aufruf herunter (einmalig, thread-safe)."""
    global _jar_ready
    if _jar_ready:
        return
    async with _jar_lock:
        if _jar_ready:
            return
        if _JAR_PATH.exists():
            _jar_ready = True
            return
        try:
            _JAR_PATH.parent.mkdir(parents=True, exist_ok=True)
            # Synchroner Download – läuft beim ersten Aufruf, danach nie wieder
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: urllib.request.urlretrieve(_JAR_URL, str(_JAR_PATH)),
            )
            _jar_ready = True
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"plantuml.jar konnte nicht heruntergeladen werden: {exc}\n"
                    f"Bitte manuell herunterladen und unter "
                    f"{_JAR_PATH} ablegen."
                ),
            )


# ─── API-Modelle ───────────────────────────────────────────────────────────────


class RenderRequest(BaseModel):
    source: str


class RenderResponse(BaseModel):
    svg: str


# ─── Endpunkt ──────────────────────────────────────────────────────────────────


@router.post("/plantuml/render", response_model=RenderResponse)
async def render_plantuml(
    body: RenderRequest,
    _current_user=Depends(get_current_user),
) -> RenderResponse:
    """
    Rendert PlantUML-Quelltext zu SVG.

    Verwendet Java + plantuml.jar lokal – kein Internet erforderlich (nach
    dem einmaligen Download der JAR-Datei).
    """
    if not body.source or not body.source.strip():
        raise HTTPException(status_code=422, detail="PlantUML-Quelltext ist leer.")

    await _ensure_jar()

    # Java-Verfügbarkeit prüfen
    java_bin = _find_java()
    if not java_bin:
        import sys
        hint = (
            "macOS: 'brew install openjdk' oder JDK von https://adoptium.net installieren."
            if sys.platform == "darwin"
            else "Bitte Java (JDK ≥ 11) installieren."
        )
        raise HTTPException(
            status_code=503,
            detail=f"Java wurde nicht gefunden. {hint}",
        )

    try:
        proc = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: subprocess.run(
                [java_bin, "-jar", str(_JAR_PATH), "-tsvg", "-pipe", "-charset", "UTF-8"],
                input=body.source.encode("utf-8"),
                capture_output=True,
                timeout=30,
            ),
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="PlantUML-Rendering-Timeout (>30s).")

    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=422,
            detail=f"PlantUML-Fehler: {stderr[:500]}",
        )

    svg = proc.stdout.decode("utf-8", errors="replace")
    # Nur den eigentlichen SVG-Inhalt zurückgeben (ab erster '<svg' Marke)
    svg_start = svg.find("<svg")
    if svg_start == -1:
        raise HTTPException(status_code=422, detail="Kein SVG in der Ausgabe gefunden.")

    return RenderResponse(svg=svg[svg_start:])


# ─── Hilfsfunktionen ───────────────────────────────────────────────────────────


def _find_java() -> str | None:
    """Sucht java-Binary in PATH und bekannten Pfaden.

    Auf macOS ist /usr/bin/java ein Stub ohne echten JDK – dieser wird
    bewusst übersprungen. Stattdessen werden JAVA_HOME, /usr/libexec/java_home
    (macOS-Systemutil) und typische Installations-Pfade geprüft.
    """
    import glob
    import shutil
    import sys

    def _is_real_java(path: str) -> bool:
        """Prüft ob der Pfad ein echtes java-Binary ist (kein macOS-Stub)."""
        return os.path.isfile(path) and not (
            sys.platform == "darwin" and path == "/usr/bin/java"
        )

    # 1. JAVA_HOME Umgebungsvariable (höchste Priorität)
    java_home = os.environ.get("JAVA_HOME", "")
    if java_home:
        candidate = os.path.join(java_home, "bin", "java")
        if _is_real_java(candidate):
            return candidate

    # 2. macOS: /usr/libexec/java_home gibt den registrierten JDK-Pfad zurück
    if sys.platform == "darwin":
        try:
            result = subprocess.run(
                ["/usr/libexec/java_home"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                jh = result.stdout.strip()
                candidate = os.path.join(jh, "bin", "java")
                if _is_real_java(candidate):
                    return candidate
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass

        # 3. Homebrew OpenJDK (Apple Silicon + Intel)
        for brew_pattern in [
            "/opt/homebrew/opt/openjdk*/bin/java",
            "/usr/local/opt/openjdk*/bin/java",
        ]:
            for match in sorted(glob.glob(brew_pattern), reverse=True):
                if _is_real_java(match):
                    return match

        # 4. Direkt installierte JDKs unter /Library/Java/
        for jvm_pattern in [
            "/Library/Java/JavaVirtualMachines/*/Contents/Home/bin/java",
            "/System/Library/Java/JavaVirtualMachines/*/Contents/Home/bin/java",
        ]:
            for match in sorted(glob.glob(jvm_pattern), reverse=True):
                if _is_real_java(match):
                    return match

    # 5. PATH durchsuchen – macOS-Stub /usr/bin/java wird übersprungen
    path_java = shutil.which("java")
    if path_java and _is_real_java(path_java):
        return path_java

    # 6. Weitere bekannte Pfade (Linux / manuell installierte JDKs)
    for candidate in [
        "/usr/local/bin/java",
        "/opt/homebrew/bin/java",
        "/usr/lib/jvm/java-21-openjdk-amd64/bin/java",
        "/usr/lib/jvm/java-17-openjdk-amd64/bin/java",
        "/usr/lib/jvm/java-11-openjdk-amd64/bin/java",
        "/usr/lib/jvm/default-java/bin/java",
    ]:
        if _is_real_java(candidate):
            return candidate

    return None
