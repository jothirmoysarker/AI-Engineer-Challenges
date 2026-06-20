"""
Text chunker — splits extracted page text into overlapping chunks
suitable for embedding and retrieval.
"""

from typing import List


def chunk_text(
    text: str,
    chunk_size: int = 500,
    overlap: int = 100,
) -> List[str]:
    """
    Split text into chunks of ~chunk_size characters with overlap.
    Tries to split on sentence boundaries (।  for Bangla, . for English).
    """
    if not text or not text.strip():
        return []

    # Split on sentence-ending punctuation
    import re
    sentences = re.split(r"(?<=[।.!?])\s+", text.strip())

    chunks = []
    current = ""

    for sentence in sentences:
        if len(current) + len(sentence) <= chunk_size:
            current += (" " if current else "") + sentence
        else:
            if current:
                chunks.append(current.strip())
            # Start new chunk with overlap from the end of current
            if len(current) > overlap:
                overlap_text = current[-overlap:]
                current = overlap_text + " " + sentence
            else:
                current = sentence

    if current.strip():
        chunks.append(current.strip())

    # Filter out very short chunks (likely noise)
    chunks = [c for c in chunks if len(c) > 30]
    return chunks


def chunk_pages(pages: List[dict]) -> List[dict]:
    """
    Take list of page dicts from extractor and produce list of chunk dicts.
    Each chunk dict: {chunk_index, page_num, text, language}
    """
    all_chunks = []
    chunk_index = 0

    for page in pages:
        raw_chunks = chunk_text(page["text"])
        for chunk_text_val in raw_chunks:
            all_chunks.append({
                "chunk_index": chunk_index,
                "page_num": page["page_num"],
                "text": chunk_text_val,
                "language": page["language"],
            })
            chunk_index += 1

    return all_chunks
