"""Tests for the BM25 RAG module.

Index is built against a temp dir of crafted fixtures so the test is hermetic
and doesn't depend on the actual data/knowledge_base content shipping with
the repo (that may evolve).
"""
from pathlib import Path

import pytest

import rag


FIXTURE_BB101 = """---
doc_id: bb101-test
title: Test BB101
publisher: DfE
year: 2018
url: https://example.gov.uk/bb101
applies_to: [air_quality_concern]
---

## Carbon dioxide thresholds

The daily average CO2 concentration during occupied periods should not
exceed 1500 ppm in naturally ventilated classrooms.

## Mould response

Visible mould must be removed within 6 weeks. Where pupils with asthma are
taught in the affected room, the timescale compresses to 5 working days.
"""

FIXTURE_BR = """---
doc_id: br-policy-test
title: Benefit Review Policy
publisher: DWP
year: 2024
url: https://example.gov.uk/br
applies_to: [benefit_review]
---

## Evidence chasing

Reminder at 28 days, escalation at 56 days for outstanding evidence.
"""


@pytest.fixture
def kb_dir(tmp_path: Path) -> Path:
    (tmp_path / "bb101.md").write_text(FIXTURE_BB101, encoding="utf-8")
    (tmp_path / "br.md").write_text(FIXTURE_BR, encoding="utf-8")
    (tmp_path / "README.md").write_text("# ignore me\n", encoding="utf-8")
    return tmp_path


@pytest.fixture(autouse=True)
def _build(kb_dir):
    rag.build_index(kb_dir)
    yield
    # leave index populated; later tests rebuild


# ---------------------------------------------------------------------------
# Frontmatter + chunking
# ---------------------------------------------------------------------------

def test_frontmatter_parses_scalar_and_list():
    meta, body = rag._parse_frontmatter(FIXTURE_BB101)
    assert meta["doc_id"] == "bb101-test"
    assert meta["title"] == "Test BB101"
    assert meta["applies_to"] == ["air_quality_concern"]
    assert "Carbon dioxide" in body


def test_no_frontmatter_returns_empty_meta():
    meta, body = rag._parse_frontmatter("just markdown\n## heading\nbody\n")
    assert meta == {}
    assert "just markdown" in body


def test_chunker_splits_on_h2_headings(kb_dir):
    rag.build_index(kb_dir)
    bb_chunks = [c for c in rag._chunks if c.doc_id == "bb101-test"]
    headings = {c.heading_path for c in bb_chunks}
    assert "Carbon dioxide thresholds" in headings
    assert "Mould response" in headings


def test_readme_is_skipped(kb_dir):
    rag.build_index(kb_dir)
    assert all("readme" not in c.doc_id.lower() for c in rag._chunks)


def test_index_count_reflects_built_chunks(kb_dir):
    n = rag.build_index(kb_dir)
    assert n == rag.chunk_count() > 0


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

def test_retrieve_returns_relevant_chunk_first():
    results = rag.retrieve("What is the CO2 threshold for classrooms?", top_k=3)
    assert results, "expected some results"
    top = results[0]
    assert "1500 ppm" in top.text or "carbon dioxide" in top.text.lower()


def test_retrieve_filters_by_case_type():
    """A benefit_review query for evidence chasing should NOT pick up
    bb101 chunks because their applies_to doesn't include benefit_review."""
    results = rag.retrieve("evidence chasing reminder", top_k=5,
                            case_type="benefit_review")
    assert results
    assert all("benefit_review" in r.applies_to for r in results)


def test_retrieve_air_quality_query_excludes_benefit_review_docs():
    results = rag.retrieve("mould asthma classroom", top_k=5,
                            case_type="air_quality_concern")
    assert results
    assert all("air_quality_concern" in r.applies_to for r in results)


def test_retrieve_empty_query_returns_nothing():
    assert rag.retrieve("", top_k=5) == []
    assert rag.retrieve("   ", top_k=5) == []


def test_retrieve_unmatchable_query_returns_empty():
    assert rag.retrieve("xylophone unicorn quasar", top_k=5) == []


def test_retrieve_respects_top_k():
    results = rag.retrieve("ppm threshold ventilation", top_k=1)
    assert len(results) <= 1


def test_chunks_carry_source_metadata():
    results = rag.retrieve("mould", top_k=1, case_type="air_quality_concern")
    assert results
    c = results[0]
    assert c.publisher == "DfE"
    assert c.year == "2018"
    assert c.url.startswith("https://")
    assert c.score > 0


def test_chunk_to_dict_round_trip():
    results = rag.retrieve("CO2", top_k=1)
    assert results
    d = rag.chunk_to_dict(results[0])
    for key in ("chunk_id", "doc_id", "title", "publisher", "url",
                "heading_path", "text", "score", "applies_to"):
        assert key in d


# ---------------------------------------------------------------------------
# Edge: empty / missing kb dir
# ---------------------------------------------------------------------------

def test_missing_directory_yields_zero_chunks(tmp_path):
    n = rag.build_index(tmp_path / "does-not-exist")
    assert n == 0
    assert rag.retrieve("anything") == []


def test_empty_directory_yields_zero_chunks(tmp_path):
    empty = tmp_path / "empty-subdir"
    empty.mkdir()
    n = rag.build_index(empty)
    assert n == 0
    assert rag.retrieve("anything") == []
