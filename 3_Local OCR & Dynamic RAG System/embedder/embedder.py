"""
Embedder — wraps sentence-transformers multilingual model.
Model: paraphrase-multilingual-MiniLM-L12-v2
Supports Bangla, English, and mixed text out of the box.
Downloads model on first run (~120MB), cached locally after that.
No external API calls at inference time.
"""

import os
from typing import List

# Redirect model cache to a folder inside the project (avoids Windows permission errors)
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_CACHE_DIR = os.path.join(_BASE_DIR, "model_cache")
os.makedirs(_CACHE_DIR, exist_ok=True)
os.environ["SENTENCE_TRANSFORMERS_HOME"] = _CACHE_DIR
os.environ["HF_HOME"] = _CACHE_DIR
os.environ["TRANSFORMERS_CACHE"] = _CACHE_DIR

from sentence_transformers import SentenceTransformer

# Multilingual model supports 50+ languages including Bangla and English
MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

_model = None


def get_model() -> SentenceTransformer:
    """Lazy-load model (singleton)."""
    global _model
    if _model is None:
        print(f"Loading embedding model: {MODEL_NAME}")
        _model = SentenceTransformer(MODEL_NAME)
        print("Model loaded.")
    return _model


def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Embed a list of text strings.
    Returns list of float vectors (384-dim).
    """
    model = get_model()
    embeddings = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    return embeddings.tolist()


def embed_query(query: str) -> List[float]:
    """Embed a single query string for search."""
    return embed_texts([query])[0]
