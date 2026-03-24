from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from database import init_db, SessionLocal, User
from auth import get_password_hash
from routers import auth_router, users_router, projects_router
from routers import documents_router, items_router, traceability_router
from routers import metrics_router, attributes_router, validation_router
from routers import uploads_router, localfile_router, plantuml_router, references_router
from routers import filesystem_router
from routers import document_types_router
from routers import export_router
from routers import ai_quality_router

app = FastAPI(title="ReqMan - Requirements Management", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(projects_router.router)
app.include_router(documents_router.router)
app.include_router(items_router.router)
app.include_router(traceability_router.router)
app.include_router(metrics_router.router)
app.include_router(attributes_router.router)
app.include_router(validation_router.router)
app.include_router(uploads_router.router)
app.include_router(localfile_router.router)
app.include_router(plantuml_router.router)
app.include_router(references_router.router)
app.include_router(filesystem_router.router)
app.include_router(document_types_router.router)
app.include_router(export_router.router)
app.include_router(ai_quality_router.router)
app.include_router(ai_quality_router.settings_router)

# Serve uploaded images as static files
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Serve frontend static files if built
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


def create_default_admin():
    """Create default admin user if no users exist."""
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            admin = User(
                username="admin",
                email="admin@reqman.local",
                full_name="Administrator",
                hashed_password=get_password_hash("admin123"),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print("✓ Default admin user created (username: admin, password: admin123)")
            print("  → Change the password immediately after first login!")
    finally:
        db.close()


@app.on_event("startup")
async def startup():
    init_db()
    create_default_admin()
    print("✓ ReqMan backend started")
    print("  API docs: http://localhost:8000/docs")
