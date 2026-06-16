from fastapi import APIRouter, Depends, Query
from typing import List
import os

from database import User
from auth import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/api/filesystem", tags=["filesystem"])


class DirEntry(BaseModel):
    name: str
    path: str
    is_dir: bool


class BrowseResponse(BaseModel):
    current: str
    parent: str | None
    entries: List[DirEntry]


def _within_base(path: str, base: str) -> bool:
    """True wenn path innerhalb von base liegt (oder gleich base ist)."""
    try:
        return os.path.commonpath([path, base]) == base
    except ValueError:
        # Unterschiedliche Laufwerke (Windows) o. ä.
        return False


@router.get("/browse", response_model=BrowseResponse)
async def browse_directory(
    path: str = Query(default=""),
    current_user: User = Depends(get_current_user),
):
    # Sandbox-Basis: konfiguriertes home_dir des Users, sonst ~.
    # Außerhalb dieser Basis ist kein Browsing erlaubt (Directory-Traversal-Schutz).
    base = os.path.realpath(os.path.expanduser(current_user.home_dir or "~"))

    requested = os.path.realpath(os.path.expanduser(path)) if path else base

    # Pfade außerhalb der Basis werden auf die Basis zurückgesetzt.
    if not _within_base(requested, base):
        requested = base

    abs_path = requested
    if not os.path.isdir(abs_path):
        abs_path = base

    # Parent nur freigeben, solange er noch innerhalb der Basis liegt.
    parent_dir = os.path.dirname(abs_path)
    parent = parent_dir if (abs_path != base and _within_base(parent_dir, base)) else None

    entries: List[DirEntry] = []
    try:
        for name in sorted(os.listdir(abs_path), key=lambda s: s.lower()):
            if name.startswith('.'):
                continue
            full = os.path.join(abs_path, name)
            entries.append(DirEntry(name=name, path=full, is_dir=os.path.isdir(full)))
    except PermissionError:
        pass

    return BrowseResponse(current=abs_path, parent=parent, entries=entries)
