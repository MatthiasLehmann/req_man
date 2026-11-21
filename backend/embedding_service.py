"""Texte -> Vektoren für die Bedeutungssuche (RAG).

Embeddings laufen immer über einen OpenAI-kompatiblen Endpunkt (Standard: lokales
Ollama mit bge-m3), weil Anthropic keine Embeddings anbietet.
"""
import os
from typing import Callable, List, Optional

import numpy as np

EMBED_MODEL_DEFAULT = "bge-m3"
EMBED_BASE_URL_DEFAULT = "http://localhost:11434/v1"
BATCH = 32
MAX_CHARS = 2000

_MSG = ("Embedding-Modell nicht erreichbar. Läuft Ollama, und ist das Modell geladen? "
        "→ ollama pull bge-m3")


class EmbeddingError(RuntimeError):
    pass


_embedder: Optional[Callable[[List[str]], np.ndarray]] = None


def get_model() -> str:
    return os.environ.get("EMBED_MODEL") or EMBED_MODEL_DEFAULT


def get_base_url() -> str:
    url = os.environ.get("EMBED_BASE_URL")
    if url:
        return url
    if os.environ.get("AI_PROVIDER", "").lower() == "ollama" and os.environ.get("AI_BASE_URL"):
        return os.environ["AI_BASE_URL"]
    return EMBED_BASE_URL_DEFAULT


def set_embedder(fn: Optional[Callable[[List[str]], np.ndarray]]) -> None:
    """Ersetzt die Funktion hinter embed() (Tests); None stellt zurück."""
    global _embedder
    _embedder = fn


def _normalize(m: np.ndarray) -> np.ndarray:
    m = np.asarray(m, dtype=np.float32)
    if m.size == 0:
        return m.reshape(0, 0)
    norms = np.maximum(np.linalg.norm(m, axis=1, keepdims=True), 1e-12)
    return (m / norms).astype(np.float32)


def _embed_remote(texts: List[str]) -> np.ndarray:
    import openai
    client = openai.OpenAI(base_url=get_base_url(),
                           api_key=os.environ.get("EMBED_API_KEY") or "ollama", timeout=60)
    rows: List[List[float]] = []
    try:
        for i in range(0, len(texts), BATCH):
            r = client.embeddings.create(model=get_model(), input=texts[i:i + BATCH])
            rows.extend(e.embedding for e in r.data)
    except (openai.APIConnectionError, openai.APITimeoutError, openai.NotFoundError) as e:
        raise EmbeddingError(_MSG) from e
    return np.array(rows, dtype=np.float32)


def embed(texts: List[str]) -> np.ndarray:
    """Form (n, d), float32, jede Zeile auf Länge 1 normiert."""
    if not texts:
        return np.zeros((0, 0), dtype=np.float32)
    texts = [t[:MAX_CHARS] for t in texts]
    fn = _embedder or _embed_remote
    return _normalize(fn(texts))
