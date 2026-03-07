from fastapi import APIRouter, Depends, HTTPException
from database import User
from auth import get_current_user
from models import ProjectMetrics
import doorstop_service as ds

router = APIRouter(prefix="/api/projects/{project_id}/metrics", tags=["metrics"])


@router.get("", response_model=ProjectMetrics)
async def get_metrics(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    try:
        return ds.get_metrics(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
