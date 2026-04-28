# Data Specification: School Air Quality Dataset

## Overview

| Property | Value |
|---|---|
| File | `mock_school_air_quality.json` |
| Format | JSON |
| Coverage | 5 UK schools |
| Period | April 2023 – March 2026 (36 months) |
| Granularity | Monthly averages |
| Sensor style | SAMHE-compatible continuous monitoring |

All values represent **monthly averages** derived from continuous sensor monitoring. Values are synthetic but modelled on realistic SAMHE programme data, CIBSE guidance, and WHO air quality guidelines.

---

## Top-Level Structure

```json
{
  "metadata": { ... },
  "schools": [ ... ]
}
```

---

## `metadata` Object

| Field | Type | Description |
|---|---|---|
| `description` | String | Human-readable description of the dataset |
| `generated_date` | String (ISO date) | Date the dataset was generated (YYYY-MM-DD) |
| `period_from` | String (YYYY-MM) | First month of data coverage |
| `period_to` | String (YYYY-MM) | Last month of data coverage |
| `total_months` | Integer | Total number of months covered |
| `measures_description` | Object | Descriptions of each air quality measure |
| `notes` | String | General notes on data interpretation |

---

## `schools` Array

Each element in the `schools` array represents one school.

### School-Level Fields

#### Identity

| Field | Type | Required | Description |
|---|---|---|---|
| `urn` | String | Yes | Unique Reference Number — the DfE's official identifier for UK schools |
| `name` | String | Yes | Full registered name of the school |
| `samhe_monitor_id` | String | Yes | Identifier for the SAMHE-compatible monitor installed at the school. Format: `SAMHE-{LA_CODE}-{SEQ}` |

#### Address

| Field | Type | Required | Description |
|---|---|---|---|
| `address.line1` | String | Yes | First line of address |
| `address.line2` | String | No | Second line of address (e.g. area/neighbourhood) |
| `address.town` | String | Yes | Town or city |
| `address.postcode` | String | Yes | UK postcode |

#### Administrative

| Field | Type | Required | Description |
|---|---|---|---|
| `local_authority` | String | Yes | Name of the responsible local authority |
| `local_authority_code` | String | Yes | DfE local authority numeric code |
| `region` | String | Yes | ONS region name (e.g. "North West", "West Midlands") |

#### School Characteristics

| Field | Type | Allowed Values | Description |
|---|---|---|---|
| `school_type` | String | Community School, Voluntary Aided School, Academy Converter, Free School, Foundation School | DfE school type |
| `phase` | String | Primary, Secondary, All-Through, Special | Education phase |
| `ofsted_rating` | String | Outstanding, Good, Requires Improvement, Inadequate | Latest Ofsted judgement |
| `ofsted_rating_numeric` | Integer | 1, 2, 3, 4 | Numeric equivalent (1=Outstanding, 4=Inadequate) |
| `pupil_count` | Integer | — | Current number of registered pupils |

#### Building

| Field | Type | Description |
|---|---|---|
| `building_era` | String | Approximate decade or year the main building was constructed (e.g. "1960s", "2015") |
| `building_condition` | String | DfE/PSDS condition rating. Format: `{Grade} - {Label}`. See grades below. |
| `notes` | String | Free-text notes on building-specific factors affecting air quality |

**Building Condition Grades (DfE PSDS scale):**

| Grade | Label | Description |
|---|---|---|
| A | New | As new; no deterioration |
| B | Good | Performing well and operating efficiently |
| C | Satisfactory | Adequate in the short term but not performing as intended |
| D | Poor | Showing signs of serious deterioration; requires urgent attention |

---

## `air_quality_monthly` Array

Each school contains an `air_quality_monthly` array of 36 objects, one per month.

### Monthly Reading Fields

| Field | Type | Unit | Description |
|---|---|---|---|
| `month` | String (YYYY-MM) | — | Year and month of the reading |
| `co2_ppm` | Number | ppm | Mean CO₂ concentration |
| `temperature_c` | Number | °C | Mean indoor air temperature |
| `humidity_pct` | Number | % | Mean relative humidity |
| `pm2_5_ugm3` | Number | μg/m³ | Mean fine particulate matter (≤2.5μm) |
| `pm10_ugm3` | Number | μg/m³ | Mean coarse particulate matter (≤10μm) |
| `tvoc_ugm3` | Number | μg/m³ | Mean Total Volatile Organic Compounds |
| `no2_ugm3` | Number | μg/m³ | Mean nitrogen dioxide concentration |
| `air_quality_index` | Integer | 1–5 | Composite air quality index (see below) |
| `school_in_session` | Boolean | — | Whether school was in normal operation during the month |

---

## Reference Thresholds

### CO₂ (CIBSE TM21 / BB101 benchmarks)

| Range (ppm) | Rating |
|---|---|
| < 800 | Excellent |
| 800 – 1000 | Good |
| 1000 – 1500 | Moderate |
| > 1500 | Poor |

### PM2.5 (WHO Air Quality Guidelines 2021)

| Threshold (μg/m³) | Guideline |
|---|---|
| ≤ 5 | Annual mean guideline |
| ≤ 15 | 24-hour mean guideline |
| > 15 | Exceeds 24-hour guideline |

### PM10 (WHO Air Quality Guidelines 2021)

| Threshold (μg/m³) | Guideline |
|---|---|
| ≤ 15 | Annual mean guideline |
| ≤ 45 | 24-hour mean guideline |
| > 45 | Exceeds 24-hour guideline |

### NO₂ (UK Legal Limits)

| Threshold (μg/m³) | Limit |
|---|---|
| ≤ 40 | Annual mean legal limit (UK NAQS) |
| > 40 | Exceeds annual legal limit |

### Temperature (CIBSE / Building Bulletin 101)

| Range (°C) | Rating |
|---|---|
| 18 – 23 | Recommended classroom range |
| < 16 | Too cold |
| > 28 | Overheating threshold (for learning spaces) |

### Relative Humidity

| Range (%) | Rating |
|---|---|
| 40 – 60 | Optimal |
| < 30 | Too dry (respiratory irritation risk) |
| > 70 | Too humid (mould growth risk) |

---

## Composite Air Quality Index

The `air_quality_index` is a composite score combining CO₂, PM2.5, and NO₂ readings.

| Index | Label | Criteria |
|---|---|---|
| 1 | Excellent | CO₂ <800, PM2.5 <5, NO₂ <15 |
| 2 | Good | CO₂ <1000, PM2.5 <10, NO₂ <25 |
| 3 | Moderate | CO₂ <1200, PM2.5 <15, NO₂ <35 |
| 4 | Poor | CO₂ <1500, PM2.5 <20, NO₂ <45 |
| 5 | Very Poor | CO₂ ≥1500, PM2.5 ≥20, or NO₂ ≥45 |

Index is assigned based on the **worst performing** of the three primary measures.

---

## Seasonal Patterns

| Period | Expected Pattern |
|---|---|
| Jan – Feb | Peak CO₂ and PM (cold, windows closed, heating on) |
| Mar – Apr | Improving — transitional ventilation |
| May – Jun | Good — windows open, moderate occupancy |
| Jul – Aug | Low readings — `school_in_session: false`, minimal occupancy |
| Sep – Oct | Rising readings as term resumes and temperature drops |
| Nov – Dec | High readings returning toward winter peak |

---

## Schools in Dataset

| URN | School | Region | Building Era | Condition | Phase | Notable |
|---|---|---|---|---|---|---|
| 100023 | Oakfield Primary School | North West | 1960s | D - Poor | Primary | Near busy road, damp issues |
| 103451 | St Mary's CE Primary School | West Midlands | 1980s | C - Satisfactory | Primary | Partial HVAC upgrade 2019 |
| 117823 | Greenwood Academy | Yorkshire and The Humber | 2015 | A - New | Secondary | MVHR ventilation, best AQ in set |
| 126547 | Riverside Community Primary | South West | 1990s | C - Satisfactory | Primary | Winter condensation, refurb pending |
| 131209 | Northgate Secondary School | North East | 1970s | D - Poor | Secondary | Highest CO₂ — 1,240 pupils, no HVAC |

---

## Related Files

| File | Description |
|---|---|
| `mock_school_air_quality.json` | The dataset this specification describes |
| `../CASE_SPECIFICATION.md` | Specification for crowdsourced case reports |
| `../PERSONAS.md` | User personas for the platform |
