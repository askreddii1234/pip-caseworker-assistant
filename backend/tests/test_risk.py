"""Pure unit tests for risk.compute_risk — no DB, no FastAPI."""
from datetime import date, timedelta
from types import SimpleNamespace

from risk import compute_risk


def _event(days_ago, event="evidence_requested", note=""):
    return SimpleNamespace(
        date=(date.today() - timedelta(days=days_ago)).isoformat(),
        event=event,
        note=note,
    )


def _case(status, timeline):
    return SimpleNamespace(status=status, timeline=timeline)


def _awaiting(reminder=28, escalation=56):
    return SimpleNamespace(reminder_days=reminder, escalation_days=escalation)


# --- status-based short-circuits -------------------------------------------

def test_under_review_is_always_ok():
    r = compute_risk(_case("under_review", [_event(100)]), _awaiting())
    assert r["level"] == "ok"


def test_closed_case_is_ok_even_with_ancient_request():
    r = compute_risk(_case("closed", [_event(9999)]), _awaiting())
    assert r["level"] == "ok"


def test_pending_decision_ignores_evidence_timeline():
    r = compute_risk(_case("pending_decision", [_event(200)]), _awaiting())
    assert r["level"] == "ok"


# --- awaiting_evidence with no request -------------------------------------

def test_awaiting_evidence_with_no_request_is_ok():
    r = compute_risk(_case("awaiting_evidence", []), _awaiting())
    assert r["level"] == "ok"
    assert "No evidence request" in r["reason"]


def test_awaiting_evidence_with_only_other_events_is_ok():
    r = compute_risk(
        _case("awaiting_evidence", [_event(100, event="case_created")]),
        _awaiting(),
    )
    assert r["level"] == "ok"


# --- threshold edges -------------------------------------------------------

def test_within_reminder_threshold_is_ok():
    r = compute_risk(_case("awaiting_evidence", [_event(27)]), _awaiting(28, 56))
    assert r["level"] == "ok"


def test_exactly_at_reminder_threshold_is_reminder_due():
    r = compute_risk(_case("awaiting_evidence", [_event(28)]), _awaiting(28, 56))
    assert r["level"] == "reminder_due"


def test_between_reminder_and_escalation_is_reminder_due():
    r = compute_risk(_case("awaiting_evidence", [_event(42)]), _awaiting(28, 56))
    assert r["level"] == "reminder_due"


def test_exactly_at_escalation_threshold_is_escalation_due():
    r = compute_risk(_case("awaiting_evidence", [_event(56)]), _awaiting(28, 56))
    assert r["level"] == "escalation_due"


def test_past_escalation_is_escalation_not_reminder():
    r = compute_risk(_case("awaiting_evidence", [_event(120)]), _awaiting(28, 56))
    assert r["level"] == "escalation_due"
    assert "120" in r["reason"]


# --- multiple requests -----------------------------------------------------

def test_uses_most_recent_evidence_request():
    # Older request would be escalation_due; most recent is within thresholds.
    timeline = [_event(200), _event(5)]
    r = compute_risk(_case("awaiting_evidence", timeline), _awaiting(28, 56))
    assert r["level"] == "ok"


def test_multiple_requests_still_escalates_if_latest_is_old():
    timeline = [_event(300), _event(100)]
    r = compute_risk(_case("awaiting_evidence", timeline), _awaiting(28, 56))
    assert r["level"] == "escalation_due"


# --- missing workflow state ------------------------------------------------

def test_no_awaiting_workflow_state_returns_ok_even_when_overdue():
    """If the workflow table is missing awaiting_evidence we can't judge —
    we choose to return ok rather than false-positive."""
    r = compute_risk(_case("awaiting_evidence", [_event(300)]), None)
    assert r["level"] == "ok"


def test_workflow_state_with_no_thresholds_returns_ok():
    state = SimpleNamespace(reminder_days=None, escalation_days=None)
    r = compute_risk(_case("awaiting_evidence", [_event(300)]), state)
    assert r["level"] == "ok"


# --- other edges -----------------------------------------------------------

def test_future_dated_request_handled_gracefully():
    """Defensive — shouldn't happen in data but must not crash."""
    r = compute_risk(_case("awaiting_evidence", [_event(-5)]), _awaiting())
    assert r["level"] == "ok"
    assert r["days_since_request"] == -5


def test_custom_today_for_deterministic_testing():
    fixed_today = date(2026, 4, 15)
    event = SimpleNamespace(date="2026-02-01", event="evidence_requested", note="")
    c = _case("awaiting_evidence", [event])
    r = compute_risk(c, _awaiting(28, 56), today=fixed_today)
    # Feb 1 → Apr 15 = 73 days
    assert r["days_since_request"] == 73
    assert r["level"] == "escalation_due"
