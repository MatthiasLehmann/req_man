"""
API-Router für „Frag ReqMan“ (A4).

  POST  /api/assistant/ask                      – Frage mit Quellen beantworten (ein Modellaufruf)
  GET   /api/help/search?q=&k=                  – Suche in den Hilfetexten (ohne Modell)
  GET   /api/projects/{pid}/next-steps          – „Was steht als Nächstes an?“ (ohne Modell)
"""
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

import ai_quality_service as aqs
import assistant_service as assistant
import doorstop_service as ds
import embedding_service as emb
import next_steps_service as ns
import rag_service as rag
from auth import get_current_user
from database import User

router = APIRouter(tags=["assistant"])


class AssistantContext(BaseModel):
    route: Optional[str] = None
    prefix: Optional[str] = None
    uid: Optional[str] = None


class AssistantTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AssistantAsk(BaseModel):
    project_id: Optional[str] = None
    question: str = Field(min_length=1, max_length=500)
    context: AssistantContext = AssistantContext()
    history: List[AssistantTurn] = []


class AssistantSource(BaseModel):
    kind: Literal["item", "help"]
    ref: str
    title: str
    snippet: str
    uid: Optional[str] = None
    prefix: Optional[str] = None
    route: Optional[str] = None
    anchor: Optional[str] = None


class AssistantAnswer(BaseModel):
    answer: str
    sources: List[AssistantSource]
    removed_refs: List[str] = []
    found: List[str] = []
    model: str
    seconds: float


class HelpHit(BaseModel):
    id: str
    title: str
    text: str
    route: str
    anchor: str
    score: float


class NextStep(BaseModel):
    key: str
    title: str
    count: int
    explanation: str
    route: str
    uids: List[str] = []


@router.post("/api/assistant/ask", response_model=AssistantAnswer)
async def ask(body: AssistantAsk, _: User = Depends(get_current_user)):
    if body.project_id and not ds.get_project(body.project_id):
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    try:
        return await run_in_threadpool(
            assistant.ask, body.project_id, body.question, body.context.model_dump(),
            [t.model_dump() for t in body.history])
    except emb.EmbeddingError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except aqs.AiProviderError as e:
        raise HTTPException(status_code=502, detail=f"Das Sprachmodell ist nicht erreichbar: {e}")


@router.get("/api/help/search", response_model=List[HelpHit])
async def help_search(q: str = Query(..., min_length=1, max_length=500), k: int = Query(5, ge=1, le=20),
                      _: User = Depends(get_current_user)):
    try:
        return await run_in_threadpool(rag.search_help, q, k)
    except emb.EmbeddingError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/api/projects/{project_id}/next-steps", response_model=List[NextStep])
async def next_steps(project_id: str, _: User = Depends(get_current_user)):
    try:
        return await run_in_threadpool(ns.next_steps, project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
