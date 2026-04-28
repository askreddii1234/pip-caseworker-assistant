"""Rules-based recommended actions for air_quality_concern cases.

Deterministic — keyed off issue_category + severity_level. Lives next to
ai_pipeline.py; consumed by a thin route on cases.py. No model calls.
"""
from typing import Dict, List, Optional

from models import Case


CRITICAL_ACTIONS: List[str] = [
    "Contact the submitter by telephone today (email alone is not acceptable)",
    "Close the affected area until a qualified assessor has attended site",
    "Escalate to team leader the same working day (POL-AQ-004)",
    "Issue a holding update to school leadership within 2 hours",
]

BY_CATEGORY_HIGH: Dict[str, List[str]] = {
    "Mold/Moisture": [
        "Request a facilities inspection within 5 working days (POL-AQ-002)",
        "Take moisture readings on the affected wall and photograph the area",
        "Confirm whether any pupils with asthma are seated in the affected space",
        "Consider temporary relocation for vulnerable pupils pending remediation",
    ],
    "Chemical Smell": [
        "Arrange same-day site attendance to identify the source",
        "Keep the affected space closed to pupils and staff until the all-clear",
        "Review whether the submitter is still experiencing symptoms",
    ],
    "Poor Ventilation": [
        "Deploy a calibrated CO2 monitor during occupied hours for 48 hours",
        "Discuss short-term mitigation (reduced capacity, windows open, scheduling)",
        "Brief facilities on likely causes before recommending capital works",
    ],
    "Dust/Particles": [
        "Inspect within 3 working days of the maintenance works",
        "Review the contractor's method statement and isolation arrangements",
        "Arrange a deep clean if any residue is still present",
    ],
    "Temperature Issues": [
        "Install a temperature logger for at least 48 hours",
        "Check the BMS schedule and radiator balance before planning remediation",
    ],
    "Odor": [
        "Inspect within 7 working days",
        "Check drainage traps and kitchen ventilation",
    ],
}

BY_CATEGORY_MEDIUM: Dict[str, List[str]] = {
    "Mold/Moisture": [
        "Inspection within 5 working days; take moisture readings",
        "Provide the submitter with a written update each week",
    ],
    "Chemical Smell": [
        "Same-day investigation of the source",
        "Confirm whether the product used is on the approved cleaning list",
    ],
    "Poor Ventilation": [
        "CO2 assessment within 5 working days",
        "Discuss short-term mitigation with facilities",
    ],
    "Dust/Particles": [
        "Inspect within 3 working days of the works",
        "Arrange a deep clean where residue is found",
    ],
    "Temperature Issues": [
        "Temperature logger for 48 hours",
        "Review BMS schedule and radiator performance",
    ],
    "Odor": [
        "Inspection within 7 working days",
        "Check drainage and waste handling",
    ],
}

LOW_ACTIONS: List[str] = [
    "Log for monitoring; inspection within 7 working days",
    "Send submitter an acknowledgement and plain-English progress update",
]


def _coerce(value: Optional[str]) -> Optional[str]:
    return value.strip() if isinstance(value, str) and value.strip() else None


def recommend(case: Case) -> dict:
    if case.case_type != "air_quality_concern":
        return {
            "applicable": False,
            "actions": [],
            "rationale": "Recommended actions are only generated for air quality cases.",
        }

    payload = case.submission_payload or {}
    category = _coerce(payload.get("issue_category")) or "Other"
    severity = _coerce(case.severity_level) or _coerce(payload.get("severity_level")) or "Low"

    if severity == "Critical":
        actions = list(CRITICAL_ACTIONS)
        if category in BY_CATEGORY_HIGH:
            actions.extend(BY_CATEGORY_HIGH[category][:2])
        rationale = (
            "Critical severity triggers same-day escalation and telephone contact "
            "per POL-AQ-004, then category-specific containment steps."
        )
    elif severity == "High":
        actions = list(BY_CATEGORY_HIGH.get(category, [
            "Schedule inspection within 3 working days",
            "Contact the submitter with a progress update",
            "Prepare a team-leader briefing note in case of escalation",
        ]))
        rationale = f"High severity with category {category!r} — actions driven by POL-AQ-002."
    elif severity == "Medium":
        actions = list(BY_CATEGORY_MEDIUM.get(category, [
            "Inspection within 5 working days",
            "Update the submitter at least weekly while the case is open",
        ]))
        rationale = f"Medium severity with category {category!r}."
    else:
        actions = list(LOW_ACTIONS)
        rationale = "Low severity — monitor and proceed to inspection on standard timescale."

    affected = payload.get("affected_count") or 0
    if isinstance(affected, (int, float)) and affected >= 5 and category in {"Mold/Moisture", "Chemical Smell"}:
        actions.append(
            f"Review whether severity should be upgraded — {int(affected)} affected, "
            f"category {category} (POL-AQ-001)."
        )

    if case.is_urgent and severity != "Critical":
        actions.append(
            "Submitter flagged the case urgent — confirm triage severity with team leader."
        )

    return {
        "applicable": True,
        "severity_level": severity,
        "issue_category": category,
        "actions": actions,
        "rationale": rationale,
    }
