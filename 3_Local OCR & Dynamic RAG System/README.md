# Multilingual RAG Pipeline (Bangla + English)

A fully local, secure document processing and Retrieval-Augmented Generation (RAG) system that handles Bangla, English, and mixed-language documents. No data is sent to any external API everything runs on your machine.



---

## What it does

- **Upload** scanned PDFs or images containing Bangla, English, or mixed text.
- **OCR** the documents locally using Tesseract (ben+eng).
- **Embed** the extracted text using a multilingual sentence-transformers model.
- **Store** chunks and metadata in a local ChromaDB vector database.
- **Search** using natural language queries with optional metadata filters (language, document type, date).
- **Answer** questions using a local Ollama LLM no OpenAI, no cloud.

---

## Requirements

Before cloning this repo, install the following on your Windows machine:

### 1. Python 3.11 or 3.12 (recommended)
Download from https://www.python.org/downloads/

**"Python 3.13+ may have compatibility issues with PyMuPDF. Stick to 3.11 or 3.12"**.

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
ollama run aya
```
This downloads ~4GB once. `aya` supports Bangla and English natively.

---

## Setup (first time only)

```bash
# 1. Install Python dependencies
# Double-click install.bat   OR run in Command Prompt:
py -m pip install torch --index-url https://download.pytorch.org/whl/cpu
py -m pip install -r requirements.txt
```

The first time you upload a document or run a search, the multilingual embedding model (~120MB) will download automatically and cache inside a `model_cache/` folder.

---

## Running the server

Make sure Ollama is running (check system tray), then:

```bash

#Open your browser at:

http://localhost:8000/docs
```

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

## 1. Why we picked Tesseract for reading Bengali text
For pulling text out of scanned documents, we went with Tesseract, paired with its Bengali language pack. We also looked at newer options like Surya OCR and EasyOCR, but Tesseract won out for a practical reason. It runs on a regular CPU, no expensive graphics card needed, and it already has solid training on printed Bengali text. The system is smart about when it actually needs to "read" an image versus when it can just grab the text directly: if a PDF already has selectable text built in, we pull that out instantly with no recognition needed. Only when a page is basically just a picture (under 50 characters of readable text) does it kick into OCR mode and when it does, we zoom the image in 2x first, because sharper images mean fewer reading mistakes.
Now, here's the honest part: Bengali is a genuinely tricky script to read automatically. Letters combine, stack, and reshape depending on what's next to them, which trips up most OCR tools. On clean printed pages, Tesseract gets it right around 85-92% of the time pretty solid, but it struggles more with blurry low-quality scans, handwriting (it was never trained for that), and certain complex letter combinations. Down the road, if accuracy becomes critical, switching to a newer AI-based tool like Surya would be the natural upgrade.

## 2. Why we break documents into small chunks before storing them
You can't just dump an entire 20-page document into the search system as one giant block, the meaning gets too diluted, and searches end up returning whole documents instead of the one paragraph that actually answers the question. So we split documents into smaller pieces.
But we didn't split randomly by character count. We split at natural sentence endings, recognizing both the Bangla full stop (।) and the English ones (.!?). This matters because cutting text mid-sentence, especially in Bengali, can chop a word's letter-cluster in half and turn it into nonsense. Each chunk is about 500 characters, and we overlap them by 100 characters on purpose, so if an answer happens to sit right on the border between two chunks, neither one loses the full context.
For turning text into searchable data, we used a multilingual embedding model rather than an English-only one. The reason is simple: it lets a Bengali question and an English answer "recognize" each other as related, because both languages live in the same shared space. We picked a smaller, faster version of this model instead of a bigger, slightly more accurate one, because it runs fast on a regular computer without needing extra hardware — a fair trade-off for a system meant to run locally.

## 3. How we make sure the system finds the right document, not just similar-sounding text
Searching by meaning alone has one weak spot, it doesn't know which document something came from. Ask "what was the revenue in January 2025?" and a pure meaning-based search might confidently hand you a number from a totally different year, just because the wording felt similar. So we layered in filtering by document details filename, type, date, language on top of the meaning-based search.
Here's how it works: when you search, the system first narrows things down using these filters (only Bengali reports, only March 2025, etc.), and only after narrowing the pool does it search for the closest meaning match within that smaller group. This two-step order matters a lot — filtering first is faster, and more importantly, it stops the system from accidentally pulling in a similar-sounding answer from the wrong document and feeding it to the AI as if it were correct.
The end result is a search that can work three ways: pure free-text search, pure filter-based search (give me everything from these reports), or both combined for pinpoint accuracy, like finding one exact paragraph about agricultural investment, only from Bengali reports written in March 2025. That combination is really what makes the whole system trustworthy for real documents.


