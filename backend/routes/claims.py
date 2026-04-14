from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from models import get_db, PIPClaim, AssessmentNote, Evidence, ActivityScore
from schemas import ClaimOut, ClaimListOut, ClaimDetailOut, NoteOut, NoteCreate, EvidenceOut, ActivityScoreOut

router = APIRouter(prefix="/claims", tags=["claims"])


@router.get("/", response_model=ClaimListOut)
def list_claims(
    status: Optional[str] = None,
    claim_type: Optional[str] = None,
    risk_level: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    query = db.query(PIPClaim)
    if status:
        query = query.filter(PIPClaim.status == status)
    if claim_type:
        query = query.filter(PIPClaim.claim_type == claim_type)
    if risk_level:
        query = query.filter(PIPClaim.risk_level == risk_level)
    if assigned_to:
        query = query.filter(PIPClaim.assigned_to == assigned_to)
    if search:
        query = query.filter(PIPClaim.claimant_name.ilike(f"%{search}%"))

    total = query.count()
    claims = query.order_by(PIPClaim.updated_at.desc()).offset(skip).limit(limit).all()
    return ClaimListOut(claims=[ClaimOut.model_validate(c) for c in claims], total=total)


@router.get("/{claim_id}", response_model=ClaimDetailOut)
def get_claim(claim_id: str, db: Session = Depends(get_db)):
    claim = db.query(PIPClaim).filter(PIPClaim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    notes = db.query(AssessmentNote).filter(AssessmentNote.claim_id == claim_id).order_by(AssessmentNote.created_at).all()
    evidence = db.query(Evidence).filter(Evidence.claim_id == claim_id).all()
    scores = db.query(ActivityScore).filter(ActivityScore.claim_id == claim_id).all()

    return ClaimDetailOut(
        claim=ClaimOut.model_validate(claim),
        notes=[NoteOut.model_validate(n) for n in notes],
        evidence=[EvidenceOut.model_validate(e) for e in evidence],
        activity_scores=[ActivityScoreOut.model_validate(s) for s in scores],
    )


@router.post("/{claim_id}/notes", response_model=NoteOut)
def add_note(claim_id: str, note: NoteCreate, db: Session = Depends(get_db)):
    claim = db.query(PIPClaim).filter(PIPClaim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    new_note = AssessmentNote(claim_id=claim_id, author="caseworker", content=note.content)
    db.add(new_note)
    claim.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(new_note)
    return NoteOut.model_validate(new_note)


@router.patch("/{claim_id}/status")
def update_status(claim_id: str, status: str, db: Session = Depends(get_db)):
    claim = db.query(PIPClaim).filter(PIPClaim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    claim.status = status
    claim.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": status}


@router.patch("/{claim_id}/scores/{score_id}/confirm")
def confirm_score(claim_id: str, score_id: int, points: int, db: Session = Depends(get_db)):
    score = db.query(ActivityScore).filter(ActivityScore.id == score_id, ActivityScore.claim_id == claim_id).first()
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    score.points = points
    score.confirmed_by_caseworker = True
    db.commit()
    return {"ok": True, "points": points}
