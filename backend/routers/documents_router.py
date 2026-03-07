from fastapi import APIRouter, Depends, HTTPException
from typing import List

from database import User
from auth import get_current_user, require_editor
from models import DocumentCreate, DocumentResponse
import doorstop_service as ds

router = APIRouter(prefix="/api/projects/{project_id}/documents", tags=["documents"])


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    try:
        return ds.list_documents(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("", response_model=DocumentResponse, status_code=201)
async def create_document(
    project_id: str,
    doc: DocumentCreate,
    current_user: User = Depends(require_editor)
):
    try:
        return ds.create_document(project_id, doc.prefix, doc.parent, doc.sep or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{prefix}", status_code=204)
async def delete_document(
    project_id: str,
    prefix: str,
    current_user: User = Depends(require_editor)
):
    success = ds.delete_document(project_id, prefix)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")
