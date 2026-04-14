from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class UserOut(BaseModel):
    username: str
    full_name: str
    role: str


class ClaimOut(BaseModel):
    id: str
    claimant_name: str
    claimant_email: Optional[str] = None
    date_of_birth: Optional[str] = None
    claim_type: str
    status: str
    risk_level: str
    assigned_to: Optional[str] = None
    primary_condition: Optional[str] = None
    additional_conditions: Optional[str] = None
    daily_living_score: Optional[int] = None
    mobility_score: Optional[int] = None
    ai_summary: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    target_date: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClaimListOut(BaseModel):
    claims: List[ClaimOut]
    total: int


class NoteOut(BaseModel):
    id: int
    claim_id: str
    author: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class NoteCreate(BaseModel):
    content: str


class EvidenceOut(BaseModel):
    id: int
    claim_id: str
    document_type: str
    filename: Optional[str] = None
    description: Optional[str] = None
    received: bool
    received_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ActivityScoreOut(BaseModel):
    id: int
    claim_id: str
    activity_name: str
    activity_category: str
    descriptor_chosen: Optional[str] = None
    points: int
    ai_suggested_points: Optional[int] = None
    ai_reasoning: Optional[str] = None
    evidence_refs: Optional[str] = None
    confirmed_by_caseworker: bool

    class Config:
        from_attributes = True


class ClaimDetailOut(BaseModel):
    claim: ClaimOut
    notes: List[NoteOut]
    evidence: List[EvidenceOut]
    activity_scores: List[ActivityScoreOut]


class AISummaryOut(BaseModel):
    summary: str
    risk_level: str
    risk_reasoning: str
    daily_living_score: int
    mobility_score: int


class AIGapAnalysis(BaseModel):
    missing: List[str]
    recommendations: List[str]


class AIAskRequest(BaseModel):
    question: str


class RiskItem(BaseModel):
    claim_id: str
    claimant_name: str
    claim_type: str
    risk_level: str
    status: str
    days_open: int
    days_to_sla: int
    missing_evidence_count: int
    assigned_to: Optional[str] = None


class RiskDashboardOut(BaseModel):
    high_risk: List[RiskItem]
    medium_risk: List[RiskItem]
    stats: dict
