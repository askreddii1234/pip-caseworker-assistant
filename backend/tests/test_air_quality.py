"""Tests for the air-quality intake + recommended-actions endpoints."""


VALID_PAYLOAD = {
    "submitter_name": "Priya Shah",
    "submitter_role": "Parent",
    "contact_email": "priya.shah@example.com",
    "contact_phone": "07700 900 214",
    "school_name": "Ashbury Primary School",
    "building_location_room": "Classroom 4B",
    "incident_datetime": "2026-04-02T08:15",
    "issue_category": "Mold/Moisture",
    "detailed_description": (
        "Dark mould patches on the north-facing wall of the classroom. "
        "Musty smell. My daughter has asthma and sits near the affected wall."
    ),
    "symptoms": ["Coughing", "Wheezing"],
    "affected_count": 28,
    "duration": "5 days",
    "observations": ["Visible mold/mould", "Musty odour"],
    "observations_notes": "Patches 15cm across.",
    "severity_level": "High",
    "urgency": False,
    "related_incidents": "",
    "attachments": [{"file_name": "wall.jpg", "file_type": "image/jpeg"}],
}


def _seed_aq_workflow(db):
    import models
    for s in [
        dict(case_type="air_quality_concern", state="case_created", label="Case created",
             description="Triage required.",
             allowed_transitions=["awaiting_evidence", "under_review", "escalated"],
             required_actions=["Acknowledge within 2 working days"]),
        dict(case_type="air_quality_concern", state="awaiting_evidence", label="Awaiting inspection",
             description="Facilities inspection requested.",
             allowed_transitions=["under_review", "escalated"],
             required_actions=["Arrange inspection"],
             reminder_days=3, escalation_days=7),
        dict(case_type="air_quality_concern", state="escalated", label="Escalated",
             description="Team leader briefed.",
             allowed_transitions=["under_review", "closed"],
             required_actions=["Brief team leader"]),
    ]:
        db.add(models.WorkflowState(**s))
    db.commit()


def _seed_min_workflow(db):
    """Minimal benefit_review workflow so the non-AQ recommended-actions test has a case."""
    import models
    db.add(models.WorkflowState(
        case_type="benefit_review", state="awaiting_evidence", label="Awaiting evidence",
        description="Waiting on evidence.",
        allowed_transitions=["under_review", "escalated"],
        required_actions=["Send reminder at 28 days"],
        reminder_days=28, escalation_days=56,
    ))
    db.commit()


def test_submit_air_quality_creates_case(client, db):
    _seed_min_workflow(db); _seed_aq_workflow(db)

    r = client.post("/cases/air-quality", json=VALID_PAYLOAD)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "case_created"
    assert body["severity_level"] == "High"
    assert body["is_urgent"] is False
    assert body["case_id"].startswith("CASE-")

    detail = client.get(f"/cases/{body['case_id']}")
    assert detail.status_code == 200
    c = detail.json()["case"]
    assert c["case_type"] == "air_quality_concern"
    assert c["severity_level"] == "High"
    assert c["submission_payload"]["school_name"] == "Ashbury Primary School"
    assert c["submission_payload"]["issue_category"] == "Mold/Moisture"


def test_critical_severity_flags_urgent(client, db):
    _seed_min_workflow(db); _seed_aq_workflow(db)
    payload = {**VALID_PAYLOAD, "severity_level": "Critical", "urgency": False}
    r = client.post("/cases/air-quality", json=payload)
    assert r.status_code == 200
    assert r.json()["is_urgent"] is True  # forced by Critical severity


def test_rejects_short_description(client, db):
    _seed_min_workflow(db); _seed_aq_workflow(db)
    payload = {**VALID_PAYLOAD, "detailed_description": "too short"}
    r = client.post("/cases/air-quality", json=payload)
    assert r.status_code == 422


def test_rejects_bad_category(client, db):
    _seed_min_workflow(db); _seed_aq_workflow(db)
    payload = {**VALID_PAYLOAD, "issue_category": "NOT_A_REAL_CATEGORY"}
    r = client.post("/cases/air-quality", json=payload)
    assert r.status_code == 422


def test_recommended_actions_for_critical(client, db):
    _seed_min_workflow(db); _seed_aq_workflow(db)
    payload = {**VALID_PAYLOAD, "severity_level": "Critical", "issue_category": "Chemical Smell"}
    created = client.post("/cases/air-quality", json=payload).json()

    r = client.get(f"/cases/{created['case_id']}/recommended-actions")
    assert r.status_code == 200
    body = r.json()
    assert body["applicable"] is True
    assert any("same working day" in a.lower() or "telephone" in a.lower() for a in body["actions"])
    assert body["severity_level"] == "Critical"


def test_recommended_actions_for_non_aq_case(client, seeded):
    r = client.get("/cases/CASE-OK/recommended-actions")
    assert r.status_code == 200
    body = r.json()
    assert body["applicable"] is False
    assert body["actions"] == []


def test_affected_count_triggers_upgrade_note(client, db):
    _seed_min_workflow(db); _seed_aq_workflow(db)
    payload = {**VALID_PAYLOAD, "severity_level": "Medium",
               "issue_category": "Mold/Moisture", "affected_count": 12}
    created = client.post("/cases/air-quality", json=payload).json()
    r = client.get(f"/cases/{created['case_id']}/recommended-actions")
    actions = r.json()["actions"]
    assert any("upgrade" in a.lower() and "POL-AQ-001" in a for a in actions)


def test_dashboard_includes_air_quality_block(client, db):
    _seed_min_workflow(db); _seed_aq_workflow(db)
    client.post("/cases/air-quality", json=VALID_PAYLOAD)
    client.post("/cases/air-quality", json={**VALID_PAYLOAD, "severity_level": "Critical"})

    r = client.get("/cases/dashboard/risk")
    assert r.status_code == 200
    body = r.json()
    assert body["air_quality"] is not None
    aq = body["air_quality"]
    assert aq["total_open"] == 2
    assert aq["by_severity"].get("Critical") == 1
    assert aq["by_severity"].get("High") == 1
    assert "Ashbury Primary School" in aq["by_school"]


def test_dashboard_has_no_aq_block_when_none_present(client, seeded):
    r = client.get("/cases/dashboard/risk")
    assert r.status_code == 200
    assert r.json()["air_quality"] is None
