from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, UniqueConstraint, Text, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from datetime import datetime, timezone
import os

DATABASE_URL = f"sqlite:///{os.path.join(os.path.dirname(__file__), '..', 'data', 'reqman.db')}"

os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'data'), exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="viewer")  # admin, editor, viewer
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    home_dir = Column(String, nullable=True)  # Basis-Verzeichnis für den Filesystem-Browser


class DocumentType(Base):
    __tablename__ = "document_types"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    color = Column(String, default="#3b82f6")
    default_prefix = Column(String, default="")
    description = Column(String, default="")
    properties_json = Column(String, default="[]")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DocumentTypeAssignment(Base):
    __tablename__ = "document_type_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, nullable=False, index=True)
    prefix = Column(String, nullable=False)
    document_type_id = Column(String, nullable=False)

    __table_args__ = (UniqueConstraint('project_id', 'prefix'),)


class Proposal(Base):
    """Änderungsvorschlag von Agenten/Assistent; übernommen wird nur durch einen Menschen (editor/admin)."""
    __tablename__ = "proposals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, nullable=False, index=True)
    kind = Column(String, nullable=False)   # change_text | new_item | add_link
    uid = Column(String, nullable=True, index=True)
    prefix = Column(String, nullable=True)
    payload = Column(Text, nullable=False, default="{}")   # JSON je Art
    reason = Column(Text, nullable=False, default="")
    source = Column(String, nullable=False, default="mcp")
    base_hash = Column(String, nullable=True)
    status = Column(String, nullable=False, default="open")   # open | accepted | rejected | stale
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    decided_by = Column(String, nullable=True)
    decided_at = Column(DateTime, nullable=True)


class FindingFeedback(Base):
    """Rückmeldung eines Menschen zu einem KI-Befund („trifft zu“ / „trifft nicht zu“), Quelle des Fallspeichers (L2)."""
    __tablename__ = "finding_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, nullable=False, index=True)
    uid = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False)
    finding = Column(Text, nullable=False)              # Befundtext (Beschreibung)
    requirement_text = Column(Text, nullable=False)     # Text der Anforderung zum Zeitpunkt des Urteils
    text_hash = Column(String, nullable=False)          # SHA-256 des Anforderungstexts
    verdict = Column(String, nullable=False)            # applies | not_applies
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    # Migration: home_dir-Spalte nachrüsten falls Datenbank bereits existiert
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(users)"))]
        if "home_dir" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN home_dir TEXT"))
