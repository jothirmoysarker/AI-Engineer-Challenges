"""
RAG Search Engine
- Embeds the user query locally (sentence-transformers)
- Retrieves top-k chunks from ChromaDB with optional metadata filters
- Passes retrieved context to local Ollama LLM to generate a grounded answer
- No external API calls at any stage
"""

from typing import Optional
import ollama

from embedder.embedder import embed_query
from database.vector_store import query_chunks

# Ollama model to use for answer generation.

OLLAMA_MODEL = "aya"


def build_prompt(query: str, chunks: list[dict]) -> str:
    """Build a RAG prompt from retrieved chunks."""
    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk["metadata"]
        source = f"[Source {i}: {meta.get('filename', 'unknown')}, page {meta.get('page_num', '?')}]"
        context_parts.append(f"{source}\n{chunk['text']}")

    context = "\n\n---\n\n".join(context_parts)

    prompt = f"""You are a helpful assistant. Answer the question below using ONLY the context provided.
If the answer is not in the context, say "I could not find this information in the provided documents."
Respond in the same language as the question.

Context:
{context}

Question: {query}

Answer:"""
    return prompt


def search(
    query: str,
    n_results: int = 5,
    filter_language: Optional[str] = None,
    filter_doc_type: Optional[str] = None,
    filter_doc_date: Optional[str] = None,
    filter_filename: Optional[str] = None,
    use_llm: bool = True,
) -> dict:
    """
    Main RAG search function.

    Args:
        query: Natural language question (Bangla, English, or mixed)
        n_results: Number of chunks to retrieve
        filter_language: "bn", "en", "mixed" — restrict to documents in this language
        filter_doc_type: e.g. "invoice", "article", "report"
        filter_doc_date: ISO date string e.g. "2024-01-15"
        filter_filename: Restrict to a specific document
        use_llm: If True, pass retrieved chunks to Ollama for final answer

    Returns:
        {
          "query": str,
          "retrieved_chunks": [...],
          "answer": str,
          "filters_applied": {...}
        }
    """
    # Embed the query locally
    query_vec = embed_query(query)

    # Retrieve relevant chunks with metadata filters
    chunks = query_chunks(
        query_embedding=query_vec,
        n_results=n_results,
        filter_language=filter_language,
        filter_doc_type=filter_doc_type,
        filter_doc_date=filter_doc_date,
        filter_filename=filter_filename,
    )

    filters_applied = {k: v for k, v in {
        "language": filter_language,
        "doc_type": filter_doc_type,
        "doc_date": filter_doc_date,
        "filename": filter_filename,
    }.items() if v is not None}

    if not chunks:
        return {
            "query": query,
            "retrieved_chunks": [],
            "answer": "No relevant documents found matching your query and filters.",
            "filters_applied": filters_applied,
        }

    # Generate answer via local Ollama LLM
    answer = ""
    if use_llm:
        prompt = build_prompt(query, chunks)
        try:
            response = ollama.chat(
                model=OLLAMA_MODEL,
                messages=[{"role": "user", "content": prompt}],
            )
            answer = response["message"]["content"].strip()
        except Exception as e:
            answer = f"LLM unavailable: {e}. Retrieved chunks shown below."

    return {
        "query": query,
        "retrieved_chunks": chunks,
        "answer": answer,
        "filters_applied": filters_applied,
    }
