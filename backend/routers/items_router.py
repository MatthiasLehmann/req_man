from fastapi import APIRouter, Depends, HTTPException
from typing import List
from pydantic import BaseModel

from database import User
from auth import get_current_user, require_editor
from models import ItemCreate, ItemUpdate, ItemResponse
import doorstop_service as ds


class LinkCreate(BaseModel):
    target_uid: str

router = APIRouter(prefix="/api/projects/{project_id}", tags=["items"])


@router.get("/documents/{prefix}/items", response_model=List[ItemResponse])
async def list_items(
    project_id: str,
    prefix: str,
    current_user: User = Depends(get_current_user)
):
    try:
        return ds.list_items(project_id, prefix)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/documents/{prefix}/items", response_model=ItemResponse, status_code=201)
async def create_item(
    project_id: str,
    prefix: str,
    item: ItemCreate,
    current_user: User = Depends(require_editor)
):
    try:
        return ds.create_item(project_id, prefix, item.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/items/{uid}", response_model=ItemResponse)
async def get_item(
    project_id: str,
    uid: str,
    current_user: User = Depends(get_current_user)
):
    item = ds.get_item(project_id, uid)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.put("/items/{uid}", response_model=ItemResponse)
async def update_item(
    project_id: str,
    uid: str,
    item: ItemUpdate,
    current_user: User = Depends(require_editor)
):
    try:
        updated = ds.update_item(project_id, uid, item.model_dump(exclude_none=True))
        if not updated:
            raise HTTPException(status_code=404, detail="Item not found")
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Interner Fehler: {e}")


@router.delete("/items/{uid}", status_code=204)
async def delete_item(
    project_id: str,
    uid: str,
    current_user: User = Depends(require_editor)
):
    success = ds.delete_item(project_id, uid)
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")


@router.post("/items/{uid}/links", response_model=ItemResponse)
async def add_link(
    project_id: str,
    uid: str,
    body: LinkCreate,
    current_user: User = Depends(require_editor)
):
    try:
        result = ds.add_link(project_id, uid, body.target_uid)
        if result is None:
            raise HTTPException(status_code=404, detail="Item not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/items/{uid}/links/{target_uid}", response_model=ItemResponse)
async def remove_link(
    project_id: str,
    uid: str,
    target_uid: str,
    current_user: User = Depends(require_editor)
):
    try:
        result = ds.remove_link(project_id, uid, target_uid)
        if result is None:
            raise HTTPException(status_code=404, detail="Item not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/items/{uid}/review", response_model=ItemResponse)
async def review_item(
    project_id: str,
    uid: str,
    current_user: User = Depends(require_editor),
):
    """
    Stempelt ein Item mit dem aktuellen Inhalts-Hash (doorstop review).
    Setzt reviewed = SHA256(uid + text + ref + links).
    Erfordert Editor-Rolle.
    """
    try:
        result = ds.review_item(project_id, uid)
        if result is None:
            raise HTTPException(status_code=404, detail="Item nicht gefunden")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
