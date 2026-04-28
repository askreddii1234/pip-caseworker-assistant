"""Tests for the schools-air-quality module + routes."""
import pytest

import school_air_quality as saq


# ---- RAG helper ---------------------------------------------------------

def test_rag_co2_bands():
    assert saq.rag_for("co2", 750) == "green"
    assert saq.rag_for("co2", 1200) == "amber"
    assert saq.rag_for("co2", 1600) == "red"


def test_rag_pm25_bands():
    assert saq.rag_for("pm2_5", 4) == "green"
    assert saq.rag_for("pm2_5", 12) == "amber"
    assert saq.rag_for("pm2_5", 20) == "red"


def test_rag_no2_at_legal_limit():
    # UK NAQS annual limit is 40 µg/m³; at/above 40 is red
    assert saq.rag_for("no2", 39) == "amber"
    assert saq.rag_for("no2", 40) == "red"


def test_rag_temperature_is_range_based():
    assert saq.rag_for("temperature", 21) == "green"
    assert saq.rag_for("temperature", 17) == "amber"
    assert saq.rag_for("temperature", 14) == "red"
    assert saq.rag_for("temperature", 30) == "red"


def test_rag_humidity_range():
    assert saq.rag_for("humidity", 50) == "green"
    assert saq.rag_for("humidity", 35) == "amber"
    assert saq.rag_for("humidity", 25) == "red"
    assert saq.rag_for("humidity", 80) == "red"


# ---- pct-of-threshold ---------------------------------------------------

def test_pct_of_threshold_caps_at_100():
    # 3000ppm CO2 far past the 1500 amber→red boundary → 100
    assert saq.pct_of_threshold("co2", 3000) == 100


def test_pct_of_threshold_at_half():
    # NO2 red floor = 40; 20 → 50%
    assert saq.pct_of_threshold("no2", 20) == 50


def test_pct_of_threshold_range_measures_return_none():
    assert saq.pct_of_threshold("temperature", 21) is None
    assert saq.pct_of_threshold("humidity", 50) is None


# ---- certainty ----------------------------------------------------------

def test_certainty_new_building_in_session_is_high():
    school = {"building_condition": "A - New"}
    reading = {"school_in_session": True}
    assert saq.certainty_for(school, reading) == "High"


def test_certainty_new_building_out_of_session_is_medium():
    school = {"building_condition": "A - New"}
    reading = {"school_in_session": False}
    assert saq.certainty_for(school, reading) == "Medium"


def test_certainty_poor_building_is_low():
    school = {"building_condition": "D - Poor"}
    reading = {"school_in_session": True}
    assert saq.certainty_for(school, reading) == "Low"


# ---- trend --------------------------------------------------------------

def test_trend_detects_rising_co2():
    series = [
        {"co2_ppm": 800, "pm2_5_ugm3": 0, "pm10_ugm3": 0, "no2_ugm3": 0,
         "tvoc_ugm3": 0, "temperature_c": 0, "humidity_pct": 0},
    ] * 3 + [
        {"co2_ppm": 1200, "pm2_5_ugm3": 0, "pm10_ugm3": 0, "no2_ugm3": 0,
         "tvoc_ugm3": 0, "temperature_c": 0, "humidity_pct": 0},
    ] * 3
    assert saq.trend_for(series, "co2") == "up"


def test_trend_flat_for_short_series():
    series = [{"co2_ppm": 1000}] * 2
    assert saq.trend_for(series, "co2") == "flat"


# ---- end-to-end module ---------------------------------------------------

def test_five_schools_loaded():
    assert len(saq.SCHOOLS) == 5
    assert "100023" in saq.SCHOOLS  # Oakfield
    assert "131209" in saq.SCHOOLS  # Northgate


def test_summarise_school_includes_rag_counts():
    oakfield = saq.SCHOOLS["100023"]
    s = saq.summarise_school(oakfield)
    assert s["name"] == "Oakfield Primary School"
    assert sum(s["rag_counts"].values()) == 7  # one entry per pollutant
    assert s["worst_rag"] in {"green", "amber", "red"}


def test_detail_school_has_seven_pollutants():
    d = saq.detail_school("100023", "today")
    assert len(d["pollutants"]) == 7
    names = {p["pollutant"] for p in d["pollutants"]}
    assert names == {"co2", "pm2_5", "pm10", "no2", "tvoc", "temperature", "humidity"}


def test_detail_school_timeframes_slice_series():
    d3 = saq.detail_school("100023", "3m")
    d1 = saq.detail_school("100023", "today")
    # 3-month window should contain a range (latest minus 2 months → latest)
    assert "—" in d3["latest_reading"]["month"]
    assert "—" not in d1["latest_reading"]["month"]


def test_detail_school_unknown_urn_returns_none():
    assert saq.detail_school("000000", "today") is None


# ---- route integration --------------------------------------------------

def _seed_aq_case(db, school_name, urgent=False, severity="Medium", case_id="CASE-TEST-1"):
    import models
    db.add(models.Case(
        case_id=case_id, case_type="air_quality_concern",
        status="case_created", applicant_name="Test Parent",
        applicant_reference=f"AQ-{case_id}",
        created_date="2026-04-10", last_updated="2026-04-10",
        case_notes="Test issue reported.",
        severity_level=severity, is_urgent=urgent,
        submission_payload={
            "school_name": school_name, "issue_category": "Mold/Moisture",
            "detailed_description": "Visible mould in classroom.",
        },
    ))
    db.commit()


def test_list_schools_includes_open_case_counts(client, db):
    _seed_aq_case(db, school_name="Oakfield Primary School")
    r = client.get("/air-quality/schools")
    assert r.status_code == 200
    body = r.json()
    assert len(body["schools"]) == 5
    oakfield = next(s for s in body["schools"] if s["urn"] == "100023")
    assert oakfield["open_cases"] == 1
    assert oakfield["total_cases"] == 1


def test_school_detail_cross_links_matching_cases(client, db):
    _seed_aq_case(db, school_name="Northgate Secondary School",
                  severity="Critical", urgent=True, case_id="CASE-NGT-1")
    _seed_aq_case(db, school_name="Northgate Secondary School",
                  severity="High", case_id="CASE-NGT-2")
    _seed_aq_case(db, school_name="Oakfield Primary School",
                  severity="Low", case_id="CASE-OAK-1")

    r = client.get("/air-quality/schools/131209")  # Northgate
    assert r.status_code == 200
    detail = r.json()
    assert detail["name"] == "Northgate Secondary School"
    assert len(detail["parent_reports"]) == 2
    assert {row["case_id"] for row in detail["parent_reports"]} == {"CASE-NGT-1", "CASE-NGT-2"}
    assert detail["parent_reports_summary"]["total"] == 2
    assert detail["parent_reports_summary"]["counts"]["Mold/Moisture"] == 2


def test_school_detail_no_matches_returns_empty_list(client, db):
    # No cases seeded → Greenwood should have zero reports
    r = client.get("/air-quality/schools/117823")  # Greenwood
    assert r.status_code == 200
    detail = r.json()
    assert detail["parent_reports"] == []
    assert detail["parent_reports_summary"]["total"] == 0


def test_school_detail_unknown_urn_returns_404(client):
    r = client.get("/air-quality/schools/000000")
    assert r.status_code == 404


def test_timeframe_query_param_rejects_unknown(client):
    r = client.get("/air-quality/schools/100023?timeframe=bogus")
    assert r.status_code == 422
