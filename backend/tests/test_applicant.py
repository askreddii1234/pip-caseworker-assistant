"""Tests for the applicant-facing lookup endpoint."""


def test_lookup_by_applicant_reference(client, seeded):
    r = client.get("/cases/by-reference/REF-OK")
    assert r.status_code == 200
    assert r.json()["case_id"] == "CASE-OK"


def test_lookup_by_case_id_also_works(client, seeded):
    r = client.get("/cases/by-reference/CASE-OK")
    assert r.status_code == 200
    assert r.json()["case_id"] == "CASE-OK"


def test_lookup_not_found_returns_404(client, seeded):
    r = client.get("/cases/by-reference/REF-MISSING")
    assert r.status_code == 404


def test_lookup_returns_status_label_not_raw_state(client, seeded):
    r = client.get("/cases/by-reference/REF-OK")
    d = r.json()
    assert d["status"] == "awaiting_evidence"
    assert d["status_label"] == "Awaiting evidence"


def test_lookup_hides_caseworker_internals(client, seeded):
    """Applicant view must not leak assignee or caseworker notes fields."""
    r = client.get("/cases/by-reference/REF-OK")
    d = r.json()
    assert "assigned_to" not in d
    assert "caseworker_notes" not in d
    assert "ai_summary" not in d


def test_lookup_ok_status_has_no_evidence_warning(client, seeded):
    r = client.get("/cases/by-reference/REF-OK")
    d = r.json()
    assert d["evidence_outstanding"] is True  # still awaiting_evidence
    # Within thresholds — gentle message, not urgent
    assert "as soon as possible" not in (d["evidence_message"] or "")
    assert "urgently" not in (d["evidence_message"] or "")


def test_lookup_reminder_due_message(client, seeded):
    r = client.get("/cases/by-reference/REF-REM")
    d = r.json()
    assert d["evidence_outstanding"] is True
    assert "as soon as possible" in d["evidence_message"]


def test_lookup_escalation_due_message_is_urgent(client, seeded):
    r = client.get("/cases/by-reference/REF-ESC")
    d = r.json()
    assert d["evidence_outstanding"] is True
    assert "urgently" in d["evidence_message"]


def test_lookup_closed_case_no_evidence_message(client, seeded):
    r = client.get("/cases/by-reference/REF-CLOSED")
    d = r.json()
    assert d["evidence_outstanding"] is False
    assert d["evidence_message"] is None
    assert d["status_label"] == "Closed"


def test_lookup_timeline_is_included(client, seeded):
    r = client.get("/cases/by-reference/REF-CLOSED")
    events = r.json()["timeline"]
    assert len(events) == 2
    assert {e["event"] for e in events} == {"case_created", "closed"}


def test_lookup_what_happens_next_from_current_state(client, seeded):
    r = client.get("/cases/by-reference/REF-OK")
    assert "Waiting on evidence" in r.json()["what_happens_next"]
