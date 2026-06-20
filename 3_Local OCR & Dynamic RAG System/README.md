# Multilingual RAG Pipeline (Bangla + English)

A fully local, secure document processing and Retrieval-Augmented Generation (RAG) system that handles Bangla, English, and mixed-language documents. No data is sent to any external API — everything runs on your machine.

---

## What it does

- **Upload** scanned PDFs or images containing Bangla, English, or mixed text
- **OCR** the documents locally using Tesseract (ben+eng)
- **Embed** the extracted text using a multilingual sentence-transformers model
- **Store** chunks and metadata in a local ChromaDB vector database
- **Search** using natural language queries with optional metadata filters (language, document type, date)
- **Answer** questions using a local Ollama LLM — no OpenAI, no cloud

---

## Requirements

Before cloning this repo, install the following on your Windows machine:

### 1. Python 3.11 or 3.12 (recommended)
Download from https://www.python.org/downloads/

> ⚠️ Python 3.13+ may have compatibility issues with PyMuPDF. Stick to 3.11 or 3.12.

During installation, check **"Add Python to PATH"**.

### 2. Tesseract OCR with Bangla language pack
Download the installer from:
https://github.com/UB-Mannheim/tesseract/wiki

During installation:
- Under **Additional language data**, check **Bengali**
- Install to the default path: `C:\Program Files\Tesseract-OCR\`

After installing, add Tesseract to your system PATH:
- Search "Environment Variables" in Start menu
- Under System Variables → Path → New → add `C:\Program Files\Tesseract-OCR`

### 3. Ollama
Download from https://ollama.com/download and install.

After installing, open Command Prompt and pull the multilingual model:
```
ollama pull aya
```
This downloads ~4GB once. `aya` supports Bangla and English natively.

---

## Setup (first time only)

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME

# 2. Install Python dependencies
# Double-click install.bat   OR run in Command Prompt:
py -m pip install torch --index-url https://download.pytorch.org/whl/cpu
py -m pip install -r requirements.txt
```

The first time you upload a document or run a search, the multilingual embedding model (~120MB) will download automatically and cache inside a `model_cache/` folder.

---

## Running the server

Make sure Ollama is running (check system tray), then:

```bash
# Double-click start.bat   OR run in Command Prompt:
py -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

Open your browser at:
```
http://localhost:8000/docs
```

---

## Using the API

### Upload a document
`POST /upload`
| Field | Description |
|---|---|
| `file` | PDF or image (PNG, JPG, TIFF) |
| `doc_type` | `report`, `invoice`, `article`, or `other` |
| `doc_date` | Date of the document in `YYYY-MM-DD` format |

### Search
`POST /search`
```json
{
  "query": "What was the total revenue?",
  "n_results": 5,
  "use_llm": true,
  "filter_language": "en",
  "filter_doc_type": "report",
  "filter_doc_date": null,
  "filter_filename": null
}
```

Set any filter to `null` to skip it. Filters are applied strictly (AND logic) before semantic ranking.

Supported `filter_language` values: `"en"`, `"bn"`, `"mixed"`

### List all documents
`GET /documents`

### Delete a document
`DELETE /documents/{filename}`

---

## Project structure

```
rag system/
├── api/
│   └── main.py           # FastAPI endpoints (upload, search, list, delete)
├── ocr/
│   └── extractor.py      # Tesseract OCR for PDF and images (ben+eng)
├── embedder/
│   ├── chunker.py        # Text splitting with sentence-aware overlap
│   └── embedder.py       # Multilingual sentence-transformers embeddings
├── database/
│   └── vector_store.py   # ChromaDB storage and metadata-filtered queries
├── rag/
│   └── search.py         # RAG pipeline: embed → retrieve → Ollama answer
├── requirements.txt
├── install.bat            # One-click dependency installer
├── start.bat              # One-click server launcher
└── generate_demo_docs.py  # Generate sample PDFs for testing
```

---

## Generating demo documents

To create sample Bangla, English, and mixed-language PDFs for testing:

```bash
py -m pip install fpdf2
py generate_demo_docs.py
```

PDFs are saved to `demo_docs/`. Upload them via `/docs` to test the full pipeline.

---

## Technology stack

| Component | Tool | Why |
|---|---|---|
| OCR | Tesseract 5 (ben+eng) | Free, local, strong Bangla support |
| PDF processing | PyMuPDF | Fast, handles scanned + digital PDFs |
| Embeddings | paraphrase-multilingual-MiniLM-L12-v2 | 50+ languages, runs on CPU |
| Vector store | ChromaDB | Local, persistent, metadata filtering |
| LLM | Ollama + aya | Fully local, multilingual |
| API | FastAPI | Fast, auto-generates interactive docs |

---

## Troubleshooting

**`tesseract is not installed or not in PATH`**
Add `C:\Program Files\Tesseract-OCR` to your system PATH and restart Command Prompt.

**`No module named uvicorn` or similar**
Run `py -m pip install -r requirements.txt` again and make sure you're using Python 3.11/3.12.

**`[WinError 5] Access is denied`**
The model cache is already redirected to the project folder. If it persists, run Command Prompt as Administrator.

**LLM answer says "LLM unavailable"**

1. OCR Model Choice — Tesseract with Bengali Language Pack
Why Tesseract over alternatives
The system uses Tesseract 5 with ben+eng language mode. The main alternatives were Surya OCR (a newer neural model) and EasyOCR. Tesseract was chosen because it runs entirely on CPU with no GPU requirement, has a mature Bengali tessdata trained specifically on printed Bengali script, and integrates with a single Python call via pytesseract. Surya has better accuracy on complex layouts but requires more RAM and has a heavier install footprint — a worthwhile upgrade if accuracy becomes a priority later.
How it handles the two document types
The extractor in ocr/extractor.py runs a two-pass strategy. For digital PDFs (text embedded in the file), PyMuPDF extracts text directly — this is fast and perfectly accurate since no recognition is involved. The OCR path only activates for scanned pages where page.get_text() returns fewer than 50 characters, indicating an image-only page. When OCR is needed, the page is rendered at 2× zoom (fitz.Matrix(2.0, 2.0)) before passing to Tesseract, because higher resolution consistently improves character recognition accuracy.
Bangla script — where Tesseract struggles
Bengali is a complex abugida script — consonants carry inherent vowels, and vowel signs, conjunct consonants (যুক্তাক্ষর), and diacritics attach above, below, and around the base character. Tesseract's baseline performance on clean printed Bengali is roughly 85–92% character accuracy. However accuracy drops notably in three situations: low-resolution scans (below 150 DPI), handwritten text (Tesseract is purely trained on print), and dense conjunct clusters like ক্ষ, স্ত্র, ট্ট where the ligature shape differs significantly from individual characters. The 2× zoom pre-processing partially mitigates the DPI issue. For documents that are known to be poor quality, a future upgrade path is replacing Tesseract with Surya or a vision-language model like GOT-OCR, which handles degraded scans and conjuncts considerably better.

2. Chunking Strategy and Embedding Model
Why chunking is necessary
Vector databases store fixed-size numerical vectors. You cannot embed an entire 20-page document into one vector — semantic meaning becomes diluted and retrieval returns entire documents rather than the precise passage that answers the question. Chunking breaks extracted text into overlapping segments so each vector represents a coherent, focused piece of content.
The chunking approach in embedder/chunker.py
The chunker splits on sentence-ending punctuation — both । (the Bangla danda, the equivalent of a full stop) and .!? for English. This is deliberate: splitting on sentence boundaries preserves grammatical and semantic units rather than cutting arbitrarily mid-thought. A pure character-count split would frequently break a Bengali sentence at a conjunct cluster, producing a fragment that has no standalone meaning and embeds poorly.
Chunk size is set to 500 characters with 100-character overlap. The overlap is critical for retrieval quality — if an answer spans the boundary between two chunks, the overlap ensures at least one chunk captures the full context. Without overlap, you get hard cuts where a question about "the company's net profit" might have the figure in one chunk and the label "net profit" in the previous one, causing both to retrieve poorly.
Embedding model selection
The model paraphrase-multilingual-MiniLM-L12-v2 was chosen over English-only alternatives for one specific reason: it was trained on parallel sentence data in 50+ languages including Bengali, so the vector space is shared across languages. This means a Bengali query and an English passage that mean the same thing will produce vectors that are close in the same space. Without a multilingual model, a Bengali question would produce a vector that has no meaningful proximity to English chunks, making cross-lingual retrieval impossible.
The trade-off compared to a larger model like multilingual-e5-large is accuracy versus speed. MiniLM produces 384-dimensional vectors and runs entirely on CPU in under a second per chunk. The larger models produce better semantic representations, especially for domain-specific or formal written Bengali, but require significantly more RAM and are slower. For a local CPU-only system this is the right balance. The embedding runs once at upload time and is stored in ChromaDB — search itself is fast regardless of model size because it's just vector arithmetic at query time.

3. System Architecture — Metadata Filtering with Vector Similarity
The core problem metadata filtering solves
Pure vector similarity search ranks chunks by semantic closeness to the query — but it has no concept of document provenance. If you ask "what was the revenue in January 2025?" without filtering, the system may retrieve a highly semantically similar revenue figure from a 2023 invoice. Metadata filtering constrains the search space before any similarity calculation happens, so the LLM only sees chunks from documents that structurally match what you asked for.
How the two mechanisms work together
At upload time, each chunk is stored in ChromaDB with both its embedding vector and a metadata dictionary containing filename, doc_type, doc_date, and language. These are separate data structures inside ChromaDB — the vector lives in the HNSW (Hierarchical Navigable Small World) index for fast approximate nearest-neighbour search, while the metadata lives in a document store alongside it.
At query time, the flow inside database/vector_store.py is:

The user's natural language query is embedded into a 384-dim vector by the same MiniLM model
If metadata filters are provided, ChromaDB builds a where clause — for example {"$and": [{"language": {"$eq": "bn"}}, {"doc_type": {"$eq": "report"}}]}
ChromaDB applies the metadata filter first, reducing the candidate set to only chunks that match all conditions exactly
Within that filtered candidate set, it runs cosine similarity against the query vector and returns the top-k closest chunks
Those chunks — already guaranteed to be from the right document type, language, and date — are passed to Ollama to generate the final answer

Why this order matters
Filtering before ranking is architecturally important for two reasons. First, it's efficient — HNSW doesn't have to score every vector in the database, only those passing the filter. Second, it prevents relevance dilution: without pre-filtering, a very semantically similar chunk from the wrong document type could outscore the correct chunk from the right one, and the LLM would then fabricate or confuse its answer using that wrong context.
The hybrid nature of the search
The system is genuinely hybrid rather than just semantic or just keyword. A user can run a fully open search with no filters (pure semantic), apply only metadata filters with a vague query (structural retrieval), or combine both for the tightest possible retrieval — for example finding the exact paragraph about "কৃষি খাতে বিনিয়োগ" specifically from Bangla-language reports dated in March 2025. Neither approach alone achieves this precision. The combination is what makes the system practical for a real multilingual document archive.
Make sure Ollama is running (check system tray) and you've pulled the model: `ollama pull aya`

**Empty search results**
Upload documents first via `POST /upload` before searching. Also check that filter values are not left as `"string"` — set unused filters to `null`.
