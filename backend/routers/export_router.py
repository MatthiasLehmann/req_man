"""
Export router – liefert doorstop-Dokumente als CSV, TSV, XLSX oder YAML.
Unterstützt Export eines einzelnen Dokuments und des gesamten Projekts.
"""
import os
import tempfile
import shutil
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from database import User
from auth import get_current_user
import doorstop_service as ds
import doorstop
from doorstop.core import exporter

router = APIRouter(prefix="/api/projects/{project_id}", tags=["export"])

FORMATS = {
    "csv":  ".csv",
    "tsv":  ".tsv",
    "xlsx": ".xlsx",
    "yaml": ".yml",
}

MIME = {
    ".csv":  "text/csv",
    ".tsv":  "text/tab-separated-values",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".yml":  "text/yaml",
}


def _build_tree_for_project(project_id: str) -> tuple[doorstop.Tree, str]:
    project = ds.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    path = project["path"]
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Projektverzeichnis nicht gefunden")
    try:
        tree = doorstop.build(cwd=path, root=path)
        return tree, project["name"]
    except doorstop.DoorstopError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{prefix}/export")
async def export_document(
    project_id: str,
    prefix: str,
    format: str = Query("xlsx", description="csv | tsv | xlsx | yaml"),
    current_user: User = Depends(get_current_user),
):
    """Exportiert ein einzelnes Dokument als Tabelle."""
    if format not in FORMATS:
        raise HTTPException(status_code=400, detail=f"Ungültiges Format. Erlaubt: {', '.join(FORMATS)}")

    ext = FORMATS[format]
    tree, project_name = _build_tree_for_project(project_id)

    # Dokument aus dem Tree holen
    try:
        doc = tree.find_document(prefix)
    except doorstop.DoorstopError:
        raise HTTPException(status_code=404, detail=f"Dokument '{prefix}' nicht gefunden")

    # Temporäre Datei erzeugen
    tmp_dir = tempfile.mkdtemp()
    try:
        filename = f"{prefix}{ext}"
        out_path = os.path.join(tmp_dir, filename)

        exporter.export(doc, out_path, ext=ext)

        if not os.path.exists(out_path):
            raise HTTPException(status_code=500, detail="Export fehlgeschlagen – keine Ausgabedatei erzeugt")

        return FileResponse(
            path=out_path,
            media_type=MIME[ext],
            filename=filename,
            background=_cleanup_background(tmp_dir),
        )
    except HTTPException:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Export-Fehler: {e}")


@router.get("/export")
async def export_project(
    project_id: str,
    format: str = Query("xlsx", description="csv | tsv | xlsx | yaml"),
    current_user: User = Depends(get_current_user),
):
    """Exportiert alle Dokumente des Projekts als ZIP-Archiv."""
    if format not in FORMATS:
        raise HTTPException(status_code=400, detail=f"Ungültiges Format. Erlaubt: {', '.join(FORMATS)}")

    ext = FORMATS[format]
    tree, project_name = _build_tree_for_project(project_id)

    tmp_dir = tempfile.mkdtemp()
    try:
        export_dir = os.path.join(tmp_dir, "export")
        os.makedirs(export_dir)

        # doorstop schreibt für jeden Dokument-Präfix eine eigene Datei
        exporter.export(tree, export_dir, ext=ext)

        # Als ZIP verpacken
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in project_name)
        zip_base = os.path.join(tmp_dir, safe_name)
        zip_path = shutil.make_archive(zip_base, "zip", export_dir)

        return FileResponse(
            path=zip_path,
            media_type="application/zip",
            filename=f"{safe_name}_export_{format}.zip",
            background=_cleanup_background(tmp_dir),
        )
    except HTTPException:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Export-Fehler: {e}")


def _cleanup_background(tmp_dir: str):
    """Gibt eine BackgroundTask zurück, die das tmp-Verzeichnis nach der Response löscht."""
    from starlette.background import BackgroundTask
    return BackgroundTask(shutil.rmtree, tmp_dir, True)
