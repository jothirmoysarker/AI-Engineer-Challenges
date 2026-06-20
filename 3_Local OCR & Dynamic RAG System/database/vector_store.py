"""
ChromaDB vector store — persists embeddings and metadata locally.
Supports metadata filtering by: filename, doc_type, language, doc_date.
"""

import os
import chromadb
from chromadb.config import Settings
from typing import List, Optional

# Persistent local storage path
CHROMA_PATH = os.path.join(os.path.dirname(__file__), "..", "chroma_db")
COLLECTION_NAME = "rag_documents"

_client = None
_collection = None


def get_collection():
    """Get or create the ChromaDB collection (singleton)."""
    global _client, _collection
    if _collection is None:
        _client = chromadb.PersistentClient(path=os.path.abspath(CHROMA_PATH))
        _collection = _client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def add_document_chunks(
    chunks: List[dict],
    embeddings: List[List[float]],
    metadata_base: dict,
) -> int:
    """
    Store chunks with their embeddings and metadata in ChromaDB.

    metadata_base should contain:
      - filename: str
      - doc_type: str  (e.g. "invoice", "article", "report", "other")
      - doc_date: str  (ISO format: "2024-01-15")
      - language: str  (will be overridden per-chunk if available)

    Returns number of chunks stored.
    """
    collection = get_collection()

    ids = []
    docs = []
    metas = []
    embeds = []

    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        # Unique ID per chunk
        chunk_id = f"{metadata_base['filename']}__chunk_{chunk['chunk_index']}"

        meta = {
            **metadata_base,
            "page_num": chunk["page_num"],
            "chunk_index": chunk["chunk_index"],
            "language": chunk.get("language", metadata_base.get("language", "unknown")),
        }

        ids.append(chunk_id)
        docs.append(chunk["text"])
        metas.append(meta)
        embeds.append(embedding)

    collection.upsert(
        ids=ids,
        documents=docs,
        metadatas=metas,
        embeddings=embeds,
    )
    return len(ids)


def query_chunks(
    query_embedding: List[float],
    n_results: int = 5,
    filter_language: Optional[str] = None,
    filter_doc_type: Optional[str] = None,
    filter_doc_date: Optional[str] = None,
    filter_filename: Optional[str] = None,
) -> List[dict]:
    """
    Semantic search with optional metadata filters.
    All filters are ANDed together (strict matching).

    Returns list of result dicts: {text, score, metadata}
    """
    collection = get_collection()

    # Build ChromaDB where clause for metadata filtering
    where = {}
    conditions = []

    if filter_language:
        conditions.append({"language": {"$eq": filter_language}})
    if filter_doc_type:
        conditions.append({"doc_type": {"$eq": filter_doc_type}})
    if filter_doc_date:
        conditions.append({"doc_date": {"$eq": filter_doc_date}})
    if filter_filename:
        conditions.append({"filename": {"$eq": filter_filename}})

    if len(conditions) == 1:
        where = conditions[0]
    elif len(conditions) > 1:
        where = {"$and": conditions}

    query_kwargs = {
        "query_embeddings": [query_embedding],
        "n_results": n_results,
        "include": ["documents", "metadatas", "distances"],
    }
    if where:
        query_kwargs["where"] = where

    results = collection.query(**query_kwargs)

    output = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        output.append({
            "text": doc,
            "score": round(1 - dist, 4),  # cosine similarity (higher = better)
            "metadata": meta,
        })

    return output


def list_documents() -> List[dict]:
    """Return summary of all unique documents stored."""
    collection = get_collection()
    all_items = collection.get(include=["metadatas"])
    seen = {}
    for meta in all_items["metadatas"]:
        fname = meta.get("filename", "unknown")
        if fname not in seen:
            seen[fname] = {
                "filename": fname,
                "doc_type": meta.get("doc_type"),
                "doc_date": meta.get("doc_date"),
                "language": meta.get("language"),
            }
    return list(seen.values())


def delete_document(filename: str) -> int:
    """Delete all chunks belonging to a document."""
    collection = get_collection()
    results = collection.get(where={"filename": {"$eq": filename}})
    ids = results["ids"]
    if ids:
        collection.delete(ids=ids)
    return len(ids)
