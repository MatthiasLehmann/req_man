"""
API-Router für die Bedeutungssuche (RAG) über die Anforderungen eines Projekts.

Endpunkte (Präfix /api/projects/{pid}):
  GET   /rag/status                    – Index abgleichen, Größe
  GET   /rag/search?q=&k=&prefix=      – Suche nach Bedeutung
  POST  /rag/similar-text              – ähnliche Anforderungen zu einem Text
  GET   /items/{uid}/similar           – ähnliche Anforderungen
  GET   /items/{uid}/link-suggestions  – Link-Vorschläge aus dem Eltern-Dokument
  GET   /items/{uid}/impact            – Auswirkungen einer Änderung
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

import embedding_service as emb
import rag_service as rag
from auth import get_current_user
from database import User

router = APIRouter(prefix="/api/projects/{project_id}", tags=["rag"])


class RagHit(BaseModel):
    uid: str
    prefix: str
    level: str
    text: str
    score: float
    linked: bool = False


class RagStatus(BaseModel):
    total: int
    model: str
    seconds: float


class LinkSuggestions(BaseModel):
    parent_document: Optional[str] = None
    suggestions: List[RagHit] = []


class ImpactItem(BaseModel):
    uid: str
    prefix: str
    text: str
    depth: int
    reviewed: Optional[bool] = None


class ImpactResult(BaseModel):
    uid: str
    downstream: List[ImpactItem]
    upstream: List[ImpactItem]
    similar_unlinked: List[RagHit]


class SimilarTextRequest(BaseModel):
    text: str
    prefix: Optional[str] = None
    exclude_uid: Optional[str] = None
    k: int = Field(default=5, ge=1, le=50)


async def _run(fn, *args, **kwargs):
    try:
        return await run_in_threadpool(fn, *args, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except emb.EmbeddingError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/rag/status", response_model=RagStatus)
async def rag_status(project_id: str, current_user: User = Depends(get_current_user)):
    r = await _run(rag.sync_project, project_id)
    return RagStatus(total=r["total"], model=r["model"], seconds=r["seconds"])


@router.get("/rag/search", response_model=List[RagHit])
async def rag_search(project_id: str, q: str = Query(..., min_length=1), k: int = Query(10, ge=1, le=50),
                     prefix: Optional[List[str]] = Query(None),
                     current_user: User = Depends(get_current_user)):
    return await _run(rag.search, project_id, q, k, prefix)


@router.post("/rag/similar-text", response_model=List[RagHit])
async def rag_similar_text(project_id: str, body: SimilarTextRequest,
                           current_user: User = Depends(get_current_user)):
    exclude = {body.exclude_uid} if body.exclude_uid else None
    prefixes = [body.prefix] if body.prefix else None
    return await _run(rag.similar_to_text, project_id, body.text, body.k, prefixes, exclude)


@router.get("/items/{uid}/similar", response_model=List[RagHit])
async def item_similar(project_id: str, uid: str, k: int = Query(5, ge=1, le=50),
                       current_user: User = Depends(get_current_user)):
    return await _run(rag.similar, project_id, uid, k)


@router.get("/items/{uid}/link-suggestions", response_model=LinkSuggestions)
async def item_link_suggestions(project_id: str, uid: str, k: int = Query(5, ge=1, le=20),
                                current_user: User = Depends(get_current_user)):
    return await _run(rag.suggest_links, project_id, uid, k)


@router.get("/items/{uid}/impact", response_model=ImpactResult)
async def item_impact(project_id: str, uid: str, current_user: User = Depends(get_current_user)):
    return await _run(rag.impact, project_id, uid)
