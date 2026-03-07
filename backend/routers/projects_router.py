from fastapi import APIRouter, Depends, HTTPException
from typing import List

from database import User
from auth import get_current_user, require_editor
from models import ProjectCreate, ProjectResponse
import doorstop_service as ds

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=List[ProjectResponse])
async def list_projects(current_user: User = Depends(get_current_user)):
    return ds.list_projects()


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    project: ProjectCreate,
    current_user: User = Depends(require_editor)
):
    return ds.create_project(project.name, project.description or "", project.path)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, current_user: User = Depends(get_current_user)):
    project = ds.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
