from fastapi import APIRouter, Depends, HTTPException
from typing import List

from database import User
from auth import get_current_user, require_editor
from models import ProjectCreate, ProjectImport, ProjectResponse
import doorstop_service as ds

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=List[ProjectResponse])
async def list_projects(current_user: User = Depends(get_current_user)):
    return ds.list_projects()


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    project: ProjectCreate,
    current_user: User = Depends(require_editor),
):
    try:
        return ds.create_project(project.name, project.description or "", project.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/import", response_model=ProjectResponse, status_code=201)
async def import_project(
    data: ProjectImport,
    current_user: User = Depends(require_editor),
):
    """Importiert ein bestehendes Doorstop-Projekt aus einem Dateisystempfad."""
    try:
        return ds.import_project(data.path, data.name or None, data.description or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, current_user: User = Depends(get_current_user)):
    project = ds.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    delete_files: bool = False,
    current_user: User = Depends(require_editor),
):
    """
    Entfernt ein Projekt aus der Registry.
    Mit ?delete_files=true wird das Verzeichnis physisch gelöscht.
    """
    ok = ds.delete_project(project_id, delete_files=delete_files)
    if not ok:
        raise HTTPException(status_code=404, detail="Project not found")
