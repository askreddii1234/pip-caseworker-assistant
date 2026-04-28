from datetime import date
from typing import Optional

from models import Case, WorkflowState


def _parse(d: str) -> date:
    return date.fromisoformat(d)


def _last_evidence_request(case: Case) -> Optional[date]:
    latest = None
    for ev in case.timeline:
        if ev.event == "evidence_requested":
            d = _parse(ev.date)
            if latest is None or d > latest:
                latest = d
    return latest


def compute_risk(case: Case, awaiting_state: Optional[WorkflowState], today: Optional[date] = None) -> dict:
    """Return a RiskFlag-shaped dict based on evidence-outstanding thresholds.

    Only cases in `awaiting_evidence` can trigger reminder/escalation — other states
    are considered ok by this check.
    """
    today = today or date.today()

    if case.status != "awaiting_evidence":
        return {"level": "ok", "reason": f"Case is {case.status.replace('_', ' ')}."}

    req = _last_evidence_request(case)
    if req is None:
        return {"level": "ok", "reason": "No evidence request recorded."}

    days = (today - req).days
    reminder = awaiting_state.reminder_days if awaiting_state else None
    escalation = awaiting_state.escalation_days if awaiting_state else None

    if escalation is not None and days >= escalation:
        level = "escalation_due"
        reason = f"Evidence outstanding {days} days — past {escalation}-day escalation threshold."
    elif reminder is not None and days >= reminder:
        level = "reminder_due"
        reason = f"Evidence outstanding {days} days — past {reminder}-day reminder threshold."
    else:
        level = "ok"
        reason = f"Evidence outstanding {days} days — within thresholds."

    return {
        "level": level,
        "reason": reason,
        "days_since_request": days,
        "reminder_days": reminder,
        "escalation_days": escalation,
    }
