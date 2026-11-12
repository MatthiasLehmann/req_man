"""
Regressionstests für Sicherheitsfixes.

- /api/localfile liefert nur Bilddateien (keine ~/.ssh/id_rsa o. ä.)
- /uploads/* wird mit CSP-Sandbox ausgeliefert (kein Skript aus SVG-Uploads)
- PlantUML läuft mit Sicherheitsprofil SANDBOX

Ausführen:
    cd backend && .venv/bin/pytest test_security.py -v
"""
import asyncio
import os
import sys
import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).parent))

from routers import localfile_router as lf


# ─── /api/localfile ──────────────────────────────────────────────────────────


@pytest.fixture
def home(tmp_path, monkeypatch):
    base = os.path.realpath(tmp_path)
    monkeypatch.setattr(lf, "_ALLOWED_BASES", [base])
    (tmp_path / "bild.png").write_bytes(b"\x89PNG fake")
    (tmp_path / "id_rsa").write_text("PRIVATE KEY")
    (tmp_path / ".env").write_text("SECRET=1")
    return tmp_path


class TestLocalfileOnlyImages:
    def test_image_in_home_is_allowed(self, home):
        assert lf._is_allowed_image(str(home / "bild.png"))

    @pytest.mark.parametrize("name", ["id_rsa", ".env", "notes.txt"])
    def test_non_image_in_home_is_rejected(self, home, name):
        assert not lf._is_allowed_image(str(home / name))

    def test_image_outside_home_is_rejected(self, home, tmp_path_factory):
        other = tmp_path_factory.mktemp("other") / "bild.png"
        other.write_bytes(b"x")
        assert not lf._is_allowed_image(str(other))

    def test_symlink_with_image_name_to_secret_is_rejected(self, home):
        link = home / "harmlos.png"
        try:
            link.symlink_to(home / "id_rsa")
        except (OSError, NotImplementedError):
            pytest.skip("Symlinks hier nicht verfügbar")
        assert not lf._is_allowed_image(str(link))

    def test_serve_rejects_secret_file(self, home):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(lf.serve_local_file(path=str(home / "id_rsa"), h=None, current_user=None))
        assert exc.value.status_code == 403

    def test_serve_image_sets_sandbox_headers(self, home):
        resp = asyncio.run(lf.serve_local_file(path=str(home / "bild.png"), h=None, current_user=None))
        assert "sandbox" in resp.headers["content-security-policy"]
        assert resp.headers["x-content-type-options"] == "nosniff"

    def test_check_marks_secret_file_forbidden(self, home):
        items = [lf.CheckItem(path=str(home / "id_rsa"), hash="")]
        result = asyncio.run(lf.check_local_files(items=items, current_user=None))
        assert result == [{"path": str(home / "id_rsa"), "status": "forbidden"}]


# ─── /uploads ────────────────────────────────────────────────────────────────


async def _asgi_get(app, path: str):
    """Minimaler ASGI-GET ohne httpx/TestClient."""
    messages = []
    sent_request = False

    async def receive():
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": b"", "more_body": False}
        # Danach wartet der Client einfach (kein Disconnect) – die Middleware
        # bricht diesen Listener ab, sobald die Antwort fertig ist.
        await asyncio.Event().wait()

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "GET", "scheme": "http", "path": path, "raw_path": path.encode(),
        "root_path": "", "query_string": b"", "headers": [],
        "client": ("127.0.0.1", 1), "server": ("testserver", 80),
    }
    await app(scope, receive, send)
    start = next(m for m in messages if m["type"] == "http.response.start")
    headers = {k.decode().lower(): v.decode() for k, v in start["headers"]}
    return start["status"], headers


def test_uploaded_svg_is_served_sandboxed():
    import main

    name = f"test-{uuid.uuid4().hex}.svg"
    path = os.path.join(main.UPLOADS_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    try:
        status, headers = asyncio.run(_asgi_get(main.app, f"/uploads/{name}"))
    finally:
        os.remove(path)
    assert status == 200
    assert "sandbox" in headers["content-security-policy"]
    assert headers["x-content-type-options"] == "nosniff"


# ─── PlantUML ────────────────────────────────────────────────────────────────


def test_plantuml_runs_with_sandbox_profile():
    source = (Path(__file__).parent / "routers" / "plantuml_router.py").read_text(encoding="utf-8")
    assert '"-DPLANTUML_SECURITY_PROFILE=SANDBOX"' in source
    # Die -D-Option muss vor -jar stehen, sonst wird sie als Programmargument ignoriert.
    assert source.index("-DPLANTUML_SECURITY_PROFILE") < source.index('"-jar"')
