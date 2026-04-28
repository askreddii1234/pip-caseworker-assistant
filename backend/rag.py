"""Lightweight BM25 retrieval over a markdown knowledge base.

No embeddings, no vector store, no extra infra. Reads markdown files with
YAML frontmatter from `data/knowledge_base/`, splits each file into
heading-aware chunks, and ranks chunks against a query with BM25.

Used by `routes/ai.py` to attach grounded extracts to AI brief / Q&A
prompts. Works in mock mode too — retrieval is fully offline.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Optional

from rank_bm25 import BM25Okapi


KB_DIR = Path(os.getenv("KB_DIR", "/app/data/knowledge_base"))
MAX_CHUNK_TOKENS = 280  # words; ~roughly tokens for sizing
OVERLAP_TOKENS = 40

# Tiny stopword list — keep retrieval signal; full English stopwords would
# strip too many domain words.
_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on",
    "for", "with", "is", "are", "was", "were", "be", "been", "being",
    "this", "that", "these", "those", "it", "its", "as", "at", "by",
    "from", "we", "you", "i", "they", "he", "she", "do", "does", "did",
    "have", "has", "had", "what", "which", "who", "how", "why", "when",
    "where", "should", "would", "could", "can", "may", "might",
}

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9\-]*")


def _tokenise(text: str) -> List[str]:
    """Lowercase, strip punctuation, drop trivial stopwords."""
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS]


# ---------------------------------------------------------------------------
# Frontmatter parsing — small, no extra deps. Handles `key: value` and
# `key: [a, b, c]` forms only, which is all our docs use.
# ---------------------------------------------------------------------------

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?\n)---\s*\n(.*)\Z", re.DOTALL)


def _parse_frontmatter(raw: str) -> tuple[dict, str]:
    m = _FRONTMATTER_RE.match(raw)
    if not m:
        return {}, raw
    header, body = m.group(1), m.group(2)
    meta: dict = {}
    for line in header.splitlines():
        if not line.strip() or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            meta[key] = [v.strip() for v in inner.split(",") if v.strip()] if inner else []
        else:
            meta[key] = value
    return meta, body


# ---------------------------------------------------------------------------
# Chunker — split each doc by ## / ### headings, then size-cap each section.
# ---------------------------------------------------------------------------

@dataclass
class KbChunk:
    chunk_id: str
    doc_id: str
    title: str
    publisher: str
    year: str
    url: str
    applies_to: List[str]
    heading_path: str
    text: str
    score: float = 0.0


def _split_by_heading(body: str) -> List[tuple[str, str]]:
    """Split markdown body into (heading, section_text) pairs.

    Treats ## and ### as section breaks. Content before the first heading
    is collected under heading "Introduction".
    """
    sections: List[tuple[str, str]] = []
    current_heading = "Introduction"
    current_lines: List[str] = []

    for line in body.splitlines():
        h = re.match(r"^(#{2,3})\s+(.*\S)\s*$", line)
        if h:
            if current_lines:
                sections.append((current_heading, "\n".join(current_lines).strip()))
            current_heading = h.group(2).strip()
            current_lines = []
        else:
            current_lines.append(line)
    if current_lines:
        sections.append((current_heading, "\n".join(current_lines).strip()))

    return [(h, t) for h, t in sections if t]


def _size_cap(text: str, max_tokens: int = MAX_CHUNK_TOKENS,
              overlap: int = OVERLAP_TOKENS) -> List[str]:
    """Split a section into overlapping windows if it exceeds max_tokens."""
    words = text.split()
    if len(words) <= max_tokens:
        return [text]
    pieces: List[str] = []
    step = max_tokens - overlap
    for i in range(0, len(words), step):
        window = words[i:i + max_tokens]
        if not window:
            break
        pieces.append(" ".join(window))
        if i + max_tokens >= len(words):
            break
    return pieces


def _chunk_doc(meta: dict, body: str) -> List[KbChunk]:
    doc_id = meta.get("doc_id") or "unknown"
    chunks: List[KbChunk] = []
    for heading, section in _split_by_heading(body):
        for idx, piece in enumerate(_size_cap(section)):
            chunks.append(KbChunk(
                chunk_id=f"{doc_id}#{len(chunks)+1}",
                doc_id=doc_id,
                title=meta.get("title", doc_id),
                publisher=meta.get("publisher", ""),
                year=str(meta.get("year", "")),
                url=meta.get("url", ""),
                applies_to=meta.get("applies_to", []) or [],
                heading_path=heading,
                text=piece.strip(),
            ))
    return chunks


# ---------------------------------------------------------------------------
# Module-level singleton index. Built once at app startup.
# ---------------------------------------------------------------------------

_chunks: List[KbChunk] = []
_bm25: Optional[BM25Okapi] = None


def build_index(kb_dir: Optional[Path] = None) -> int:
    """Load all .md files under kb_dir, chunk, and build the BM25 index.

    Returns the chunk count. Idempotent — calling again rebuilds.
    """
    global _chunks, _bm25
    directory = Path(kb_dir or KB_DIR)
    _chunks = []
    if not directory.exists():
        _bm25 = None
        return 0

    for path in sorted(directory.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        raw = path.read_text(encoding="utf-8")
        meta, body = _parse_frontmatter(raw)
        if not meta.get("doc_id"):
            continue
        _chunks.extend(_chunk_doc(meta, body))

    if not _chunks:
        _bm25 = None
        return 0

    tokenised_corpus = [_tokenise(c.text) for c in _chunks]
    _bm25 = BM25Okapi(tokenised_corpus)
    return len(_chunks)


def chunk_count() -> int:
    return len(_chunks)


def retrieve(query: str, top_k: int = 5,
             case_type: Optional[str] = None) -> List[KbChunk]:
    """Return the top-k chunks for a query, optionally filtered by case_type."""
    if not _bm25 or not _chunks or not query.strip():
        return []

    tokens = _tokenise(query)
    if not tokens:
        return []

    scores = _bm25.get_scores(tokens)

    candidates: List[tuple[float, KbChunk]] = []
    for score, chunk in zip(scores, _chunks):
        if case_type and chunk.applies_to and case_type not in chunk.applies_to:
            continue
        if score <= 0:
            continue
        candidates.append((float(score), chunk))

    candidates.sort(key=lambda x: x[0], reverse=True)
    out: List[KbChunk] = []
    for score, chunk in candidates[:top_k]:
        copy = KbChunk(**{**asdict(chunk), "score": round(score, 3)})
        out.append(copy)
    return out


def chunk_to_dict(chunk: KbChunk) -> dict:
    """Frontend-friendly serialisation."""
    return asdict(chunk)
