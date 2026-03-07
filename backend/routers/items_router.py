from fastapi import APIRouter, Depends, HTTPException
from typing import List

from database import User
from auth import get_current_user, require_editor
from models import ItemCreate, ItemUpdate, ItemResponse
import doorstop_service as ds

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


@router.delete("/items/{uid}", status_code=204)
async def delete_item(
    project_id: str,
    uid: str,
    current_user: User = Depends(require_editor)
):
    success = ds.delete_item(project_id, uid)
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
