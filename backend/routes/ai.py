from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime

from models import get_db, PIPClaim, AssessmentNote, Evidence, ActivityScore, PIPDescriptor
from schemas import AISummaryOut, AIGapAnalysis, AIAskRequest, RiskDashboardOut, RiskItem
from ai_pipeline import summarise_claim, detect_gaps, ask_about_claim_stream

router = APIRouter(prefix="/ai", tags=["ai"])


def _get_claim_data(claim_id: str, db: Session):
    claim = db.query(PIPClaim).filter(PIPClaim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    notes = db.query(AssessmentNote).filter(AssessmentNote.claim_id == claim_id).order_by(AssessmentNote.created_at).all()
    evidence = db.query(Evidence).filter(Evidence.claim_id == claim_id).all()
    scores = db.query(ActivityScore).filter(ActivityScore.claim_id == claim_id).all()
    descriptors = db.query(PIPDescriptor).all()
    return claim, notes, evidence, scores, descriptors


@router.post("/claims/{claim_id}/summarise", response_model=AISummaryOut)
def ai_summarise(claim_id: str, db: Session = Depends(get_db)):
    claim, notes, evidence, scores, descriptors = _get_claim_data(claim_id, db)
    result = summarise_claim(claim, notes, evidence, scores, descriptors)
    claim.ai_summary = result.get("summary", "")
    claim.risk_level = result.get("risk_level", "medium")
    claim.daily_living_score = result.get("daily_living_score", 0)
    claim.mobility_score = result.get("mobility_score", 0)
    claim.updated_at = datetime.utcnow()
    db.commit()
    return AISummaryOut(**result)


@router.post("/claims/{claim_id}/gaps", response_model=AIGapAnalysis)
def ai_gaps(claim_id: str, db: Session = Depends(get_db)):
    claim, notes, evidence, scores, descriptors = _get_claim_data(claim_id, db)
    result = detect_gaps(claim, notes, evidence, scores, descriptors)
    return AIGapAnalysis(**result)


@router.get("/claims/{claim_id}/ask/stream")
async def ai_ask_stream(claim_id: str, question: str, db: Session = Depends(get_db)):
    claim, notes, evidence, scores, descriptors = _get_claim_data(claim_id, db)

    async def event_generator():
        async for chunk in ask_about_claim_stream(claim, notes, evidence, scores, descriptors, question):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/dashboard/risk", response_model=RiskDashboardOut)
def risk_dashboard(assigned_to: str = None, db: Session = Depends(get_db)):
    query = db.query(PIPClaim).filter(PIPClaim.status.notin_(["approved", "rejected"]))
    if assigned_to:
        query = query.filter(PIPClaim.assigned_to == assigned_to)
    claims = query.all()

    high_risk, medium_risk = [], []
    total_open = len(claims)
    total_high = 0
    total_breaching_sla = 0

    for claim in claims:
        missing_count = db.query(Evidence).filter(Evidence.claim_id == claim.id, Evidence.received == False).count()
        days_open = (datetime.utcnow() - claim.created_at).days
        days_to_sla = 75 - days_open

        if days_to_sla <= 0:
            total_breaching_sla += 1

        item = RiskItem(
            claim_id=claim.id, claimant_name=claim.claimant_name, claim_type=claim.claim_type,
            risk_level=claim.risk_level, status=claim.status, days_open=days_open,
            days_to_sla=days_to_sla, missing_evidence_count=missing_count, assigned_to=claim.assigned_to,
        )
        if claim.risk_level == "high":
            high_risk.append(item)
            total_high += 1
        elif claim.risk_level == "medium":
            medium_risk.append(item)

    return RiskDashboardOut(
        high_risk=sorted(high_risk, key=lambda x: x.days_to_sla),
        medium_risk=sorted(medium_risk, key=lambda x: x.days_to_sla),
        stats={
            "total_open": total_open, "total_high_risk": total_high,
            "total_breaching_sla": total_breaching_sla,
            "avg_days_open": round(sum((datetime.utcnow() - c.created_at).days for c in claims) / max(len(claims), 1)),
        },
    )
