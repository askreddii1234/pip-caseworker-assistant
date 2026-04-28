"""Integration tests for /cases routes."""


def test_list_returns_all_seeded_cases(client, seeded):
    r = client.get("/cases")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 5
    ids = {c["case_id"] for c in data["cases"]}
    assert ids == {"CASE-OK", "CASE-REM", "CASE-ESC", "CASE-CLOSED", "CASE-LIC"}


def test_list_filter_by_case_type(client, seeded):
    r = client.get("/cases?case_type=licence_application")
    assert r.status_code == 200
    cases = r.json()["cases"]
    assert len(cases) == 1
    assert cases[0]["case_id"] == "CASE-LIC"


def test_list_filter_by_status(client, seeded):
    r = client.get("/cases?status=closed")
    assert [c["case_id"] for c in r.json()["cases"]] == ["CASE-CLOSED"]


def test_list_filter_by_risk_escalation_due(client, seeded):
    r = client.get("/cases?risk=escalation_due")
    ids = {c["case_id"] for c in r.json()["cases"]}
    assert ids == {"CASE-ESC"}


def test_list_filter_by_risk_reminder_due(client, seeded):
    r = client.get("/cases?risk=reminder_due")
    ids = {c["case_id"] for c in r.json()["cases"]}
    # CASE-REM (30 days past 28-day benefit_review reminder)
    # CASE-LIC (20 days past 14-day licence_application reminder; within 30-day escalation)
    assert ids == {"CASE-REM", "CASE-LIC"}


def test_list_filter_by_risk_ok_excludes_overdue(client, seeded):
    r = client.get("/cases?risk=ok")
    ids = {c["case_id"] for c in r.json()["cases"]}
    assert "CASE-ESC" not in ids
    assert "CASE-REM" not in ids
    assert "CASE-OK" in ids
    assert "CASE-CLOSED" in ids  # closed cases are "ok" by definition


def test_list_search_is_case_insensitive(client, seeded):
    r = client.get("/cases?search=alice")
    cases = r.json()["cases"]
    assert len(cases) == 1
    assert cases[0]["case_id"] == "CASE-OK"


def test_list_empty_result_when_no_match(client, seeded):
    r = client.get("/cases?search=nobody")
    assert r.json()["total"] == 0


def test_list_filter_by_assigned_to(client, seeded):
    r = client.get("/cases?assigned_to=team_b")
    assert [c["case_id"] for c in r.json()["cases"]] == ["CASE-REM"]


# --- detail view ----------------------------------------------------------

def test_get_case_detail_includes_workflow_and_policy(client, seeded):
    r = client.get("/cases/CASE-OK")
    assert r.status_code == 200
    d = r.json()
    assert d["case"]["case_id"] == "CASE-OK"
    assert d["current_state"]["state"] == "awaiting_evidence"
    assert d["current_state"]["reminder_days"] == 28
    # transitions available from awaiting_evidence
    assert {s["state"] for s in d["allowed_states"]} == {"under_review", "escalated"}
    # only benefit_review policies matched
    assert [p["policy_id"] for p in d["policies"]] == ["POL-BR-003"]
    assert d["risk"]["level"] == "ok"


def test_get_case_detail_includes_timeline(client, seeded):
    r = client.get("/cases/CASE-ESC")
    events = r.json()["timeline"]
    assert len(events) == 1
    assert events[0]["event"] == "evidence_requested"


def test_get_case_detail_escalation_flag(client, seeded):
    r = client.get("/cases/CASE-ESC")
    assert r.json()["risk"]["level"] == "escalation_due"


def test_get_case_not_found_returns_404(client, seeded):
    r = client.get("/cases/CASE-DOES-NOT-EXIST")
    assert r.status_code == 404


# --- transitions ----------------------------------------------------------

def test_transition_to_allowed_state_succeeds(client, seeded):
    r = client.patch("/cases/CASE-OK/status?new_status=under_review")
    assert r.status_code == 200
    assert r.json()["status"] == "under_review"

    follow = client.get("/cases/CASE-OK")
    assert follow.json()["case"]["status"] == "under_review"


def test_transition_to_disallowed_state_rejected(client, seeded):
    # awaiting_evidence → closed is not in allowed_transitions
    r = client.patch("/cases/CASE-OK/status?new_status=closed")
    assert r.status_code == 400
    assert "not allowed" in r.json()["detail"]


def test_transition_from_closed_is_rejected(client, seeded):
    # closed has no allowed_transitions
    r = client.patch("/cases/CASE-CLOSED/status?new_status=under_review")
    assert r.status_code == 400


def test_transition_nonexistent_case_404(client, seeded):
    r = client.patch("/cases/NOPE/status?new_status=under_review")
    assert r.status_code == 404


# --- notes ----------------------------------------------------------------

def test_add_note_creates_and_returns_it(client, seeded):
    r = client.post("/cases/CASE-OK/notes", json={"content": "Called applicant"})
    assert r.status_code == 200
    assert r.json()["content"] == "Called applicant"
    assert r.json()["author"] == "caseworker"

    detail = client.get("/cases/CASE-OK").json()
    assert any(n["content"] == "Called applicant" for n in detail["caseworker_notes"])


def test_add_note_updates_last_updated(client, seeded):
    before = client.get("/cases/CASE-OK").json()["case"]["last_updated"]
    client.post("/cases/CASE-OK/notes", json={"content": "x"})
    after = client.get("/cases/CASE-OK").json()["case"]["last_updated"]
    assert after >= before  # string ISO comparison is OK here


def test_add_note_for_missing_case_404(client, seeded):
    r = client.post("/cases/NOPE/notes", json={"content": "x"})
    assert r.status_code == 404


# --- risk dashboard -------------------------------------------------------

def test_risk_dashboard_stats(client, seeded):
    r = client.get("/cases/dashboard/risk")
    d = r.json()
    # CASE-CLOSED excluded from open
    assert d["stats"]["total_open"] == 4
    assert d["stats"]["total_escalation_due"] == 1
    # CASE-REM (benefit_review) + CASE-LIC (licence_application) are reminder_due
    assert d["stats"]["total_reminder_due"] == 2
    assert d["stats"]["by_case_type"]["benefit_review"] == 3
    assert d["stats"]["by_case_type"]["licence_application"] == 1


def test_risk_dashboard_filters_by_team(client, seeded):
    r = client.get("/cases/dashboard/risk?assigned_to=team_a")
    # team_a: CASE-OK, CASE-ESC, CASE-LIC
    assert r.json()["stats"]["total_open"] == 3


# --- policies + workflow endpoints ---------------------------------------

def test_policies_filter_by_case_type(client, seeded):
    r = client.get("/cases/policies/?case_type=licence_application")
    assert [p["policy_id"] for p in r.json()] == ["POL-LA-001"]


def test_workflow_endpoint_returns_all_states(client, seeded):
    r = client.get("/cases/workflow/benefit_review")
    assert r.status_code == 200
    states = {s["state"] for s in r.json()}
    assert "awaiting_evidence" in states and "closed" in states


def test_workflow_unknown_case_type_404(client, seeded):
    r = client.get("/cases/workflow/not_a_type")
    assert r.status_code == 404
