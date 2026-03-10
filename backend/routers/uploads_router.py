from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
import os
import uuid
import shutil

from auth import get_current_user

router = APIRouter(prefix="/api", tags=["uploads"])

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")

ALLOWED_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
}

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}

MAX_SIZE_MB = 10


@router.post("/uploads")
async def upload_image(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """Upload a local image file and return its server URL."""

    # Validate MIME type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Dateityp nicht erlaubt: {file.content_type}. "
                   f"Erlaubt sind: JPEG, PNG, GIF, WebP, SVG",
        )

    # Validate file extension
    original_name = file.filename or "upload"
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = ".png"  # fallback

    # Read content with size check
    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"Datei zu groß. Maximale Größe: {MAX_SIZE_MB} MB",
        )

    # Persist to uploads directory
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOADS_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(content)

    return {
        "url": f"/uploads/{filename}",
        "filename": filename,
        "original_name": original_name,
        "size": len(content),
        "content_type": file.content_type,
    }
