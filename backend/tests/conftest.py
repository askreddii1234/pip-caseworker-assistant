"""Test harness.

Forces an in-memory SQLite DB before `models` is imported, patches the engine
to use a StaticPool (so all sessions share the same in-memory DB), and ensures
no ANTHROPIC_API_KEY leaks from the host — AI tests rely on mock mode.
"""
import os
from datetime import date, timedelta

# Must be set before any backend import that reads env.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ANTHROPIC_API_KEY"] = ""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

import models  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _patch_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.engine = engine
    models.SessionLocal.configure(bind=engine)
    models.Base.metadata.create_all(engine)
    yield
    models.Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _clean_db():
    """Wipe tables between tests so each test starts clean."""
    yield
    session = models.SessionLocal()
    try:
        for table in reversed(models.Base.metadata.sorted_tables):
            session.execute(table.delete())
        session.commit()
    finally:
        session.close()


# ---- Seed helpers ---------------------------------------------------------

TODAY = date.today()


def _d(offset_days: int) -> str:
    return (TODAY + timedelta(days=offset_days)).isoformat()


def _seed_workflow(db):
    """Minimal workflow for benefit_review and licence_application."""
    states = [
        # benefit_review
        dict(case_type="benefit_review", state="case_created", label="Case created",
             description="Awaiting initial assessment.",
             allowed_transitions=["awaiting_evidence", "under_review"],
             required_actions=["Confirm identity"]),
        dict(case_type="benefit_review", state="awaiting_evidence", label="Awaiting evidence",
             description="Waiting on evidence from applicant.",
             allowed_transitions=["under_review", "escalated"],
             required_actions=["Send reminder at 28 days"],
             reminder_days=28, escalation_days=56),
        dict(case_type="benefit_review", state="under_review", label="Under review",
             description="Assessing against policy.",
             allowed_transitions=["pending_decision", "escalated"],
             required_actions=["Verify all evidence"]),
        dict(case_type="benefit_review", state="pending_decision", label="Pending decision",
             description="Awaiting sign-off.",
             allowed_transitions=["closed"], required_actions=["Draft decision"]),
        dict(case_type="benefit_review", state="escalated", label="Escalated",
             description="Referred to team leader.",
             allowed_transitions=["under_review", "closed"],
             required_actions=["Brief team leader"]),
        dict(case_type="benefit_review", state="closed", label="Closed",
             description="Decision communicated.", allowed_transitions=[],
             required_actions=["Notify applicant"]),
        # licence_application
        dict(case_type="licence_application", state="case_created", label="Case created",
             description="Eligibility check required.",
             allowed_transitions=["awaiting_evidence", "closed"],
             required_actions=["Check eligibility"]),
        dict(case_type="licence_application", state="awaiting_evidence", label="Awaiting evidence",
             description="Documentation requested.",
             allowed_transitions=["under_review", "escalated"],
             required_actions=["Chase after 14 days"],
             reminder_days=14, escalation_days=30),
        dict(case_type="licence_application", state="closed", label="Closed",
             description="Licence granted or refused.", allowed_transitions=[],
             required_actions=["Issue notice"]),
    ]
    for s in states:
        db.add(models.WorkflowState(**s))


def _seed_policies(db):
    db.add(models.Policy(
        policy_id="POL-BR-003", title="Evidence requirements",
        applicable_case_types=["benefit_review"],
        body="Evidence outstanding after 28 days → reminder. 56 days → escalate.",
    ))
    db.add(models.Policy(
        policy_id="POL-LA-001", title="Licence eligibility",
        applicable_case_types=["licence_application"],
        body="Applicant must be 18+ and hold valid insurance.",
    ))


def _make_case(db, *, case_id, case_type="benefit_review", status="awaiting_evidence",
               assigned_to="team_a", created_offset=-30, last_offset=-5,
               reference=None, name="Test Applicant", timeline=None, notes=""):
    db.add(models.Case(
        case_id=case_id, case_type=case_type, status=status,
        applicant_name=name, applicant_reference=reference or f"REF-{case_id[-4:]}",
        assigned_to=assigned_to,
        created_date=_d(created_offset), last_updated=_d(last_offset),
        case_notes=notes,
    ))
    for ev in timeline or []:
        db.add(models.CaseTimelineEvent(case_id=case_id, **ev))


@pytest.fixture
def db():
    session = models.SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def seeded(db):
    """A small deterministic dataset covering the main edge cases."""
    _seed_workflow(db)
    _seed_policies(db)

    # Case 1: awaiting_evidence, within reminder threshold (10 days ago)
    _make_case(db, case_id="CASE-OK", name="Alice OK", reference="REF-OK",
               created_offset=-15, last_offset=-10,
               timeline=[dict(date=_d(-10), event="evidence_requested",
                              note="Asked for income statement.")])

    # Case 2: awaiting_evidence, past reminder (30 days ago)
    _make_case(db, case_id="CASE-REM", name="Bob Reminder", reference="REF-REM",
               assigned_to="team_b",
               created_offset=-40, last_offset=-30,
               timeline=[dict(date=_d(-30), event="evidence_requested", note="Request 1")])

    # Case 3: awaiting_evidence, past escalation (60 days ago)
    _make_case(db, case_id="CASE-ESC", name="Carla Escalate", reference="REF-ESC",
               assigned_to="team_a",
               created_offset=-70, last_offset=-60,
               timeline=[dict(date=_d(-60), event="evidence_requested", note="Long wait")])

    # Case 4: closed — never flags risk
    _make_case(db, case_id="CASE-CLOSED", status="closed", name="Dara Done",
               reference="REF-CLOSED",
               timeline=[dict(date=_d(-80), event="case_created"),
                         dict(date=_d(-5), event="closed", note="Decision issued")])

    # Case 5: licence_application with shorter thresholds (20 days ago, past reminder, past escalation at 30 days? No — 20 days past reminder(14), within esc(30))
    _make_case(db, case_id="CASE-LIC", case_type="licence_application",
               name="The Old Crown", reference="REF-LIC",
               assigned_to="team_a",
               created_offset=-25, last_offset=-20,
               timeline=[dict(date=_d(-20), event="evidence_requested",
                              note="Requested site plan")])

    db.commit()
    return db


@pytest.fixture
def client():
    """TestClient without the lifespan context manager — so the JSON-file seed
    in main.lifespan() never runs. Tests seed the DB themselves via fixtures."""
    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app)
