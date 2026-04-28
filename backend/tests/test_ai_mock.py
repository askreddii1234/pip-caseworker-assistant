"""Tests for the AI mock path.

ANTHROPIC_API_KEY is forced empty in conftest, so these exercise the
deterministic mock branch — no network, no model calls.
"""
from types import SimpleNamespace
from datetime import datetime

import pytest

from ai_pipeline import summarise_case, ask_about_case_stream


def _case_fixture():
    case = SimpleNamespace(
        case_id="CASE-TEST", case_type="benefit_review", status="awaiting_evidence",
        applicant_name="Mock Tester", applicant_reference="REF-T",
        assigned_to="team_a", created_date="2026-01-01", last_updated="2026-03-01",
        case_notes="Applicant relocated. Awaiting income statement.",
    )
    timeline = [
        SimpleNamespace(date="2026-01-01", event="case_created", note="Opened."),
        SimpleNamespace(date="2026-01-10", event="evidence_requested",
                        note="Income statement requested."),
    ]
    current = SimpleNamespace(
        state="awaiting_evidence", label="Awaiting evidence",
        description="Waiting on evidence.",
        allowed_transitions=["under_review"],
        required_actions=["Send reminder at 28 days"],
        reminder_days=28, escalation_days=56,
    )
    risk = {"level": "escalation_due", "reason": "120 days outstanding."}
    return case, timeline, current, risk


def test_summarise_returns_mocked_flag():
    case, tl, cur, risk = _case_fixture()
    out = summarise_case(case, tl, [], cur, [], risk)
    assert out["mocked"] is True


def test_mock_summary_mentions_applicant_name():
    case, tl, cur, risk = _case_fixture()
    out = summarise_case(case, tl, [], cur, [], risk)
    assert "Mock Tester" in out["summary"]


def test_mock_summary_surfaces_risk_reason():
    case, tl, cur, risk = _case_fixture()
    out = summarise_case(case, tl, [], cur, [], risk)
    # The risk reason should appear somewhere in the brief
    combined = out["summary"] + " ".join(out["key_points"])
    assert "120 days" in combined


def test_mock_next_action_comes_from_workflow():
    case, tl, cur, risk = _case_fixture()
    out = summarise_case(case, tl, [], cur, [], risk)
    assert out["next_action"] == "Send reminder at 28 days"


def test_mock_summary_with_no_workflow_state_still_works():
    case, tl, _, risk = _case_fixture()
    out = summarise_case(case, tl, [], None, [], risk)
    assert out["mocked"] is True
    assert out["next_action"]  # some default text


def test_mock_summary_handles_empty_timeline_and_notes():
    case = SimpleNamespace(
        case_id="CASE-X", case_type="benefit_review", status="case_created",
        applicant_name="Empty Case", applicant_reference="REF-X",
        assigned_to=None, created_date="2026-04-01", last_updated="2026-04-01",
        case_notes=None,
    )
    out = summarise_case(case, [], [], None, [], {"level": "ok", "reason": "New case."})
    assert out["mocked"] is True
    assert out["key_points"]  # should have at least one default point


async def test_mock_ask_stream_yields_chunks():
    case, tl, cur, risk = _case_fixture()
    chunks = []
    async for c in ask_about_case_stream(case, tl, [], cur, [], risk, "what is next?"):
        chunks.append(c)
    full = "".join(chunks)
    assert "Mock response" in full
    assert "what is next?" in full
    assert "Send reminder at 28 days" in full  # required actions surfaced
    assert len(chunks) > 1  # actually streamed in multiple chunks


async def test_mock_ask_stream_with_no_workflow_state():
    case, tl, _, risk = _case_fixture()
    chunks = []
    async for c in ask_about_case_stream(case, tl, [], None, [], risk, "status?"):
        chunks.append(c)
    assert "Mock response" in "".join(chunks)


async def test_mock_ask_stream_includes_kb_chunk_when_provided():
    case, tl, cur, risk = _case_fixture()
    kb = [{"title": "Test BB101", "heading_path": "CO2 thresholds",
           "text": "CO2 should not exceed 1500 ppm in classrooms.",
           "publisher": "DfE", "year": "2018"}]
    chunks = []
    async for c in ask_about_case_stream(case, tl, [], cur, [], risk, "co2?", kb_chunks=kb):
        chunks.append(c)
    full = "".join(chunks)
    assert "[KB-1]" in full
    assert "Test BB101" in full
    assert "1500 ppm" in full


def test_mock_summary_includes_kb_reference_when_provided():
    case, tl, cur, risk = _case_fixture()
    kb = [{"title": "Test BB101", "heading_path": "Mould response",
           "text": "Remove visible mould within 6 weeks.",
           "publisher": "DfE", "year": "2018"}]
    out = summarise_case(case, tl, [], cur, [], risk, kb_chunks=kb)
    combined = " ".join(out["key_points"])
    assert "[KB-1]" in combined
    assert "Test BB101" in combined
