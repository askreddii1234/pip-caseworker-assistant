import json
from datetime import datetime
from pathlib import Path
from passlib.context import CryptContext
from models import init_db, SessionLocal, PIPClaim, AssessmentNote, Evidence, ActivityScore, PIPDescriptor, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
DATA_DIR = Path("/app/data")


def parse_dt(s):
    return datetime.fromisoformat(s)


def seed():
    init_db()
    db = SessionLocal()

    if db.query(PIPClaim).count() > 0:
        print("Database already seeded, skipping.")
        db.close()
        return

    users = [
        User(username="j.patel", full_name="Jaya Patel", role="caseworker", hashed_password=pwd_context.hash("demo123")),
        User(username="r.singh", full_name="Raj Singh", role="caseworker", hashed_password=pwd_context.hash("demo123")),
        User(username="m.khan", full_name="Mariam Khan", role="team_leader", hashed_password=pwd_context.hash("demo123")),
    ]
    db.add_all(users)

    with open(DATA_DIR / "claims.json") as f:
        data = json.load(f)

    for c in data["claims"]:
        claim = PIPClaim(
            id=c["id"], claimant_name=c["claimant_name"], claimant_email=c.get("claimant_email"),
            date_of_birth=c.get("date_of_birth"), claim_type=c["claim_type"], status=c["status"],
            risk_level=c["risk_level"], assigned_to=c.get("assigned_to"),
            primary_condition=c.get("primary_condition"), additional_conditions=c.get("additional_conditions"),
            medication=c.get("medication"), created_at=parse_dt(c["created_at"]),
            target_date=parse_dt(c["target_date"]) if c.get("target_date") else None,
            updated_at=datetime.utcnow(),
        )
        db.add(claim)

        for n in c.get("notes", []):
            db.add(AssessmentNote(claim_id=c["id"], author=n["author"], content=n["content"], created_at=parse_dt(n["created_at"])))

        for e in c.get("evidence", []):
            db.add(Evidence(
                claim_id=c["id"], document_type=e["document_type"], description=e.get("description"),
                received=e.get("received", False),
                received_at=parse_dt(e["received_at"]) if e.get("received_at") else None,
            ))

    with open(DATA_DIR / "pip_descriptors.json") as f:
        desc_data = json.load(f)

    for d in desc_data["descriptors"]:
        db.add(PIPDescriptor(
            activity_number=d["activity_number"], activity_name=d["activity_name"],
            category=d["category"], descriptor_letter=d["descriptor_letter"],
            descriptor_text=d["descriptor_text"], points=d["points"],
            source_url="https://www.gov.uk/pip/how-youre-assessed",
        ))

    db.commit()
    db.close()
    print(f"Seeded {len(data['claims'])} claims, {len(desc_data['descriptors'])} descriptors, 3 users.")


if __name__ == "__main__":
    seed()
