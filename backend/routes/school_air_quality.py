"""Routes for the schools-air-quality (parent-facing) dashboard.

Composes the in-memory sensor dataset with the DB-backed air_quality_concern
cases by matching on `submission_payload.school_name`.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from models import get_db, Case
import school_air_quality as saq

router = APIRouter(prefix="/air-quality", tags=["air-quality"])


def _matched_cases_for(db: Session, school_name: str) -> List[Case]:
    """Return air_quality_concern cases whose submission_payload.school_name
    matches (case-insensitive)."""
    aq_cases = db.query(Case).filter(Case.case_type == "air_quality_concern").all()
    needle = school_name.strip().casefold()
    return [
        c for c in aq_cases
        if (c.submission_payload or {}).get("school_name", "").strip().casefold() == needle
    ]


def _report_row(case: Case) -> dict:
    payload = case.submission_payload or {}
    return {
        "case_id": case.case_id,
        "date": case.created_date,
        "issue": payload.get("detailed_description") or case.case_notes or "",
        "type": payload.get("issue_category") or "Other",
        "severity": case.severity_level,
        "is_urgent": bool(case.is_urgent),
        "status": case.status,
        "reviewed": case.status not in {"case_created"},
    }


def _reports_summary(rows: List[dict]) -> dict:
    types = [
        "Odor", "Dust/Particles", "Mold/Moisture", "Chemical Smell",
        "Poor Ventilation", "Temperature Issues", "Other",
    ]
    counts = {t: 0 for t in types}
    for r in rows:
        counts[r["type"] if r["type"] in counts else "Other"] += 1
    last = max((r["date"] for r in rows), default=None)
    return {"total": len(rows), "last_reported": last, "counts": counts}


@router.get("/schools")
def list_schools(db: Session = Depends(get_db)):
    summaries = saq.all_summaries()
    # attach open AQ case counts per school
    for s in summaries:
        matched = _matched_cases_for(db, s["name"])
        s["open_cases"] = sum(1 for c in matched if c.status != "closed")
        s["total_cases"] = len(matched)
    return {"schools": summaries}


@router.get("/schools/{urn}")
def school_detail(
    urn: str,
    timeframe: str = Query("today", pattern="^(today|3m|6m|1y|5y)$"),
    db: Session = Depends(get_db),
):
    detail = saq.detail_school(urn, timeframe)
    if detail is None:
        raise HTTPException(status_code=404, detail="School not found")

    matched = _matched_cases_for(db, detail["name"])
    rows = [_report_row(c) for c in matched]
    rows.sort(key=lambda r: r["date"], reverse=True)
    detail["parent_reports"] = rows
    detail["parent_reports_summary"] = _reports_summary(rows)
    return detail
