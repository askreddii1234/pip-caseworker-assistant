from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import uuid
import os

from models import get_db, PIPClaim, Evidence

router = APIRouter(prefix="/upload", tags=["upload"])

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/submit")
async def submit_claim(
    claimant_name: str = Form(...),
    claimant_email: str = Form(None),
    date_of_birth: str = Form(None),
    primary_condition: str = Form(...),
    additional_conditions: str = Form(None),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    claim_id = f"PIP-{datetime.utcnow().strftime('%Y%m')}-{uuid.uuid4().hex[:5].upper()}"

    claim = PIPClaim(
        id=claim_id,
        claimant_name=claimant_name,
        claimant_email=claimant_email,
        date_of_birth=date_of_birth,
        claim_type="new_claim",
        status="submitted",
        risk_level="medium",
        primary_condition=primary_condition,
        additional_conditions=additional_conditions,
        target_date=datetime.utcnow() + timedelta(days=75),
    )
    db.add(claim)

    for file in files:
        file_path = os.path.join(UPLOAD_DIR, f"{claim_id}_{file.filename}")
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        doc_type = _guess_doc_type(file.filename)
        ev = Evidence(
            claim_id=claim_id,
            document_type=doc_type,
            filename=file.filename,
            description=f"Uploaded by claimant: {file.filename}",
            received=True,
            received_at=datetime.utcnow(),
        )
        db.add(ev)

    db.commit()
    return {"claim_id": claim_id, "status": "submitted", "files_received": len(files)}


def _guess_doc_type(filename: str) -> str:
    name = filename.lower()
    if "pip2" in name or "pip 2" in name:
        return "PIP2 questionnaire"
    if "gp" in name or "doctor" in name or "medical" in name:
        return "GP/Medical letter"
    if "passport" in name or "id" in name or "driving" in name:
        return "ID document"
    if "specialist" in name or "consultant" in name:
        return "Specialist report"
    if "prescription" in name or "medication" in name:
        return "Medication evidence"
    return "Supporting document"
