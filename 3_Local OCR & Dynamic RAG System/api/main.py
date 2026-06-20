"""
FastAPI backend — document processing pipeline with RAG search API.

Endpoints:
  POST /upload        — upload PDF/image, run OCR, embed, store
  POST /search        — semantic search with optional metadata filters
  GET  /documents     — list all ingested documents
  DELETE /documents/{filename} — remove a document
"""

import os
import shutil
from datetime import date
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Adding parent dir to path so modules resolve correctly
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ocr.extractor import extract
from embedder.chunker import chunk_pages
from embedder.embedder import embed_texts
from database.vector_store import add_document_chunks, list_documents, delete_document
from rag.search import search

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="Multilingual RAG Pipeline",
    description="Local document ingestion with Bangla/English RAG search. No external APIs.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Upload and Ingest

@app.post("/upload", summary="Upload and ingest a document")
async def upload_document(
    file: UploadFile = File(..., description="PDF or image file"),
    doc_type: str = Form(default="other", description="Document type: invoice, article, report, other"),
    doc_date: str = Form(default=str(date.today()), description="Document date (YYYY-MM-DD)"),
):
    """
    Upload a PDF or image. Pipeline:
    1. Save file locally
    2. OCR with Tesseract (ben+eng)
    3. Chunk extracted text
    4. Embed with multilingual MiniLM
    5. Store in ChromaDB with metadata
    """
    allowed_extensions = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {allowed_extensions}")

    # Save upload
    save_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # OCR
    try:
        pages = extract(save_path)
    except Exception as e:
        raise HTTPException(500, f"OCR failed: {e}")

    if not pages or all(not p["text"] for p in pages):
        raise HTTPException(422, "No text could be extracted from this document.")

    # Detect dominant language
    lang_counts = {}
    for p in pages:
        lang_counts[p["language"]] = lang_counts.get(p["language"], 0) + 1
    dominant_language = max(lang_counts, key=lang_counts.get)

    # Chunk
    chunks = chunk_pages(pages)
    if not chunks:
        raise HTTPException(422, "Document produced no text chunks after processing.")

    # Embed
    texts = [c["text"] for c in chunks]
    embeddings = embed_texts(texts)

    # Store
    metadata_base = {
        "filename": file.filename,
        "doc_type": doc_type,
        "doc_date": doc_date,
        "language": dominant_language,
    }
    n_stored = add_document_chunks(chunks, embeddings, metadata_base)

    return {
        "status": "success",
        "filename": file.filename,
        "pages_processed": len(pages),
        "chunks_stored": n_stored,
        "dominant_language": dominant_language,
        "doc_type": doc_type,
        "doc_date": doc_date,
    }


# Search

class SearchRequest(BaseModel):
    query: str
    n_results: int = 5
    use_llm: bool = True
    # Manual metadata filters
    filter_language: Optional[str] = None   # "bn", "en", "mixed"
    filter_doc_type: Optional[str] = None   # "invoice", "article", "report", "other"
    filter_doc_date: Optional[str] = None   # "2024-01-15"
    filter_filename: Optional[str] = None   # exact filename


@app.post("/search", summary="RAG search with optional metadata filters")
async def rag_search(req: SearchRequest):
    """
    Semantic search with LLM-generated answer.
    Filters are applied strictly (AND logic) before semantic ranking.

    Example:
        {"query": "কোম্পানির মোট আয় কত?", "filter_language": "bn", "filter_doc_type": "other"}
    """
    if not req.query.strip():
        raise HTTPException(400, "Query cannot be empty.")

    try:
        result = search(
            query=req.query,
            n_results=req.n_results,
            filter_language=req.filter_language,
            filter_doc_type=req.filter_doc_type,
            filter_doc_date=req.filter_doc_date,
            filter_filename=req.filter_filename,
            use_llm=req.use_llm,
        )
    except Exception as e:
        raise HTTPException(500, f"Search failed: {e}")

    return result


# Document Management

@app.get("/documents", summary="List all ingested documents")
async def get_documents():
    """Returns summary of all documents stored in the vector DB."""
    docs = list_documents()
    return {"count": len(docs), "documents": docs}


@app.delete("/documents/{filename}", summary="Delete a document")
async def remove_document(filename: str):
    """Remove all chunks of a document from the vector store."""
    n_deleted = delete_document(filename)
    if n_deleted == 0:
        raise HTTPException(404, f"Document '{filename}' not found.")
    return {"status": "deleted", "filename": filename, "chunks_removed": n_deleted}


@app.get("/health")
async def health():
    return {"status": "ok", "message": "RAG pipeline running locally"}
