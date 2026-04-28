from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class UserOut(BaseModel):
    username: str
    full_name: str
    role: str


class TimelineEventOut(BaseModel):
    date: str
    event: str
    note: Optional[str] = None

    class Config:
        from_attributes = True


class CaseworkerNoteOut(BaseModel):
    id: int
    case_id: str
    author: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class CaseworkerNoteCreate(BaseModel):
    content: str
    author: Optional[str] = "caseworker"


class CaseOut(BaseModel):
    case_id: str
    case_type: str
    status: str
    applicant_name: str
    applicant_reference: Optional[str] = None
    applicant_dob: Optional[str] = None
    assigned_to: Optional[str] = None
    created_date: str
    last_updated: str
    case_notes: Optional[str] = None
    ai_summary: Optional[str] = None
    severity_level: Optional[str] = None
    is_urgent: Optional[bool] = False
    submission_payload: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class RiskFlag(BaseModel):
    level: str          # ok | reminder_due | escalation_due
    reason: str
    days_since_request: Optional[int] = None
    reminder_days: Optional[int] = None
    escalation_days: Optional[int] = None


class CaseSummaryOut(CaseOut):
    risk: RiskFlag


class CaseListOut(BaseModel):
    cases: List[CaseSummaryOut]
    total: int


class WorkflowStateOut(BaseModel):
    state: str
    label: str
    description: Optional[str] = None
    allowed_transitions: List[str] = []
    required_actions: List[str] = []
    reminder_days: Optional[int] = None
    escalation_days: Optional[int] = None

    class Config:
        from_attributes = True


class PolicyOut(BaseModel):
    policy_id: str
    title: str
    applicable_case_types: List[str]
    body: str

    class Config:
        from_attributes = True


class CaseDetailOut(BaseModel):
    case: CaseOut
    timeline: List[TimelineEventOut]
    caseworker_notes: List[CaseworkerNoteOut]
    current_state: Optional[WorkflowStateOut] = None
    allowed_states: List[WorkflowStateOut] = []
    policies: List[PolicyOut] = []
    risk: RiskFlag


class RiskItem(BaseModel):
    case_id: str
    applicant_name: str
    case_type: str
    status: str
    assigned_to: Optional[str] = None
    risk_level: str
    risk_reason: str
    days_since_request: Optional[int] = None
    days_open: int


class AirQualityDashboardOut(BaseModel):
    total_open: int
    urgent: int
    by_severity: Dict[str, int]
    by_school: Dict[str, int]
    by_issue_category: Dict[str, int]
    sla_breach: int
    workload_by_officer: Dict[str, int]
    high_risk_schools: List[Dict[str, Any]]


class RiskDashboardOut(BaseModel):
    escalation_due: List[RiskItem]
    reminder_due: List[RiskItem]
    stats: Dict[str, Any]
    air_quality: Optional[AirQualityDashboardOut] = None


class KbChunkOut(BaseModel):
    chunk_id: str
    doc_id: str
    title: str
    publisher: str
    year: str
    url: str
    heading_path: str
    text: str
    score: float = 0.0


class AISummaryOut(BaseModel):
    summary: str
    key_points: List[str]
    next_action: str
    mocked: bool
    sources: List[KbChunkOut] = []


class AIAskRequest(BaseModel):
    question: str


class ApplicantStatusOut(BaseModel):
    """Stripped-down view for the applicant — no assignee, no caseworker notes."""
    case_id: str
    case_type: str
    status: str
    status_label: str
    status_description: Optional[str] = None
    applicant_name: str
    created_date: str
    last_updated: str
    timeline: List[TimelineEventOut]
    evidence_outstanding: bool
    evidence_message: Optional[str] = None
    what_happens_next: Optional[str] = None
