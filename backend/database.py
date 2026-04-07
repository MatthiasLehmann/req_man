from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, UniqueConstraint, text
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
