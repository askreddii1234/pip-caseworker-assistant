"""School air quality sensor dataset — loaded from mock_school_air_quality.json.

Read-only, 5 schools × 36 months, loaded once at import time. Exposes helpers
keyed off the thresholds documented in data/DATA_SPEC.md (CIBSE / WHO / UK NAQS
/ BB101). Cross-link with existing air_quality_concern cases happens at the
route layer by matching on school_name.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from statistics import mean
from typing import Dict, List, Literal, Optional


_DEFAULT_PATH = Path("/app/data/mock_school_air_quality.json")
if not _DEFAULT_PATH.exists():
    # fallback for local runs
    _DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "mock_school_air_quality.json"

_DATA_PATH = Path(os.getenv("AQ_SENSOR_DATASET", _DEFAULT_PATH))

with open(_DATA_PATH) as _f:
    _DATASET = json.load(_f)

METADATA: Dict = _DATASET["metadata"]
# urn-keyed lookup for O(1) access
SCHOOLS: Dict[str, Dict] = {s["urn"]: s for s in _DATASET["schools"]}


Rag = Literal["green", "amber", "red"]
Pollutant = Literal["co2", "pm2_5", "pm10", "no2", "tvoc", "temperature", "humidity"]


# Ordered worst→best. Each threshold is the *upper bound* of the band for
# increasing-bad measures; range measures use (min_good, max_good, min_amber, max_amber).
_INCREASING_BAD = {
    # pollutant: (green_max, amber_max, red_floor_label)
    "co2":        {"green": 1000, "amber": 1500, "unit": "ppm",    "guideline": "CIBSE TM21 / BB101"},
    "pm2_5":      {"green": 10,   "amber": 15,   "unit": "µg/m³",  "guideline": "WHO AQG 2021 (24-hr ≤15)"},
    "pm10":       {"green": 15,   "amber": 45,   "unit": "µg/m³",  "guideline": "WHO AQG 2021 (24-hr ≤45)"},
    "no2":        {"green": 25,   "amber": 40,   "unit": "µg/m³",  "guideline": "UK NAQS (annual ≤40)"},
    "tvoc":       {"green": 250,  "amber": 500,  "unit": "µg/m³",  "guideline": "Indoor air industry guidance"},
}
_RANGE_BASED = {
    "temperature": {"good": (18, 23), "amber": (16, 28), "unit": "°C", "guideline": "CIBSE / BB101 (18–23 °C)"},
    "humidity":    {"good": (40, 60), "amber": (30, 70), "unit": "%",  "guideline": "Healthy range 40–60%"},
}


def _rag_increasing(value: float, bands: Dict) -> Rag:
    if value < bands["green"]:
        return "green"
    if value < bands["amber"]:
        return "amber"
    return "red"


def _rag_range(value: float, bands: Dict) -> Rag:
    g_lo, g_hi = bands["good"]
    a_lo, a_hi = bands["amber"]
    if g_lo <= value <= g_hi:
        return "green"
    if a_lo <= value <= a_hi:
        return "amber"
    return "red"


def rag_for(pollutant: Pollutant, value: float) -> Rag:
    if pollutant in _INCREASING_BAD:
        return _rag_increasing(value, _INCREASING_BAD[pollutant])
    if pollutant in _RANGE_BASED:
        return _rag_range(value, _RANGE_BASED[pollutant])
    raise ValueError(f"Unknown pollutant {pollutant!r}")


def pct_of_threshold(pollutant: Pollutant, value: float) -> Optional[int]:
    """Normalised 0–100 where 100 = at/above the amber→red boundary.

    Returns None for range-based measures (temperature/humidity) where a single
    %-of-threshold isn't meaningful (both too-low and too-high are bad).
    """
    if pollutant in _INCREASING_BAD:
        red_floor = _INCREASING_BAD[pollutant]["amber"]
        return max(0, min(100, round(value / red_floor * 100)))
    return None


def unit_for(pollutant: Pollutant) -> str:
    if pollutant in _INCREASING_BAD:
        return _INCREASING_BAD[pollutant]["unit"]
    return _RANGE_BASED[pollutant]["unit"]


def guideline_for(pollutant: Pollutant) -> str:
    if pollutant in _INCREASING_BAD:
        return _INCREASING_BAD[pollutant]["guideline"]
    return _RANGE_BASED[pollutant]["guideline"]


# Static action library — short, parent-readable, safe to reuse across schools.
_ACTIONS: Dict[Pollutant, Dict[Rag, List[str]]] = {
    "co2": {
        "green": ["CO₂ is within recommended levels — no action needed."],
        "amber": [
            "Open windows between lessons to flush stale air.",
            "Check the ventilation schedule for occupied hours.",
        ],
        "red": [
            "Cap room occupancy until ventilation is improved.",
            "Open windows now and increase fresh-air delivery.",
            "Contact facilities — the current ventilation is below CIBSE guidance.",
        ],
    },
    "pm2_5": {
        "green": ["Particulate levels are within WHO 24-hour guidance."],
        "amber": [
            "Keep windows closed during peak traffic hours.",
            "Vacuum regularly with a HEPA filter.",
        ],
        "red": [
            "Limit outdoor activities on high-PM days.",
            "Run HEPA filtration in affected rooms.",
            "Review nearby construction or road traffic sources.",
        ],
    },
    "pm10": {
        "green": ["Coarse particulates are within guidance."],
        "amber": [
            "Check for dust from maintenance or external works.",
            "Review classroom cleaning routines.",
        ],
        "red": [
            "Isolate dust sources (maintenance, nearby works).",
            "Consider a deep clean of affected classrooms.",
        ],
    },
    "no2": {
        "green": ["NO₂ is below the UK annual legal limit."],
        "amber": [
            "Review idling vehicles near entrances at drop-off and pick-up.",
            "Check whether windows face a busy road.",
        ],
        "red": [
            "Notify the local authority air quality team.",
            "Restrict outdoor activity during peak traffic.",
            "Reposition intake vents away from the road if possible.",
        ],
    },
    "tvoc": {
        "green": ["TVOC levels are within typical indoor ranges."],
        "amber": [
            "Review recent paint, glue or cleaning product use.",
            "Ventilate after any decorating works.",
        ],
        "red": [
            "Identify and isolate the VOC source.",
            "Ventilate thoroughly; consider closing the space until levels drop.",
        ],
    },
    "temperature": {
        "green": ["Temperature is within the CIBSE recommended range."],
        "amber": [
            "Adjust heating or shading as needed.",
            "Review radiator balance and BMS schedule.",
        ],
        "red": [
            "Intervene on heating / cooling — temperature is outside safe learning range.",
            "Consider relocating pupils to a more comfortable space.",
        ],
    },
    "humidity": {
        "green": ["Humidity is in the optimal 40–60% band."],
        "amber": [
            "Review damp or drying issues — small adjustments to ventilation usually help.",
        ],
        "red": [
            "Inspect for damp, condensation or mould if humidity is high.",
            "Check for respiratory-irritation risks if humidity is very low.",
        ],
    },
}


def actions_for(pollutant: Pollutant, rag: Rag) -> List[str]:
    return list(_ACTIONS.get(pollutant, {}).get(rag, []))


_DISPLAY_NAMES: Dict[Pollutant, str] = {
    "co2": "CO₂",
    "pm2_5": "PM2.5",
    "pm10": "PM10",
    "no2": "NO₂",
    "tvoc": "TVOC",
    "temperature": "Temperature",
    "humidity": "Humidity",
}
POLLUTANT_ORDER: List[Pollutant] = ["co2", "pm2_5", "pm10", "no2", "tvoc", "temperature", "humidity"]
# Map sensor-reading JSON keys → pollutant enum values
_KEY_BY_POLLUTANT: Dict[Pollutant, str] = {
    "co2": "co2_ppm",
    "pm2_5": "pm2_5_ugm3",
    "pm10": "pm10_ugm3",
    "no2": "no2_ugm3",
    "tvoc": "tvoc_ugm3",
    "temperature": "temperature_c",
    "humidity": "humidity_pct",
}


def display_name(pollutant: Pollutant) -> str:
    return _DISPLAY_NAMES[pollutant]


def _building_condition_grade(school: Dict) -> str:
    """Return just the letter — 'A - New' → 'A'."""
    cond = school.get("building_condition", "")
    return cond.split(" ")[0] if cond else ""


def certainty_for(school: Dict, reading: Dict) -> Literal["High", "Medium", "Low"]:
    """High when building is new/good AND school is in session; drop by tier for older buildings."""
    grade = _building_condition_grade(school)
    in_session = bool(reading.get("school_in_session", True))
    if grade in {"A", "B"}:
        return "High" if in_session else "Medium"
    if grade == "C":
        return "Medium"
    return "Low"


def sources_for(school: Dict, pollutant: Pollutant) -> List[str]:
    monitor = school.get("samhe_monitor_id", "SAMHE monitor")
    return [
        f"Indoor sensor reading ({monitor})",
        f"Guideline: {guideline_for(pollutant)}",
    ]


def _mean_of_key(readings: List[Dict], key: str) -> Optional[float]:
    vals = [r[key] for r in readings if key in r and r[key] is not None]
    return mean(vals) if vals else None


def trend_for(series: List[Dict], pollutant: Pollutant,
              window: int = 3, threshold: float = 0.05) -> Literal["up", "down", "flat"]:
    """Compare mean of last `window` months vs the `window` before that."""
    key = _KEY_BY_POLLUTANT[pollutant]
    if len(series) < window * 2:
        return "flat"
    recent = _mean_of_key(series[-window:], key)
    prior = _mean_of_key(series[-window * 2:-window], key)
    if recent is None or prior is None or prior == 0:
        return "flat"
    delta = (recent - prior) / prior
    if delta > threshold:
        return "up"
    if delta < -threshold:
        return "down"
    return "flat"


def slice_series(school: Dict, timeframe: str) -> List[Dict]:
    """Slice the 36-month series by a timeframe label.

    today → latest month only (as a 1-element series).
    3m, 6m, 1y → trailing N months.
    5y → full series (dataset is 3y, so this is equivalent).
    """
    series = school["air_quality_monthly"]
    if timeframe == "today":
        return series[-1:]
    n = {"3m": 3, "6m": 6, "1y": 12, "5y": len(series)}.get(timeframe, 1)
    return series[-n:] if n else series


def _latest_reading(school: Dict) -> Dict:
    return school["air_quality_monthly"][-1]


def summarise_school(school: Dict) -> Dict:
    latest = _latest_reading(school)
    counts = {"green": 0, "amber": 0, "red": 0}
    for pollutant in POLLUTANT_ORDER:
        key = _KEY_BY_POLLUTANT[pollutant]
        counts[rag_for(pollutant, latest[key])] += 1
    return {
        "urn": school["urn"],
        "name": school["name"],
        "town": school.get("address", {}).get("town"),
        "region": school.get("region"),
        "phase": school.get("phase"),
        "pupil_count": school.get("pupil_count"),
        "latest_month": latest["month"],
        "latest_aqi": latest["air_quality_index"],
        "rag_counts": counts,
        "worst_rag": "red" if counts["red"] else "amber" if counts["amber"] else "green",
    }


def detail_school(urn: str, timeframe: str = "today") -> Optional[Dict]:
    school = SCHOOLS.get(urn)
    if not school:
        return None

    series = school["air_quality_monthly"]
    window_series = slice_series(school, timeframe)
    # For the headline reading we average across the chosen window so the
    # pollutant table reflects the timeframe the user picked.
    reading = {
        "month": f"{window_series[0]['month']} — {window_series[-1]['month']}"
        if len(window_series) > 1 else window_series[0]["month"],
    }
    for pollutant in POLLUTANT_ORDER:
        key = _KEY_BY_POLLUTANT[pollutant]
        vals = [r[key] for r in window_series if key in r]
        reading[key] = round(mean(vals), 1) if vals else None
    # composite AQI: pick the worst (highest) across the window
    reading["air_quality_index"] = max(r["air_quality_index"] for r in window_series)
    reading["school_in_session"] = any(r.get("school_in_session") for r in window_series)

    pollutants = []
    for p in POLLUTANT_ORDER:
        key = _KEY_BY_POLLUTANT[p]
        value = reading[key]
        pollutants.append({
            "pollutant": p,
            "display_name": display_name(p),
            "value": value,
            "unit": unit_for(p),
            "rag": rag_for(p, value),
            "pct_of_threshold": pct_of_threshold(p, value),
            "certainty": certainty_for(school, window_series[-1]),
            "trend": trend_for(series, p),
            "actions": actions_for(p, rag_for(p, value)),
            "sources": sources_for(school, p),
            "guideline": guideline_for(p),
        })

    return {
        "urn": school["urn"],
        "name": school["name"],
        "address": school.get("address"),
        "local_authority": school.get("local_authority"),
        "region": school.get("region"),
        "school_type": school.get("school_type"),
        "phase": school.get("phase"),
        "ofsted_rating": school.get("ofsted_rating"),
        "building_era": school.get("building_era"),
        "building_condition": school.get("building_condition"),
        "pupil_count": school.get("pupil_count"),
        "samhe_monitor_id": school.get("samhe_monitor_id"),
        "notes": school.get("notes"),
        "timeframe": timeframe,
        "latest_reading": reading,
        "pollutants": pollutants,
        "series": series,  # full 36 months for charting later if needed
    }


def all_summaries() -> List[Dict]:
    return [summarise_school(s) for s in SCHOOLS.values()]
