"""
Lokale Dateien als Bildreferenz einbetten (kein Upload, kein Kopieren).

Endpunkte:
  POST /api/localfile/pick   – Öffnet nativen Dateidialog, gibt Pfad + SHA256 zurück
  GET  /api/localfile        – Liefert Datei, Header X-File-Status: ok|changed|missing
  POST /api/localfile/check  – Batch-Status mehrerer Pfad+Hash-Paare
"""

import hashlib
import mimetypes
import os
import platform
import subprocess
from typing import List

from auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["localfile"])

# ─── Sicherheit: nur Pfade unterhalb des Home-Verzeichnisses erlaubt ──────────

_ALLOWED_BASES = [os.path.realpath(os.path.expanduser("~"))]


def _is_allowed(path: str) -> bool:
    try:
        real = os.path.realpath(path)
        return any(real.startswith(base) for base in _ALLOWED_BASES)
    except Exception:
        return False


# ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _mimetype(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
    }.get(ext, mimetypes.guess_type(path)[0] or "application/octet-stream")


def _pick_native() -> str | None:
    """Öffnet einen nativen Datei-Öffnen-Dialog und gibt den Pfad zurück."""
    if platform.system() == "Darwin":
        # macOS: AppleScript – zeigt echten Finder-Dialog
        script = (
            'set f to POSIX path of (choose file with prompt '
            '"Bild auswählen:" of type {"public.image"})\n'
            "return f"
        )
        r = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if r.returncode == 0:
            return r.stdout.strip() or None
        return None
    else:
        # Linux / Windows: tkinter in Subprozess (Hauptthread-Problem vermeiden)
        code = (
            "import tkinter as tk; from tkinter import filedialog; "
            "root = tk.Tk(); root.withdraw(); root.lift(); "
            "f = filedialog.askopenfilename("
            "title='Bild auswählen', "
            "filetypes=[('Bilder','*.jpg *.jpeg *.png *.gif *.webp *.svg'),('Alle','*')]"
            "); print(f)"
        )
        r = subprocess.run(
            ["python3", "-c", code],
            capture_output=True,
            text=True,
            timeout=120,
        )
        path = r.stdout.strip()
        return path or None


# ─── Endpunkte ────────────────────────────────────────────────────────────────


@router.post("/localfile/pick")
async def pick_local_file(current_user=Depends(get_current_user)):
    """Öffnet nativen Dateidialog. Gibt Pfad, Hash, Größe und Name zurück."""
    path = _pick_native()
    if not path:
        raise HTTPException(400, "Keine Datei ausgewählt")
    if not _is_allowed(path):
        raise HTTPException(403, "Pfad nicht erlaubt (außerhalb des Home-Verzeichnisses)")
    if not os.path.isfile(path):
        raise HTTPException(404, "Datei nicht gefunden")
    ext = os.path.splitext(path)[1].lower()
    if ext not in _IMAGE_EXTS:
        raise HTTPException(400, f"Dateityp nicht unterstützt: {ext}")

    return {
        "path": path,
        "hash": _sha256(path),
        "size": os.path.getsize(path),
        "name": os.path.basename(path),
    }


@router.get("/localfile")
async def serve_local_file(
    path: str = Query(..., description="Absoluter Dateipfad"),
    h: str | None = Query(None, description="Erwarteter SHA256-Hash"),
    current_user=Depends(get_current_user),
):
    """
    Liefert eine lokale Bilddatei direkt vom Originalort.

    Response-Header:
      X-File-Status: ok | changed | missing | forbidden
      X-File-Hash:   aktueller SHA256
    """
    if not _is_allowed(path):
        raise HTTPException(403, "Pfad nicht erlaubt")
    if not os.path.isfile(path):
        # Gib ein 1×1 transparentes PNG zurück, damit img.src nicht bricht
        transparent_1x1 = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
            b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
            b"\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        return Response(
            content=transparent_1x1,
            media_type="image/png",
            headers={"X-File-Status": "missing", "X-File-Hash": ""},
        )

    current_hash = _sha256(path)
    status = "ok" if (h is None or h == current_hash) else "changed"

    return FileResponse(
        path,
        media_type=_mimetype(path),
        headers={"X-File-Status": status, "X-File-Hash": current_hash},
    )


class CheckItem(BaseModel):
    path: str
    hash: str


@router.post("/localfile/check")
async def check_local_files(
    items: List[CheckItem],
    current_user=Depends(get_current_user),
):
    """
    Prüft mehrere Pfad+Hash-Paare auf einmal.
    Gibt für jeden Eintrag: {path, status: ok|changed|missing|forbidden, current_hash?}
    """
    results = []
    for item in items:
        if not _is_allowed(item.path):
            results.append({"path": item.path, "status": "forbidden"})
        elif not os.path.isfile(item.path):
            results.append({"path": item.path, "status": "missing"})
        else:
            current_hash = _sha256(item.path)
            results.append({
                "path": item.path,
                "status": "ok" if current_hash == item.hash else "changed",
                "current_hash": current_hash,
            })
    return results
