import os
import uuid
from datetime import date

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session

from models import get_db, Case, CaseTimelineEvent

router = APIRouter(prefix="/upload", tags=["upload"])

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

VALID_CASE_TYPES = {"benefit_review", "licence_application", "compliance_check"}


@router.post("/submit")
async def submit_case(
    applicant_name: str = Form(...),
    applicant_reference: str = Form(None),
    case_type: str = Form(...),
    applicant_dob: str = Form(None),
    summary: str = Form(None),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    if case_type not in VALID_CASE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"case_type must be one of {sorted(VALID_CASE_TYPES)}",
        )

    today = date.today().isoformat()
    case_id = f"CASE-{date.today().year}-{uuid.uuid4().hex[:5].upper()}"

    case = Case(
        case_id=case_id,
        case_type=case_type,
        status="case_created",
        applicant_name=applicant_name,
        applicant_reference=applicant_reference,
        applicant_dob=applicant_dob,
        created_date=today,
        last_updated=today,
        case_notes=summary,
    )
    db.add(case)
    db.add(CaseTimelineEvent(
        case_id=case_id, date=today, event="case_created",
        note="Application received via portal.",
    ))

    filenames = []
    for f in files:
        path = os.path.join(UPLOAD_DIR, f"{case_id}_{f.filename}")
        with open(path, "wb") as out:
            out.write(await f.read())
        filenames.append(f.filename)

    if filenames:
        db.add(CaseTimelineEvent(
            case_id=case_id, date=today, event="evidence_received",
            note=f"Portal upload: {', '.join(filenames)}",
        ))

    db.commit()
    return {"case_id": case_id, "status": "case_created", "files_received": len(filenames)}
