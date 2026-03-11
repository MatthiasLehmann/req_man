"""
Service layer for interacting with doorstop projects.
Wraps the doorstop Python API and adds project management.
"""
import os
import json
import yaml
import doorstop
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path

PROJECTS_ROOT = os.path.join(os.path.dirname(__file__), '..', 'projects')
PROJECTS_CONFIG = os.path.join(os.path.dirname(__file__), '..', 'data', 'projects.json')
ATTRIBUTES_CONFIG = os.path.join(os.path.dirname(__file__), '..', 'data', 'attributes.yml')

os.makedirs(PROJECTS_ROOT, exist_ok=True)


def _load_projects_config() -> Dict:
    if os.path.exists(PROJECTS_CONFIG):
        with open(PROJECTS_CONFIG) as f:
            return json.load(f)
    return {"projects": []}


def _save_projects_config(config: Dict):
    os.makedirs(os.path.dirname(PROJECTS_CONFIG), exist_ok=True)
    with open(PROJECTS_CONFIG, 'w') as f:
        json.dump(config, f, indent=2)


def list_projects() -> List[Dict]:
    config = _load_projects_config()
    return config.get("projects", [])


def get_project(project_id: str) -> Optional[Dict]:
    projects = list_projects()
    return next((p for p in projects if p["id"] == project_id), None)


def create_project(name: str, description: str = "", path: str = "") -> Dict:
    """Legt ein neues, leeres Doorstop-Projekt an dem angegebenen Pfad an."""
    import uuid
    import git_service

    if not path:
        raise ValueError("Ein Speicherpfad ist erforderlich.")

    path = os.path.abspath(path)
    os.makedirs(path, exist_ok=True)

    # Git-Repo initialisieren (idempotent – existiert es schon, wird es genutzt)
    git_service.get_or_init_repo(path)

    project_id = str(uuid.uuid4())[:8]
    project = {
        "id": project_id,
        "name": name,
        "description": description,
        "path": path,
    }

    config = _load_projects_config()
    config["projects"].append(project)
    _save_projects_config(config)

    return project


def import_project(path: str, name: Optional[str] = None, description: str = "") -> Dict:
    """
    Importiert ein bestehendes Doorstop-Projekt aus einem Verzeichnis.
    Es wird nur in der Registry registriert; die Dateien bleiben unverändert.
    """
    import uuid

    path = os.path.abspath(path)
    if not os.path.isdir(path):
        raise ValueError(f"Verzeichnis nicht gefunden: {path}")

    # Prüfen ob dieser Pfad bereits registriert ist
    config = _load_projects_config()
    for p in config.get("projects", []):
        if os.path.abspath(p["path"]) == path:
            raise ValueError(f"Dieses Verzeichnis ist bereits als Projekt '{p['name']}' registriert.")

    # Name aus Verzeichnisnamen ableiten wenn nicht angegeben
    if not name:
        name = os.path.basename(path)

    project_id = str(uuid.uuid4())[:8]
    project = {
        "id": project_id,
        "name": name,
        "description": description or "",
        "path": path,
    }

    config["projects"].append(project)
    _save_projects_config(config)

    return project


def delete_project(project_id: str, delete_files: bool = False) -> bool:
    """
    Entfernt ein Projekt aus der Registry.
    Mit delete_files=True wird auch das Verzeichnis physisch gelöscht.
    """
    import shutil

    config = _load_projects_config()
    projects = config.get("projects", [])
    project = next((p for p in projects if p["id"] == project_id), None)

    if not project:
        return False

    if delete_files:
        path = project["path"]
        if os.path.isdir(path):
            shutil.rmtree(path)

    config["projects"] = [p for p in projects if p["id"] != project_id]
    _save_projects_config(config)
    return True


def _build_tree(project_path: str) -> doorstop.Tree:
    """Build a doorstop tree from a project path."""
    return doorstop.build(cwd=project_path, root=project_path)


def list_documents(project_id: str) -> List[Dict]:
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    if not os.path.exists(path):
        return []

    try:
        tree = _build_tree(path)
        documents = []
        for doc in tree.documents:
            documents.append(_document_to_dict(doc))
        return documents
    except doorstop.DoorstopError:
        return []


def _document_to_dict(doc: doorstop.Document) -> Dict:
    parent_prefix = None
    try:
        if doc.parent:
            parent_prefix = doc.parent
    except Exception:
        pass

    children = []
    try:
        for child in doc.children:
            children.append(child.prefix)
    except Exception:
        pass

    return {
        "prefix": doc.prefix,
        "path": str(doc.path),
        "sep": doc.sep,
        "item_count": len(doc.items),
        "parent": parent_prefix,
        "children": children,
    }


def create_document(project_id: str, prefix: str, parent: Optional[str] = None, sep: str = "") -> Dict:
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    doc_path = os.path.join(path, prefix)

    os.makedirs(doc_path, exist_ok=True)
    try:
        tree = _build_tree(path)
        doc = tree.create_document(doc_path, prefix, parent=parent, sep=sep or None)
        return _document_to_dict(doc)
    except doorstop.DoorstopError:
        # If tree doesn't exist yet, create first document directly
        doc = doorstop.Document.new(None, doc_path, path, prefix)
        doc.save()
        return {
            "prefix": prefix,
            "path": doc_path,
            "sep": sep or "",
            "item_count": 0,
            "parent": parent,
            "children": [],
        }


def delete_document(project_id: str, prefix: str) -> bool:
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    try:
        tree = _build_tree(path)
        doc = tree.find_document(prefix)
        import shutil
        shutil.rmtree(str(doc.path))
        return True
    except (doorstop.DoorstopError, FileNotFoundError):
        return False


def list_items(project_id: str, prefix: str) -> List[Dict]:
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    try:
        tree = _build_tree(path)
        doc = tree.find_document(prefix)
        return [_item_to_dict(item) for item in sorted(doc.items, key=lambda i: str(i.level))]
    except doorstop.DoorstopError:
        return []


def get_item(project_id: str, uid: str) -> Optional[Dict]:
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    try:
        tree = _build_tree(path)
        item = tree.find_item(uid)
        return _item_to_dict(item)
    except doorstop.DoorstopError:
        return None


def _item_to_dict(item: doorstop.Item) -> Dict:
    # Standard doorstop fields to exclude from custom attributes
    standard_keys = {'uid', 'active', 'derived', 'header', 'level', 'links',
                     'normative', 'ref', 'references', 'reviewed', 'text'}

    custom_attributes = {}
    try:
        data = item.data
        for key, value in data.items():
            if key not in standard_keys:
                custom_attributes[key] = value
    except Exception:
        pass

    links = []
    try:
        for link in item.links:
            links.append(str(link))
    except Exception:
        pass

    # item.reviewed ist eine bool-Property (aktueller Stamp == gespeicherter Stamp).
    # Den tatsächlichen Hash-String bekommt man über item._data["reviewed"] → str(Stamp).
    # Stamp.__str__() gibt "" für Stamp(True/False/None) und den SHA256-String für echte Hashes.
    reviewed = None
    reviewed_current = None  # None = nie reviewed, True = Fingerprint ok, False = Inhalt geändert
    try:
        rv_stamp = item._data.get("reviewed")
        if rv_stamp:  # Stamp(True) oder Stamp("hash...") sind truthy
            rv_str = str(rv_stamp)  # "" für Stamp(True), SHA256 für echte Stempel
            if rv_str:
                reviewed = rv_str
                # item.reviewed (bool-Property) prüft ob aktueller Fingerprint mit gespeichertem übereinstimmt
                reviewed_current = bool(item.reviewed)
    except Exception:
        pass

    # Handle header: may be empty string in doorstop 3.1
    header_val = False
    try:
        h = item.header
        header_val = bool(h) if h not in ('', None) else False
    except Exception:
        pass

    # references – Liste von Dicts mit type/path/keyword/sha
    references: List[Dict] = []
    try:
        raw_refs = item.references
        if raw_refs:
            for r in raw_refs:
                ref_dict = dict(r) if hasattr(r, "items") else {}
                references.append({
                    "type":    ref_dict.get("type", "file"),
                    "path":    ref_dict.get("path", ""),
                    "keyword": ref_dict.get("keyword", ""),
                    "sha":     ref_dict.get("sha"),
                })
    except Exception:
        pass

    return {
        "uid": str(item.uid),
        "level": str(item.level),
        "text": (item.text or "").strip(),
        "header": header_val,
        "normative": bool(item.normative),
        "active": bool(item.active),
        "derived": bool(item.derived),
        "links": links,
        "reviewed": reviewed,
        "reviewed_current": reviewed_current,
        "custom_attributes": custom_attributes,
        "references": references,
    }


def create_item(project_id: str, prefix: str, data: Dict) -> Dict:
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    try:
        tree = _build_tree(path)
        doc = tree.find_document(prefix)
        item = doc.add_item()

        # Disable auto-save to avoid partial writes
        item.auto = False

        try:
            if data.get("text"):
                item.text = data["text"]
            if data.get("level"):
                item.level = doorstop.core.types.Level(data["level"])
            if "header" in data:
                h_val = data["header"]
                if isinstance(h_val, bool):
                    if not h_val:
                        item._data["header"] = doorstop.core.types.Text("")
                    else:
                        # Use UID as default header title for new header items
                        item._data["header"] = doorstop.core.types.Text(str(item.uid))
                elif isinstance(h_val, str):
                    item._data["header"] = doorstop.core.types.Text(h_val)
            if "normative" in data:
                item.normative = data["normative"]
            if "active" in data:
                item.active = data["active"]
            if data.get("links"):
                for link in data["links"]:
                    item.link(link)

            # Set custom attributes
            custom_attrs = data.get("custom_attributes", {})
            for key, value in custom_attrs.items():
                item.set(key, value)
        finally:
            item.auto = True

        item.save()
        return _item_to_dict(item)
    except doorstop.DoorstopError as e:
        raise ValueError(str(e))


def update_item(project_id: str, uid: str, data: Dict) -> Optional[Dict]:
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    try:
        tree = _build_tree(path)
        item = tree.find_item(uid)

        # Disable auto-save so that each property setter doesn't immediately
        # write to disk. This prevents partial saves when a later setter fails.
        # We do one explicit item.save() at the end.
        item.auto = False

        try:
            if "text" in data and data["text"] is not None:
                item.text = data["text"]
            if "level" in data and data["level"] is not None:
                item.level = doorstop.core.types.Level(data["level"])
            if "header" in data:
                h_val = data["header"]
                if isinstance(h_val, bool):
                    if not h_val:
                        # False → clear the header text
                        item._data["header"] = doorstop.core.types.Text("")
                    else:
                        # True → doorstop.Text(True) raises TypeError.
                        # Keep existing header text if already set.
                        # If the item has no header text yet, use the UID as
                        # a default title so the item becomes a proper header.
                        existing = str(item._data.get("header", ""))
                        if not existing:
                            item._data["header"] = doorstop.core.types.Text(str(item.uid))
                elif isinstance(h_val, str):
                    # String value: set directly (e.g. header title text)
                    item._data["header"] = doorstop.core.types.Text(h_val)
            if "normative" in data and data["normative"] is not None:
                item.normative = data["normative"]
            if "active" in data and data["active"] is not None:
                item.active = data["active"]
            if "derived" in data and data["derived"] is not None:
                item.derived = data["derived"]

            if "links" in data and data["links"] is not None:
                # Clear existing links and set new ones
                item.links = []
                for link in data["links"]:
                    try:
                        item.link(link)
                    except Exception:
                        pass

            # Update custom attributes
            custom_attrs = data.get("custom_attributes", {})
            if custom_attrs:
                for key, value in custom_attrs.items():
                    item.set(key, value)
        finally:
            item.auto = True

        item.save()
        return _item_to_dict(item)
    except doorstop.DoorstopError as e:
        raise ValueError(str(e))


def review_item(project_id: str, uid: str) -> Optional[Dict]:
    """
    Stempelt ein Item mit dem aktuellen Inhalts-Hash (item.review()).
    Entspricht 'doorstop review <UID>' auf der CLI.
    Gibt das aktualisierte Item-Dict zurück.
    """
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    try:
        tree = _build_tree(path)
        item = tree.find_item(uid)
        item.review()      # setzt _data["reviewed"] = item.stamp(links=True) und speichert
        return _item_to_dict(item)
    except doorstop.DoorstopError as e:
        raise ValueError(str(e))


def delete_item(project_id: str, uid: str) -> bool:
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    try:
        tree = _build_tree(path)
        prefix = uid.split("-")[0]
        doc = tree.find_document(prefix)
        item = tree.find_item(uid)
        doc.remove_item(uid)
        return True
    except doorstop.DoorstopError:
        return False


def add_link(project_id: str, source_uid: str, target_uid: str) -> Optional[Dict]:
    """Fügt einen Link von source_uid zu target_uid hinzu."""
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    try:
        tree = _build_tree(path)
        item = tree.find_item(source_uid)

        # Kein doppelter Link
        existing = [str(lnk) for lnk in item.links]
        if target_uid in existing:
            return _item_to_dict(item)  # already linked – idempotent

        item.link(target_uid)
        item.save()
        return _item_to_dict(item)
    except doorstop.DoorstopError as e:
        raise ValueError(str(e))


def remove_link(project_id: str, source_uid: str, target_uid: str) -> Optional[Dict]:
    """Entfernt einen Link von source_uid zu target_uid."""
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    try:
        tree = _build_tree(path)
        item = tree.find_item(source_uid)
        item.unlink(target_uid)
        item.save()
        return _item_to_dict(item)
    except doorstop.DoorstopError as e:
        raise ValueError(str(e))


def get_traceability(project_id: str) -> Dict:
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    nodes = []
    links = []

    try:
        tree = _build_tree(path)
        all_uids = set()

        for doc in tree.documents:
            for item in doc.items:
                uid = str(item.uid)
                all_uids.add(uid)
                nodes.append({
                    "uid": uid,
                    "text": (item.text or "")[:100],
                    "level": str(item.level),
                    "document": doc.prefix,
                    "active": bool(item.active),
                    "normative": bool(item.normative),
                })

        for doc in tree.documents:
            for item in doc.items:
                src_uid = str(item.uid)
                for link in item.links:
                    target_uid = str(link)
                    links.append({
                        "source": src_uid,
                        "target": target_uid,
                        "valid": target_uid in all_uids,
                    })
    except doorstop.DoorstopError:
        pass

    return {"nodes": nodes, "links": links}


def get_metrics(project_id: str) -> Dict:
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    path = project["path"]
    doc_metrics = []
    total_items = 0
    total_linked = 0
    total_reviewed = 0

    try:
        tree = _build_tree(path)

        for doc in tree.documents:
            items = list(doc.items)
            total = len(items)
            active = sum(1 for i in items if i.active)
            normative = sum(1 for i in items if i.normative)
            headers = sum(1 for i in items if i.header)

            linked = sum(1 for i in items if len(list(i.links)) > 0)
            reviewed_count = 0
            for item in items:
                try:
                    if item.reviewed:
                        reviewed_count += 1
                except Exception:
                    pass

            total_items += total
            total_linked += linked
            total_reviewed += reviewed_count

            doc_metrics.append({
                "prefix": doc.prefix,
                "total": total,
                "active": active,
                "inactive": total - active,
                "normative": normative,
                "non_normative": total - normative,
                "reviewed": reviewed_count,
                "unreviewed": total - reviewed_count,
                "linked": linked,
                "unlinked": total - linked,
                "headers": headers,
            })
    except doorstop.DoorstopError:
        pass

    link_coverage = (total_linked / total_items * 100) if total_items > 0 else 0
    review_coverage = (total_reviewed / total_items * 100) if total_items > 0 else 0

    return {
        "total_items": total_items,
        "total_documents": len(doc_metrics),
        "documents": doc_metrics,
        "link_coverage": round(link_coverage, 1),
        "review_coverage": round(review_coverage, 1),
    }


def load_attribute_config() -> List[Dict]:
    if os.path.exists(ATTRIBUTES_CONFIG):
        with open(ATTRIBUTES_CONFIG) as f:
            data = yaml.safe_load(f)
            return data.get("attributes", [])
    return []


def save_attribute_config(attributes: List[Dict]):
    os.makedirs(os.path.dirname(ATTRIBUTES_CONFIG), exist_ok=True)
    with open(ATTRIBUTES_CONFIG, 'w') as f:
        yaml.dump({"attributes": attributes}, f, default_flow_style=False, allow_unicode=True)


# ─── References ───────────────────────────────────────────────────────────────

def _compute_sha256(file_path: str) -> Optional[str]:
    """Berechnet den SHA256-Hash einer Datei. Gibt None zurück wenn nicht lesbar."""
    import hashlib
    try:
        with open(file_path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None


def get_references(project_id: str, uid: str) -> List[Dict]:
    """Gibt die references-Liste eines Items zurück (ohne Hash-Statusprüfung)."""
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")
    try:
        tree = _build_tree(project["path"])
        item = tree.find_item(uid)
        raw = item.references or []
        return [
            {
                "type":    dict(r).get("type", "file"),
                "path":    dict(r).get("path", ""),
                "keyword": dict(r).get("keyword", ""),
                "sha":     dict(r).get("sha"),
            }
            for r in raw
        ]
    except doorstop.DoorstopError as e:
        raise ValueError(str(e))


def update_references(project_id: str, uid: str, references: List[Dict]) -> List[Dict]:
    """
    Speichert die references-Liste eines Items und berechnet für jeden Eintrag
    mit gültigem Pfad den SHA256-Hash neu.
    """
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    project_path = project["path"]
    try:
        tree = _build_tree(project_path)
        item = tree.find_item(uid)

        normalized: List[Dict] = []
        for ref in references:
            entry: Dict = {
                "type":    ref.get("type", "file"),
                "path":    ref.get("path", "").strip(),
                "keyword": ref.get("keyword", "").strip(),
            }
            # SHA256 neu berechnen wenn Datei gefunden wird
            if entry["path"]:
                abs_path = os.path.join(project_path, entry["path"])
                sha = _compute_sha256(abs_path)
                if sha:
                    entry["sha"] = sha
                elif ref.get("sha"):
                    entry["sha"] = ref["sha"]   # alten Hash behalten wenn Datei fehlt
            normalized.append(entry)

        item.references = normalized if normalized else None
        item.save()
        return normalized
    except doorstop.DoorstopError as e:
        raise ValueError(str(e))


def check_reference_hashes(project_id: str, uid: str) -> List[Dict]:
    """
    Prüft den Hash-Status aller References eines Items.
    Status-Werte: 'ok' | 'changed' | 'missing' | 'no_hash'
    """
    project = get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    project_path = project["path"]
    try:
        tree = _build_tree(project_path)
        item = tree.find_item(uid)
        raw = item.references or []

        results: List[Dict] = []
        for r in raw:
            ref = dict(r)
            abs_path = os.path.join(project_path, ref.get("path", ""))
            stored_sha: Optional[str] = ref.get("sha")

            if not os.path.isfile(abs_path):
                status = "missing"
                current_sha = None
            else:
                current_sha = _compute_sha256(abs_path)
                if not stored_sha:
                    status = "no_hash"
                elif current_sha == stored_sha:
                    status = "ok"
                else:
                    status = "changed"

            results.append({
                "type":        ref.get("type", "file"),
                "path":        ref.get("path", ""),
                "keyword":     ref.get("keyword", ""),
                "sha":         stored_sha,
                "status":      status,
                "current_sha": current_sha,
            })
        return results
    except doorstop.DoorstopError as e:
        raise ValueError(str(e))
