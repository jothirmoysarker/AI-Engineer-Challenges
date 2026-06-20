"""
OCR Extractor — supports PDF and image files.
Uses Tesseract with Bangla (ben) + English (eng) language packs.
Runs 100% locally, no external API calls.
"""

import os
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import io
from langdetect import detect, DetectorFactory
from langdetect.lang_detect_exception import LangDetectException

# Make langdetect deterministic
DetectorFactory.seed = 0

# On Windows, set the Tesseract executable path if not on PATH
# pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

TESSERACT_LANG = "ben+eng"  # Bangla + English


def detect_language(text: str) -> str:
    """Detect language of extracted text. Returns 'bn', 'en', or 'mixed'."""
    if not text or len(text.strip()) < 20:
        return "unknown"
    try:
        bn_chars = sum(1 for c in text if "ঀ" <= c <= "৿")
        en_chars = sum(1 for c in text if c.isascii() and c.isalpha())
        total = bn_chars + en_chars
        if total == 0:
            return "unknown"
        bn_ratio = bn_chars / total
        if bn_ratio > 0.7:
            return "bn"
        elif bn_ratio < 0.3:
            return "en"
        else:
            return "mixed"
    except Exception:
        return "unknown"


def ocr_image(image: Image.Image) -> str:
    """Run Tesseract OCR on a PIL Image."""
    config = "--oem 3 --psm 6"
    text = pytesseract.image_to_string(image, lang=TESSERACT_LANG, config=config)
    return text.strip()


def extract_from_pdf(filepath: str) -> list[dict]:
    """
    Extract text from each page of a PDF.
    First tries direct text extraction (for digital PDFs),
    falls back to OCR for scanned pages.
    Returns list of {page_num, text, language}.
    """
    pages = []
    doc = fitz.open(filepath)

    for page_num, page in enumerate(doc, start=1):
        # Try direct text extraction first
        text = page.get_text("text").strip()

        if len(text) < 50:
            # Scanned page — render to image and OCR
            mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for better OCR accuracy
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")
            image = Image.open(io.BytesIO(img_data))
            text = ocr_image(image)

        language = detect_language(text)
        pages.append({
            "page_num": page_num,
            "text": text,
            "language": language,
        })

    doc.close()
    return pages


def extract_from_image(filepath: str) -> list[dict]:
    """Extract text from an image file (PNG, JPG, TIFF, etc.)."""
    image = Image.open(filepath)
    text = ocr_image(image)
    language = detect_language(text)
    return [{"page_num": 1, "text": text, "language": language}]


def extract(filepath: str) -> list[dict]:
    """
    Main entry point. Auto-detects file type and extracts text.
    Returns list of page dicts: {page_num, text, language}.
    """
    ext = os.path.splitext(filepath)[1].lower()
    if ext == ".pdf":
        return extract_from_pdf(filepath)
    elif ext in {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".webp"}:
        return extract_from_image(filepath)
    else:
        raise ValueError(f"Unsupported file type: {ext}")
