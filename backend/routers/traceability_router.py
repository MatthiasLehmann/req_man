from fastapi import APIRouter, Depends, HTTPException
from database import User
from auth import get_current_user
from models import TraceabilityData
import doorstop_service as ds

router = APIRouter(prefix="/api/projects/{project_id}/traceability", tags=["traceability"])


@router.get("", response_model=TraceabilityData)
async def get_traceability(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    try:
        return ds.get_traceability(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
