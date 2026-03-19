import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlalchemy.orm import Session

from database import get_db, DocumentType, DocumentTypeAssignment, User
from auth import get_current_user, require_editor, require_admin
from models import (
    DocumentTypeCreate, DocumentTypeUpdate, DocumentTypeResponse,
    ProjectStructureResponse, DocumentWithType, AssignDocumentTypeRequest
)
import doorstop_service as ds

router = APIRouter(prefix="/api", tags=["document-types"])


def _row_to_response(row: DocumentType) -> DocumentTypeResponse:
    props = json.loads(row.properties_json or "[]")
    return DocumentTypeResponse(
        id=row.id,
        name=row.name,
        color=row.color,
        default_prefix=row.default_prefix,
        description=row.description,
        properties=props,
    )


# --- Document Type CRUD ---

@router.get("/document-types", response_model=List[DocumentTypeResponse])
async def list_document_types(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.query(DocumentType).order_by(DocumentType.created_at).all()
    return [_row_to_response(r) for r in rows]


@router.post("/document-types", response_model=DocumentTypeResponse, status_code=201)
async def create_document_type(
    data: DocumentTypeCreate,
    current_user: User = Depends(require_editor),
    db: Session = Depends(get_db),
):
    row = DocumentType(
        id=str(uuid.uuid4()),
        name=data.name,
        color=data.color,
        default_prefix=data.default_prefix,
        description=data.description,
        properties_json=json.dumps([p.model_dump() for p in data.properties]),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_response(row)


@router.put("/document-types/{type_id}", response_model=DocumentTypeResponse)
async def update_document_type(
    type_id: str,
    data: DocumentTypeUpdate,
    current_user: User = Depends(require_editor),
    db: Session = Depends(get_db),
):
    row = db.query(DocumentType).filter(DocumentType.id == type_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Document type not found")

    if data.name is not None:
        row.name = data.name
    if data.color is not None:
        row.color = data.color
    if data.default_prefix is not None:
        row.default_prefix = data.default_prefix
    if data.description is not None:
        row.description = data.description
    if data.properties is not None:
        row.properties_json = json.dumps([p.model_dump() for p in data.properties])

    db.commit()
    db.refresh(row)
    return _row_to_response(row)


@router.delete("/document-types/{type_id}", status_code=204)
async def delete_document_type(
    type_id: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.query(DocumentType).filter(DocumentType.id == type_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Document type not found")
    db.delete(row)
    db.query(DocumentTypeAssignment).filter(
        DocumentTypeAssignment.document_type_id == type_id
    ).delete()
    db.commit()


# --- Project Structure ---

@router.get("/projects/{project_id}/structure", response_model=ProjectStructureResponse)
async def get_project_structure(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        docs = ds.list_documents(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Load all assignments for this project
    assignments = db.query(DocumentTypeAssignment).filter(
        DocumentTypeAssignment.project_id == project_id
    ).all()
    assignment_map = {a.prefix: a.document_type_id for a in assignments}

    # Load all document types for lookup
    all_types = {r.id: _row_to_response(r) for r in db.query(DocumentType).all()}

    result = []
    for doc in docs:
        type_id = assignment_map.get(doc["prefix"])
        doc_type = all_types.get(type_id) if type_id else None
        result.append(DocumentWithType(
            **doc,
            document_type_id=type_id,
            document_type=doc_type,
        ))

    return ProjectStructureResponse(documents=result)


@router.put("/projects/{project_id}/documents/{prefix}/type", status_code=200)
async def assign_document_type(
    project_id: str,
    prefix: str,
    data: AssignDocumentTypeRequest,
    current_user: User = Depends(require_editor),
    db: Session = Depends(get_db),
):
    existing = db.query(DocumentTypeAssignment).filter(
        DocumentTypeAssignment.project_id == project_id,
        DocumentTypeAssignment.prefix == prefix,
    ).first()

    if data.document_type_id is None:
        if existing:
            db.delete(existing)
            db.commit()
        return {"ok": True}

    # Verify type exists
    type_row = db.query(DocumentType).filter(DocumentType.id == data.document_type_id).first()
    if not type_row:
        raise HTTPException(status_code=404, detail="Document type not found")

    if existing:
        existing.document_type_id = data.document_type_id
    else:
        db.add(DocumentTypeAssignment(
            project_id=project_id,
            prefix=prefix,
            document_type_id=data.document_type_id,
        ))
    db.commit()
    return {"ok": True}
