"""Specialist intake for the air_quality_concern case type.

Accepts the 8-section form payload, validates with Pydantic, generates a
case_id in the existing CASE-YYYY-NNNNN format, stores specialist fields as
a JSON submission_payload, and seeds the initial timeline event.
"""
import uuid
from datetime import date
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from models import get_db, Case, CaseTimelineEvent

router = APIRouter(prefix="/cases/air-quality", tags=["air-quality"])


SUBMITTER_ROLES = Literal[
    "Parent", "Student", "Teaching Staff",
    "Facilities Staff", "Admin Staff", "Other",
]
ISSUE_CATEGORIES = Literal[
    "Odor", "Dust/Particles", "Mold/Moisture", "Chemical Smell",
    "Poor Ventilation", "Temperature Issues", "Other",
]
SEVERITY_LEVELS = Literal["Low", "Medium", "High", "Critical"]


class AttachmentIn(BaseModel):
    file_name: str
    file_type: Optional[str] = None


class AirQualityIntake(BaseModel):
    submitter_name: str = Field(min_length=1)
    submitter_role: SUBMITTER_ROLES
    contact_email: EmailStr
    contact_phone: Optional[str] = None

    school_name: str = Field(min_length=1)
    building_location_room: str = Field(min_length=1)

    incident_datetime: str  # ISO; accept YYYY-MM-DDTHH:MM
    issue_category: ISSUE_CATEGORIES
    detailed_description: str = Field(min_length=50)

    symptoms: List[str] = Field(default_factory=list)
    affected_count: Optional[int] = Field(default=None, ge=0)
    duration: Optional[str] = None

    observations: List[str] = Field(default_factory=list)
    observations_notes: Optional[str] = None

    severity_level: SEVERITY_LEVELS
    urgency: bool = False

    related_incidents: Optional[str] = None
    attachments: List[AttachmentIn] = Field(default_factory=list)

    assigned_to: Optional[str] = None  # team_a|team_b|team_c — optional, defaults by rule


class AirQualityIntakeOut(BaseModel):
    case_id: str
    status: str
    severity_level: str
    is_urgent: bool
    assigned_to: Optional[str]


def _default_team_for(severity: str) -> str:
    """Simple routing rule so seeded + submitted data sits alongside each other."""
    if severity == "Critical":
        return "team_c"
    if severity == "High":
        return "team_b"
    return "team_a"


@router.post("", response_model=AirQualityIntakeOut)
def submit_air_quality_case(payload: AirQualityIntake, db: Session = Depends(get_db)):
    today = date.today().isoformat()
    case_id = f"CASE-{date.today().year}-{uuid.uuid4().hex[:5].upper()}"

    is_urgent = bool(payload.urgency) or payload.severity_level == "Critical"
    assigned_to = payload.assigned_to or _default_team_for(payload.severity_level)

    applicant_ref = f"AQ-{date.today().year}-{case_id.split('-')[-1]}"

    submission_payload = payload.model_dump(mode="json")
    submission_payload["assigned_officer_name"] = submission_payload.get("assigned_officer_name")
    submission_payload["actions_taken"] = ""
    submission_payload["internal_notes"] = ""

    case = Case(
        case_id=case_id,
        case_type="air_quality_concern",
        status="case_created",
        applicant_name=payload.submitter_name,
        applicant_reference=applicant_ref,
        applicant_dob=None,
        assigned_to=assigned_to,
        created_date=today,
        last_updated=today,
        case_notes=payload.detailed_description,
        severity_level=payload.severity_level,
        is_urgent=is_urgent,
        submission_payload=submission_payload,
    )
    db.add(case)

    db.add(CaseTimelineEvent(
        case_id=case_id, date=today, event="case_created",
        note=f"{payload.issue_category} reported by {payload.submitter_role.lower()} at {payload.school_name}.",
    ))
    if is_urgent:
        db.add(CaseTimelineEvent(
            case_id=case_id, date=today, event="flagged_urgent",
            note=f"Flagged urgent on submission (severity: {payload.severity_level}).",
        ))

    db.commit()
    return AirQualityIntakeOut(
        case_id=case_id,
        status="case_created",
        severity_level=payload.severity_level,
        is_urgent=is_urgent,
        assigned_to=assigned_to,
    )
