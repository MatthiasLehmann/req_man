"""Dünner HTTP-Client für die ReqMan-REST-API (der MCP-Server enthält keine Fachlogik).

Konfiguration nur über Umgebungsvariablen:
  REQMAN_URL       Standard http://localhost:8000
  REQMAN_USER      Benutzername des Agenten-Benutzers
  REQMAN_PASSWORD  Passwort (steht nur in der Konfiguration des MCP-Clients, nie im Repo)
  REQMAN_PROJECT   optional: Name oder ID des Standardprojekts
"""
import os
from typing import Any, Dict, List, Optional

import httpx


class ReqManError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


class ReqManUnreachable(ReqManError):
    def __init__(self, url: str):
        super().__init__(0, f"ReqMan ist unter {url} nicht erreichbar – läuft das Backend?")


class ReqManClient:
    def __init__(self, base_url: Optional[str] = None, user: Optional[str] = None,
                 password: Optional[str] = None, default_project: Optional[str] = None,
                 transport: Optional[httpx.BaseTransport] = None):
        self.base_url = (base_url or os.environ.get("REQMAN_URL") or "http://localhost:8000").rstrip("/")
        self.user = user if user is not None else os.environ.get("REQMAN_USER", "")
        self.password = password if password is not None else os.environ.get("REQMAN_PASSWORD", "")
        self.default_project = default_project if default_project is not None else os.environ.get("REQMAN_PROJECT", "")
        self._token: Optional[str] = None
        self._http = httpx.Client(base_url=self.base_url, timeout=120, transport=transport)

    # ── Anmeldung ──
    def _login(self) -> None:
        if not self.user or not self.password:
            raise ReqManError(401, "REQMAN_USER und REQMAN_PASSWORD sind nicht gesetzt (Konfiguration des MCP-Clients).")
        try:
            r = self._http.post("/api/auth/token", data={"username": self.user, "password": self.password})
        except httpx.TransportError:
            raise ReqManUnreachable(self.base_url)
        if r.status_code != 200:
            raise ReqManError(r.status_code, "Anmeldung bei ReqMan fehlgeschlagen – Benutzername oder Passwort prüfen.")
        self._token = r.json()["access_token"]

    def _request(self, method: str, path: str, retry: bool = True, **kw) -> Any:
        if not self._token:
            self._login()
        try:
            r = self._http.request(method, path, headers={"Authorization": f"Bearer {self._token}"}, **kw)
        except httpx.TransportError:
            raise ReqManUnreachable(self.base_url)
        if r.status_code == 401 and retry:
            self._token = None
            return self._request(method, path, retry=False, **kw)
        if r.status_code >= 400:
            try:
                detail = r.json().get("detail", r.text)
            except Exception:
                detail = r.text
            if not isinstance(detail, str):
                detail = str(detail)
            raise ReqManError(r.status_code, detail)
        return r.json() if r.content else None

    def get(self, path: str, **params) -> Any:
        return self._request("GET", path, params={k: v for k, v in params.items() if v is not None})

    def post(self, path: str, json: Any = None) -> Any:
        return self._request("POST", path, json=json)

    # ── Projekte ──
    def list_projects(self) -> List[Dict]:
        return self.get("/api/projects")

    def resolve_project(self, name_or_id: Optional[str]) -> str:
        """Projekt-ID aus ID oder Name (Groß/Klein egal); sonst REQMAN_PROJECT."""
        wanted = (name_or_id or self.default_project or "").strip()
        projects = self.list_projects()
        names = ", ".join(p["name"] for p in projects) or "(keine)"
        if not wanted:
            raise ReqManError(404, f"Kein Projekt angegeben. Vorhanden: {names}.")
        for p in projects:
            if p["id"] == wanted:
                return p["id"]
        for p in projects:
            if p["name"].lower() == wanted.lower():
                return p["id"]
        raise ReqManError(404, f"Projekt ‚{wanted}‘ nicht gefunden. Vorhanden: {names}.")
