from fastapi import APIRouter, Depends
from typing import List

from database import User
from auth import get_current_user, require_admin
from models import AttributeDefinition
import doorstop_service as ds

router = APIRouter(prefix="/api/attributes", tags=["attributes"])


@router.get("", response_model=List[AttributeDefinition])
async def get_attributes(current_user: User = Depends(get_current_user)):
    raw = ds.load_attribute_config()
    return raw


@router.put("")
async def update_attributes(
    attributes: List[AttributeDefinition],
    current_user: User = Depends(require_admin)
):
    data = [a.model_dump() for a in attributes]
    ds.save_attribute_config(data)
    return {"status": "ok"}
