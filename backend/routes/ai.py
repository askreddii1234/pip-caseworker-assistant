from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from models import get_db, Case, Policy, WorkflowState
from schemas import AISummaryOut, KbChunkOut
from ai_pipeline import summarise_case, ask_about_case_stream
from risk import compute_risk
import rag

router = APIRouter(prefix="/ai", tags=["ai"])


def _load(case_id: str, db: Session):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    current = db.query(WorkflowState).filter(
        WorkflowState.case_type == case.case_type,
        WorkflowState.state == case.status,
    ).first()
    awaiting = db.query(WorkflowState).filter(
        WorkflowState.case_type == case.case_type,
        WorkflowState.state == "awaiting_evidence",
    ).first()
    policies = [
        p for p in db.query(Policy).all()
        if case.case_type in (p.applicable_case_types or [])
    ]
    risk = compute_risk(case, awaiting)
    return case, case.timeline, case.caseworker_notes, current, policies, risk


def _summary_query(case) -> str:
    """Build a retrieval query for the summarise endpoint from case context."""
    parts = [case.case_type.replace("_", " ")]
    p = case.submission_payload or {}
    for key in ("issue_category", "school_name", "severity_level"):
        v = p.get(key) if isinstance(p, dict) else None
        if v:
            parts.append(str(v))
    if case.case_notes:
        parts.append(case.case_notes[:200])
    return " ".join(parts)


@router.post("/cases/{case_id}/summarise", response_model=AISummaryOut)
def ai_summarise(case_id: str, db: Session = Depends(get_db)):
    case, timeline, notes, current, policies, risk = _load(case_id, db)
    chunks = rag.retrieve(_summary_query(case), top_k=5, case_type=case.case_type)
    result = summarise_case(case, timeline, notes, current, policies, risk, kb_chunks=chunks)
    case.ai_summary = result.get("summary", "")
    db.commit()
    result["sources"] = [KbChunkOut(**rag.chunk_to_dict(c)) for c in chunks]
    return AISummaryOut(**result)


@router.get("/cases/{case_id}/ask/stream")
async def ai_ask_stream(case_id: str, question: str, db: Session = Depends(get_db)):
    case, timeline, notes, current, policies, risk = _load(case_id, db)
    chunks = rag.retrieve(question, top_k=5, case_type=case.case_type)

    async def event_gen():
        # Emit retrieved sources up front so the UI can render the citations panel
        # before/while the answer streams in.
        if chunks:
            import json
            payload = json.dumps([rag.chunk_to_dict(c) for c in chunks])
            yield f"event: sources\ndata: {payload}\n\n"
        async for chunk in ask_about_case_stream(
            case, timeline, notes, current, policies, risk, question, kb_chunks=chunks
        ):
            # Preserve newlines by escaping; client unescapes.
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
