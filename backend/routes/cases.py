from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from models import get_db, Case, CaseworkerNote, Policy, WorkflowState
from schemas import (
    CaseOut, CaseSummaryOut, CaseListOut, CaseDetailOut, TimelineEventOut,
    CaseworkerNoteOut, CaseworkerNoteCreate, WorkflowStateOut, PolicyOut,
    RiskFlag, RiskDashboardOut, RiskItem, ApplicantStatusOut,
    AirQualityDashboardOut,
)
from collections import Counter
from risk import compute_risk
from recommendations import recommend

router = APIRouter(prefix="/cases", tags=["cases"])


def _awaiting_state(db: Session, case_type: str) -> Optional[WorkflowState]:
    return db.query(WorkflowState).filter(
        WorkflowState.case_type == case_type,
        WorkflowState.state == "awaiting_evidence",
    ).first()


def _current_state(db: Session, case: Case) -> Optional[WorkflowState]:
    return db.query(WorkflowState).filter(
        WorkflowState.case_type == case.case_type,
        WorkflowState.state == case.status,
    ).first()


@router.get("", response_model=CaseListOut)
def list_cases(
    case_type: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    risk: Optional[str] = Query(None, description="ok | reminder_due | escalation_due"),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Case)
    if case_type:
        q = q.filter(Case.case_type == case_type)
    if status:
        q = q.filter(Case.status == status)
    if assigned_to:
        q = q.filter(Case.assigned_to == assigned_to)
    if search:
        q = q.filter(Case.applicant_name.ilike(f"%{search}%"))

    cases = q.order_by(Case.last_updated.desc()).all()

    # Pre-fetch awaiting_evidence states per case_type
    wf_cache: dict[str, Optional[WorkflowState]] = {}

    items = []
    for c in cases:
        if c.case_type not in wf_cache:
            wf_cache[c.case_type] = _awaiting_state(db, c.case_type)
        r = compute_risk(c, wf_cache[c.case_type])
        if risk and r["level"] != risk:
            continue
        items.append(CaseSummaryOut(
            **CaseOut.model_validate(c).model_dump(),
            risk=RiskFlag(**r),
        ))

    return CaseListOut(cases=items, total=len(items))


@router.get("/{case_id}", response_model=CaseDetailOut)
def get_case(case_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    current = _current_state(db, case)
    allowed_names = current.allowed_transitions if current else []
    allowed = []
    if allowed_names:
        allowed = db.query(WorkflowState).filter(
            WorkflowState.case_type == case.case_type,
            WorkflowState.state.in_(allowed_names),
        ).all()

    policies = db.query(Policy).all()
    matched = [p for p in policies if case.case_type in (p.applicable_case_types or [])]

    awaiting = _awaiting_state(db, case.case_type)
    r = compute_risk(case, awaiting)

    return CaseDetailOut(
        case=CaseOut.model_validate(case),
        timeline=[TimelineEventOut.model_validate(e) for e in case.timeline],
        caseworker_notes=[CaseworkerNoteOut.model_validate(n) for n in case.caseworker_notes],
        current_state=WorkflowStateOut.model_validate(current) if current else None,
        allowed_states=[WorkflowStateOut.model_validate(s) for s in allowed],
        policies=[PolicyOut.model_validate(p) for p in matched],
        risk=RiskFlag(**r),
    )


@router.post("/{case_id}/notes", response_model=CaseworkerNoteOut)
def add_note(case_id: str, note: CaseworkerNoteCreate, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    n = CaseworkerNote(case_id=case_id, author=note.author or "caseworker", content=note.content)
    db.add(n)
    case.last_updated = date.today().isoformat()
    db.commit()
    db.refresh(n)
    return CaseworkerNoteOut.model_validate(n)


@router.patch("/{case_id}/status")
def transition_status(case_id: str, new_status: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    current = _current_state(db, case)
    if current and new_status not in (current.allowed_transitions or []):
        raise HTTPException(
            status_code=400,
            detail=f"Transition from {case.status} to {new_status} not allowed.",
        )

    case.status = new_status
    case.last_updated = date.today().isoformat()
    db.commit()
    return {"ok": True, "status": new_status}


@router.get("/dashboard/risk", response_model=RiskDashboardOut)
def risk_dashboard(assigned_to: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Case).filter(Case.status != "closed")
    if assigned_to:
        q = q.filter(Case.assigned_to == assigned_to)
    cases = q.all()

    wf_cache: dict[str, Optional[WorkflowState]] = {}
    escalation, reminder = [], []
    today = date.today()

    for c in cases:
        if c.case_type not in wf_cache:
            wf_cache[c.case_type] = _awaiting_state(db, c.case_type)
        r = compute_risk(c, wf_cache[c.case_type], today)
        days_open = (today - date.fromisoformat(c.created_date)).days
        item = RiskItem(
            case_id=c.case_id, applicant_name=c.applicant_name,
            case_type=c.case_type, status=c.status, assigned_to=c.assigned_to,
            risk_level=r["level"], risk_reason=r["reason"],
            days_since_request=r.get("days_since_request"),
            days_open=days_open,
        )
        if r["level"] == "escalation_due":
            escalation.append(item)
        elif r["level"] == "reminder_due":
            reminder.append(item)

    aq_cases = [c for c in cases if c.case_type == "air_quality_concern"]
    aq_block = None
    if aq_cases:
        by_sev = Counter(c.severity_level or "Unknown" for c in aq_cases)
        by_school = Counter(
            (c.submission_payload or {}).get("school_name", "Unknown")
            for c in aq_cases
        )
        by_issue = Counter(
            (c.submission_payload or {}).get("issue_category", "Unknown")
            for c in aq_cases
        )
        by_officer = Counter(
            (c.submission_payload or {}).get("assigned_officer_name") or c.assigned_to or "Unassigned"
            for c in aq_cases
        )

        aq_sla_breach = 0
        escalation_case_ids = {item.case_id for item in escalation}
        for c in aq_cases:
            if c.case_id in escalation_case_ids:
                aq_sla_breach += 1
            elif c.is_urgent and c.status not in {"closed", "escalated"}:
                aq_sla_breach += 1

        high_risk = []
        for school, count in by_school.most_common():
            relevant = [c for c in aq_cases if (c.submission_payload or {}).get("school_name") == school]
            severities = Counter(c.severity_level or "Unknown" for c in relevant)
            risk_score = (
                severities.get("Critical", 0) * 4
                + severities.get("High", 0) * 2
                + severities.get("Medium", 0) * 1
            )
            if count >= 2 or severities.get("Critical", 0) or severities.get("High", 0) >= 2:
                high_risk.append({
                    "school_name": school,
                    "open_cases": count,
                    "severity_breakdown": dict(severities),
                    "risk_score": risk_score,
                })
        high_risk.sort(key=lambda x: -x["risk_score"])

        aq_block = AirQualityDashboardOut(
            total_open=len(aq_cases),
            urgent=sum(1 for c in aq_cases if c.is_urgent),
            by_severity=dict(by_sev),
            by_school=dict(by_school),
            by_issue_category=dict(by_issue),
            sla_breach=aq_sla_breach,
            workload_by_officer=dict(by_officer),
            high_risk_schools=high_risk,
        )

    return RiskDashboardOut(
        escalation_due=sorted(escalation, key=lambda x: -(x.days_since_request or 0)),
        reminder_due=sorted(reminder, key=lambda x: -(x.days_since_request or 0)),
        stats={
            "total_open": len(cases),
            "total_escalation_due": len(escalation),
            "total_reminder_due": len(reminder),
            "by_case_type": {
                ct: sum(1 for c in cases if c.case_type == ct)
                for ct in sorted({c.case_type for c in cases})
            },
        },
        air_quality=aq_block,
    )


@router.get("/policies/", response_model=list[PolicyOut])
def list_policies(case_type: Optional[str] = None, db: Session = Depends(get_db)):
    policies = db.query(Policy).all()
    if case_type:
        policies = [p for p in policies if case_type in (p.applicable_case_types or [])]
    return [PolicyOut.model_validate(p) for p in policies]


@router.get("/by-reference/{reference}", response_model=ApplicantStatusOut)
def applicant_lookup(reference: str, db: Session = Depends(get_db)):
    """Public-facing case lookup. Looks up by applicant reference OR case_id."""
    case = (
        db.query(Case)
        .filter((Case.applicant_reference == reference) | (Case.case_id == reference))
        .first()
    )
    if not case:
        raise HTTPException(status_code=404, detail="No case found for that reference.")

    current = _current_state(db, case)
    awaiting = _awaiting_state(db, case.case_type)
    risk = compute_risk(case, awaiting)

    evidence_outstanding = case.status == "awaiting_evidence"
    evidence_message = None
    if evidence_outstanding:
        if risk["level"] == "escalation_due":
            evidence_message = (
                "We have not yet received the evidence we asked for. Your case has been "
                "referred to a team leader. Please contact us urgently."
            )
        elif risk["level"] == "reminder_due":
            evidence_message = (
                "We are still waiting for evidence from you. Please send it as soon as possible."
            )
        else:
            evidence_message = "We have asked you for evidence. Please send it when you can."

    what_next = current.description if current else None

    return ApplicantStatusOut(
        case_id=case.case_id,
        case_type=case.case_type,
        status=case.status,
        status_label=current.label if current else case.status,
        status_description=current.description if current else None,
        applicant_name=case.applicant_name,
        created_date=case.created_date,
        last_updated=case.last_updated,
        timeline=[TimelineEventOut.model_validate(e) for e in case.timeline],
        evidence_outstanding=evidence_outstanding,
        evidence_message=evidence_message,
        what_happens_next=what_next,
    )


@router.get("/{case_id}/recommended-actions")
def recommended_actions(case_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return recommend(case)


@router.get("/workflow/{case_type}", response_model=list[WorkflowStateOut])
def workflow_for(case_type: str, db: Session = Depends(get_db)):
    states = db.query(WorkflowState).filter(WorkflowState.case_type == case_type).all()
    if not states:
        raise HTTPException(status_code=404, detail="Case type not found")
    return [WorkflowStateOut.model_validate(s) for s in states]
