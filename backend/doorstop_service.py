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


def create_project(name: str, description: str = "", path: Optional[str] = None) -> Dict:
    import uuid
    project_id = str(uuid.uuid4())[:8]
    if path is None:
        path = os.path.join(PROJECTS_ROOT, project_id)

    os.makedirs(path, exist_ok=True)

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

    # In doorstop 3.1, reviewed is False (not None) when unreviewed
    reviewed = None
    try:
        rv = item.reviewed
        if rv and rv is not False:
            reviewed = str(rv)
    except Exception:
        pass

    # Handle header: may be empty string in doorstop 3.1
    header_val = False
    try:
        h = item.header
        header_val = bool(h) if h not in ('', None) else False
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
        "custom_attributes": custom_attributes,
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

        if data.get("text"):
            item.text = data["text"]
        if data.get("level"):
            item.level = doorstop.core.types.Level(data["level"])
        if "header" in data:
            item.header = data["header"]
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

        if "text" in data and data["text"] is not None:
            item.text = data["text"]
        if "level" in data and data["level"] is not None:
            item.level = doorstop.core.types.Level(data["level"])
        if "header" in data and data["header"] is not None:
            item.header = data["header"]
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

        item.save()
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
