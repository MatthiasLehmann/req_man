"""
Git-Service für req_man – verwaltet das Git-Repository pro Projekt.

Jedes Projekt bekommt sein eigenes Git-Repository im Projektverzeichnis.
Git-Operationen werden ausschließlich über gitpython durchgeführt.
"""
import fnmatch
from pathlib import Path
from typing import Optional

from git import NULL_TREE, Actor, InvalidGitRepositoryError, Repo


def get_or_init_repo(project_path: str) -> Repo:
    """
    Gibt das Git-Repo im Projektverzeichnis zurück.
    Falls noch keins existiert, wird eines initialisiert.
    Sucht NICHT in übergeordneten Verzeichnissen – jedes Projekt
    bekommt ein isoliertes eigenes Repo.
    """
    try:
        return Repo(project_path)
    except InvalidGitRepositoryError:
        repo = Repo.init(project_path)
        _create_gitignore(project_path)
        return repo
    except Exception:
        repo = Repo.init(project_path)
        _create_gitignore(project_path)
        return repo


def _create_gitignore(project_path: str) -> None:
    gitignore = Path(project_path) / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(
            "__pycache__/\n*.pyc\n.DS_Store\n*.db\n",
            encoding="utf-8",
        )


def is_git_repo(project_path: str) -> bool:
    """Prüft ob am Projektpfad ein Git-Repo existiert."""
    try:
        Repo(project_path)
        return True
    except Exception:
        return False


def commit_validation(
    project_path: str,
    req_yaml_rel: str,
    report_rel: str,
    commit_message: str,
    author_name: str,
    author_email: str,
) -> str:
    """
    Fügt req-YAML + Validierungsreport zum Index hinzu und erstellt einen Commit.
    Gibt den Commit-Hash (hexsha) zurück.

    req_yaml_rel und report_rel sind Pfade relativ zu project_path.
    """
    repo = get_or_init_repo(project_path)

    # Dateien relativ zum Repo-Root adden
    repo.index.add([req_yaml_rel, report_rel])

    actor = Actor(author_name, author_email)
    commit = repo.index.commit(
        commit_message,
        author=actor,
        committer=actor,
    )
    return commit.hexsha


def get_repo_log(project_path: str, max_count: int = 50) -> list:
    """Gibt die letzten max_count Commits des Projekt-Repos zurück."""
    try:
        repo = get_or_init_repo(project_path)
        result = []
        for commit in repo.iter_commits(max_count=max_count):
            result.append({
                "hash": commit.hexsha,
                "hash_short": commit.hexsha[:8],
                "date": commit.authored_datetime.isoformat(),
                "author": commit.author.name,
                "message": commit.message.strip(),
            })
        return result
    except Exception:
        return []


def get_validation_commits_for_item(project_path: str, item_id: str) -> list:
    """
    Gibt alle Commits zurück, die einen Validierungsreport für item_id
    hinzugefügt haben (diff-filter=A).
    """
    try:
        repo = get_or_init_repo(project_path)
        pattern = f"validation/{item_id}-val-*.yml"
        results = []

        for commit in repo.iter_commits():
            parents = commit.parents
            if parents:
                # Richtung parent -> commit: hinzugefügte Dateien erscheinen in b_path.
                diffs = parents[0].diff(commit)
            else:
                # Initial commit: gegen den leeren Baum diffen.
                # R=True kehrt die Richtung um, sodass die enthaltenen Dateien
                # ebenfalls als Additions (b_path) erscheinen.
                diffs = commit.diff(NULL_TREE, R=True)

            for diff in diffs:
                b_path = getattr(diff, "b_path", None) or ""
                if fnmatch.fnmatch(b_path, pattern):
                    results.append({
                        "hash": commit.hexsha,
                        "hash_short": commit.hexsha[:8],
                        "date": commit.authored_datetime.isoformat(),
                        "author": commit.author.name,
                        "message": commit.message.strip(),
                        "report_path": b_path,
                    })
        return results
    except Exception:
        return []
