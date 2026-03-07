from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any, Dict
from datetime import datetime


# Auth models
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


# User models
class UserBase(BaseModel):
    username: str
    email: str
    full_name: str
    role: str = "viewer"


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Project models
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    path: str  # Pflichtangabe: Verzeichnis, in dem das Projekt gespeichert wird


class ProjectImport(BaseModel):
    path: str                        # Pfad zu einem bestehenden Doorstop-Projekt
    name: Optional[str] = None       # Wenn leer, wird der Verzeichnisname verwendet
    description: Optional[str] = ""


class ProjectDelete(BaseModel):
    delete_files: bool = False       # True = Verzeichnis wird physisch gelöscht


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    path: str


# Document models
class DocumentCreate(BaseModel):
    prefix: str
    parent: Optional[str] = None
    sep: Optional[str] = None


class DocumentResponse(BaseModel):
    prefix: str
    path: str
    sep: str
    item_count: int
    parent: Optional[str] = None
    children: List[str] = []


# Item models
class ItemCreate(BaseModel):
    level: Optional[str] = None
    text: Optional[str] = ""
    header: Optional[bool] = False
    normative: Optional[bool] = True
    active: Optional[bool] = True
    links: Optional[List[str]] = []
    custom_attributes: Optional[Dict[str, Any]] = {}


class ItemUpdate(BaseModel):
    level: Optional[str] = None
    text: Optional[str] = None
    header: Optional[bool] = None
    normative: Optional[bool] = None
    active: Optional[bool] = None
    derived: Optional[bool] = None
    links: Optional[List[str]] = None
    custom_attributes: Optional[Dict[str, Any]] = None


class ItemResponse(BaseModel):
    uid: str
    level: str
    text: str
    header: bool
    normative: bool
    active: bool
    derived: bool
    links: List[str]
    reviewed: Optional[str] = None
    custom_attributes: Dict[str, Any] = {}


# Attribute config models
class AttributeDefinition(BaseModel):
    key: str
    display_name: str
    attr_type: str  # string, boolean, integer, enum, text, list
    default_value: Any = None
    possible_values: Optional[List[str]] = None
    required: bool = False
    applies_to: List[str] = []  # document prefixes, empty = all
    help_text: Optional[str] = None  # Hilfetext / Beschreibung des Attributs


class AttributeConfig(BaseModel):
    attributes: List[AttributeDefinition]


# Traceability models
class TraceabilityNode(BaseModel):
    uid: str
    text: str
    level: str
    document: str
    active: bool
    normative: bool


class TraceabilityLink(BaseModel):
    source: str
    target: str
    valid: bool


class TraceabilityData(BaseModel):
    nodes: List[TraceabilityNode]
    links: List[TraceabilityLink]


# Metrics models
class DocumentMetrics(BaseModel):
    prefix: str
    total: int
    active: int
    inactive: int
    normative: int
    non_normative: int
    reviewed: int
    unreviewed: int
    linked: int
    unlinked: int
    headers: int


class ProjectMetrics(BaseModel):
    total_items: int
    total_documents: int
    documents: List[DocumentMetrics]
    link_coverage: float
    review_coverage: float
