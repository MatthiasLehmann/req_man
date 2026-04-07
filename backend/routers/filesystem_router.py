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


@router.get("/browse", response_model=BrowseResponse)
async def browse_directory(
    path: str = Query(default=""),
    current_user: User = Depends(get_current_user),
):
    # Standard-Startpfad: konfiguriertes home_dir des Users, sonst ~
    default_path = current_user.home_dir or os.path.expanduser("~")
    abs_path = os.path.abspath(os.path.expanduser(path if path else default_path))

    if not os.path.isdir(abs_path):
        abs_path = os.path.dirname(abs_path)
        if not os.path.isdir(abs_path):
            abs_path = default_path

    parent = str(os.path.dirname(abs_path)) if abs_path != os.path.dirname(abs_path) else None

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
