"""Tests for the /upload/submit endpoint."""


def test_submit_rejects_unknown_case_type(client, seeded):
    r = client.post("/upload/submit", data={
        "applicant_name": "Test",
        "case_type": "not_a_type",
    })
    assert r.status_code == 400
    assert "case_type" in r.json()["detail"]


def test_submit_creates_case_with_case_created_status(client, seeded):
    r = client.post("/upload/submit", data={
        "applicant_name": "Jo Bloggs",
        "case_type": "benefit_review",
        "summary": "New application",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "case_created"
    assert body["case_id"].startswith("CASE-")
    assert body["files_received"] == 0

    # Should be retrievable
    detail = client.get(f"/cases/{body['case_id']}")
    assert detail.status_code == 200
    assert detail.json()["case"]["applicant_name"] == "Jo Bloggs"


def test_submit_requires_applicant_name(client, seeded):
    r = client.post("/upload/submit", data={"case_type": "benefit_review"})
    assert r.status_code == 422  # missing required form field


def test_submit_creates_initial_timeline_event(client, seeded):
    r = client.post("/upload/submit", data={
        "applicant_name": "Timeline Test",
        "case_type": "compliance_check",
    })
    case_id = r.json()["case_id"]
    # compliance_check workflow not seeded so detail may miss workflow,
    # but timeline should still be there:
    detail = client.get(f"/cases/{case_id}")
    events = detail.json()["timeline"]
    assert any(e["event"] == "case_created" for e in events)
