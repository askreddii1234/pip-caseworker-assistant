import json
from pathlib import Path
from passlib.context import CryptContext
from models import (
    init_db, SessionLocal, Case, CaseTimelineEvent, Policy, WorkflowState, User,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
DATA_DIR = Path("/app/data")


def seed():
    init_db()
    db = SessionLocal()

    if db.query(Case).count() > 0:
        print("Database already seeded, skipping.")
        db.close()
        return

    if db.query(User).count() == 0:
        db.add_all([
            User(username="j.patel", full_name="Jaya Patel", role="caseworker",
                 hashed_password=pwd_context.hash("demo123")),
            User(username="r.singh", full_name="Raj Singh", role="caseworker",
                 hashed_password=pwd_context.hash("demo123")),
            User(username="m.khan", full_name="Mariam Khan", role="team_leader",
                 hashed_password=pwd_context.hash("demo123")),
        ])

    with open(DATA_DIR / "cases.json") as f:
        cases = json.load(f)

    for c in cases:
        db.add(Case(
            case_id=c["case_id"],
            case_type=c["case_type"],
            status=c["status"],
            applicant_name=c["applicant"]["name"],
            applicant_reference=c["applicant"].get("reference"),
            applicant_dob=c["applicant"].get("date_of_birth"),
            assigned_to=c.get("assigned_to"),
            created_date=c["created_date"],
            last_updated=c["last_updated"],
            case_notes=c.get("case_notes"),
            severity_level=c.get("severity_level"),
            is_urgent=bool(c.get("is_urgent", False)),
            submission_payload=c.get("submission_payload"),
        ))
        for ev in c.get("timeline", []):
            db.add(CaseTimelineEvent(
                case_id=c["case_id"],
                date=ev["date"],
                event=ev["event"],
                note=ev.get("note"),
            ))

    with open(DATA_DIR / "policy-extracts.json") as f:
        policies = json.load(f)

    for p in policies:
        db.add(Policy(
            policy_id=p["policy_id"],
            title=p["title"],
            applicable_case_types=p["applicable_case_types"],
            body=p["body"],
        ))

    with open(DATA_DIR / "workflow-states.json") as f:
        wf = json.load(f)

    for case_type, block in wf["case_types"].items():
        for st in block["states"]:
            thresholds = st.get("escalation_thresholds") or {}
            db.add(WorkflowState(
                case_type=case_type,
                state=st["state"],
                label=st["label"],
                description=st.get("description"),
                allowed_transitions=st.get("allowed_transitions", []),
                required_actions=st.get("required_actions", []),
                reminder_days=thresholds.get("reminder_days"),
                escalation_days=thresholds.get("escalation_days"),
            ))

    db.commit()
    db.close()
    print(f"Seeded {len(cases)} cases, {len(policies)} policies, "
          f"{sum(len(b['states']) for b in wf['case_types'].values())} workflow states.")


if __name__ == "__main__":
    seed()
