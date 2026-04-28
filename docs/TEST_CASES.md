# Test Cases — Caseworker Assistant

A catalogue of test cases covering the features we built. Use this for demo rehearsal, regression passes, and as a traceability matrix against [`PRD.md`](./PRD.md).

**Conventions**
- **ID**: `TC-<area>-<nnn>`
- **Type**: `Unit` (pytest), `API` (pytest + TestClient), `E2E` (manual browser), `Data` (JSON fixture)
- **Priority**: `P0` demo-blocker · `P1` important · `P2` nice-to-have
- **Status**: `Pass` · `Fail` · `Blocked` · `Not run`

Automated tests live under `backend/tests/`. Run with `pytest` from `backend/`.

---

## Coverage summary

| Area | Cases | Automated | Manual |
|---|---|---|---|
| 1. Risk calculation | 8 | 8 | 0 |
| 2. Workflow engine | 5 | 3 | 2 |
| 3. Case management API | 7 | 7 | 0 |
| 4. Case detail UI | 5 | 0 | 5 |
| 5. AI summarise + Q&A | 6 | 4 | 2 |
| 6. Air quality intake | 6 | 4 | 2 |
| 7. Recommendations engine | 7 | 7 | 0 |
| 8. School sensor dashboard | 6 | 3 | 3 |
| 9. Team leader dashboard | 4 | 2 | 2 |
| 10. Applicant portal | 3 | 2 | 1 |
| 11. Cross-cutting / smoke | 5 | 3 | 2 |
| **Total** | **62** | **43** | **19** |

---

## 1. Risk calculation (`backend/risk.py`)

Traces: PRD FR-3. Source: `backend/tests/test_risk.py`.

| ID | Title | Type | Priority | Preconditions | Steps | Expected |
|---|---|---|---|---|---|---|
| TC-RISK-001 | Case not in `awaiting_evidence` returns `ok` | Unit | P0 | Case with status `under_review` | Call `compute_risk(case, None)` | `level == "ok"`, reason mentions current status |
| TC-RISK-002 | `awaiting_evidence` with no `evidence_requested` event returns `ok` | Unit | P0 | Case in `awaiting_evidence`, no such timeline event | Call `compute_risk` | `level == "ok"`, reason "No evidence request recorded" |
| TC-RISK-003 | Within reminder threshold returns `ok` | Unit | P0 | Evidence requested 5 days ago, reminder=28, escalation=56 | Call with `today` | `level == "ok"`, `days_since_request == 5` |
| TC-RISK-004 | Past reminder, before escalation returns `reminder_due` | Unit | P0 | Evidence 30 days ago, reminder=28, escalation=56 | Call | `level == "reminder_due"`, days=30 |
| TC-RISK-005 | At escalation threshold returns `escalation_due` | Unit | P0 | Evidence 56 days ago, escalation=56 | Call | `level == "escalation_due"` |
| TC-RISK-006 | Beyond escalation threshold returns `escalation_due` | Unit | P0 | Evidence 90 days ago | Call | `level == "escalation_due"`, reason cites day count |
| TC-RISK-007 | Multiple `evidence_requested` events use most recent | Unit | P1 | Two events, 60 and 10 days ago | Call | `days_since_request == 10` |
| TC-RISK-008 | Missing workflow thresholds returns `ok` | Unit | P1 | Awaiting state is `None` | Call | `level == "ok"` (never crashes) |

---

## 2. Workflow engine

Traces: PRD FR-2. Source: `data/workflow-states.json`, `backend/seed_data.py`.

| ID | Title | Type | Priority | Preconditions | Steps | Expected |
|---|---|---|---|---|---|---|
| TC-WF-001 | All four case types present after seed | Unit | P0 | Fresh DB | Seed, query `workflow_states` | Rows for `benefit_review`, `licence_application`, `compliance_check`, `air_quality_concern` |
| TC-WF-002 | Each case type has an `awaiting_evidence` state with thresholds | Unit | P0 | Seeded DB | Query states | Each has `reminder_days` + `escalation_days` set |
| TC-WF-003 | Air quality thresholds are 3 / 7 days | Unit | P0 | Seeded DB | Query `air_quality_concern.awaiting_evidence` | `reminder_days == 3`, `escalation_days == 7` |
| TC-WF-004 | Case detail shows current state's required action | E2E | P0 | Open `CASE-2026-00042` | Navigate to detail view | Required action from workflow JSON renders visibly |
| TC-WF-005 | Allowed transitions match JSON | E2E | P1 | Open case in `awaiting_evidence` | Inspect workflow panel | Only legal next states are listed |

---

## 3. Case management API (`backend/routes/cases.py`)

Traces: PRD FR-1. Source: `backend/tests/test_cases_routes.py`.

| ID | Title | Type | Priority | Steps | Expected |
|---|---|---|---|---|---|
| TC-CASE-001 | `GET /cases` returns all seeded cases | API | P0 | Call endpoint | 200, list length matches seed count |
| TC-CASE-002 | `GET /cases` supports `case_type` filter | API | P1 | Call with `?case_type=air_quality_concern` | All returned cases have matching type |
| TC-CASE-003 | `GET /cases` supports `team` filter | API | P1 | Call with `?team=team_b` | All cases assigned to `team_b` |
| TC-CASE-004 | `GET /cases/{id}` returns workflow + policy + risk | API | P0 | Call for `CASE-2026-00042` | Response includes `workflow`, `policies`, `risk_flag` |
| TC-CASE-005 | `GET /cases/{id}` returns 404 for unknown ID | API | P0 | Call with bogus ID | 404 with clear error message |
| TC-CASE-006 | Dashboard includes four risk buckets | API | P0 | `GET /dashboard` | Response has `ok`, `reminder_due`, `escalation_due` keys |
| TC-CASE-007 | Dashboard includes `air_quality` block | API | P0 | `GET /dashboard` | `air_quality` key present with severity, schools, workload, high-risk-schools |

---

## 4. Case detail UI (`CaseDetail.jsx`)

Traces: PRD FR-1, FR-2, FR-3, FR-4, FR-6. Manual browser checks.

| ID | Title | Type | Priority | Steps | Expected |
|---|---|---|---|---|---|
| TC-UI-001 | Generic case renders three panels | E2E | P0 | Open `CASE-2026-00042` | Timeline/notes, workflow, policy + AI chat all visible |
| TC-UI-002 | Risk pill colour matches backend value | E2E | P0 | Open escalated `CASE-2026-00214` | Pill reads `escalation_due`, red styling |
| TC-UI-003 | Air quality case shows specialist panel | E2E | P0 | Open `CASE-2026-00401` | Extra panel with severity, school, symptoms renders |
| TC-UI-004 | Non-AQ case does NOT show specialist panel | E2E | P0 | Open `CASE-2026-00091` (licence) | No AQ panel in DOM |
| TC-UI-005 | Severity chip and URGENT flag render for AQ | E2E | P0 | Open `CASE-2026-00401` | `Critical` chip + `URGENT` flag visible |

---

## 5. AI summarise + Q&A (`backend/ai_pipeline.py`, `routes/ai.py`)

Traces: PRD FR-5. Source: `backend/tests/test_ai_mock.py`.

| ID | Title | Type | Priority | Preconditions | Steps | Expected |
|---|---|---|---|---|---|---|
| TC-AI-001 | Mock summariser produces deterministic output | Unit | P0 | `ANTHROPIC_API_KEY` unset | Call summariser twice for same case | Identical output both times |
| TC-AI-002 | Mock output references real timeline entries | Unit | P0 | Any seeded case | Call summariser | Output contains at least one timeline event note |
| TC-AI-003 | Mock Q&A refuses off-topic questions | Unit | P0 | Any case | Ask "what's the weather?" | Response says it can only answer from case context |
| TC-AI-004 | Root endpoint reports `ai_mode` | API | P0 | Key unset | `GET /` | `ai_mode == "mocked"` |
| TC-AI-005 | SSE streaming endpoint responds with event stream | E2E | P1 | Frontend running | Open case, ask question | Chunks arrive incrementally, no single blocking wait |
| TC-AI-006 | AI mode badge updates on first load | E2E | P0 | App loaded | Inspect header | Badge reads `AI: mocked` or `AI: live (Claude Haiku)` |

---

## 6. Air quality intake (`POST /cases/air-quality`, `AirQualityIntake.jsx`)

Traces: PRD FR-6. Source: `backend/tests/test_air_quality.py`.

| ID | Title | Type | Priority | Steps | Expected |
|---|---|---|---|---|---|
| TC-AQI-001 | Valid payload creates case | API | P0 | POST with all 8 sections | 201 with new case ID |
| TC-AQI-002 | Missing required field (`submitter_name`) rejected | API | P0 | POST without name | 422 validation error |
| TC-AQI-003 | `detailed_description` < 50 chars rejected | API | P1 | POST with short description | 422 with clear message |
| TC-AQI-004 | Severity + is_urgent persisted as top-level columns | API | P0 | POST with severity=Critical, is_urgent=true | Case row has correct values in DB |
| TC-AQI-005 | Submission payload stored as JSON | API | P0 | POST | `submission_payload` retrievable and contains submitter data |
| TC-AQI-006 | Form submits end-to-end in browser | E2E | P0 | Fill all sections, submit | Confirmation with case ID shown |

---

## 7. Recommendations engine (`backend/recommendations.py`)

Traces: PRD FR-6. Source: `backend/tests/` (extend if missing).

| ID | Title | Type | Priority | Steps | Expected |
|---|---|---|---|---|---|
| TC-REC-001 | Non-AQ case returns `applicable: false` | Unit | P0 | `recommend(benefit_review_case)` | `applicable == False`, empty actions |
| TC-REC-002 | Critical severity adds all 4 critical actions | Unit | P0 | `recommend(critical_case)` | Output starts with telephone + close area + escalate |
| TC-REC-003 | Critical + Mold adds 2 category actions | Unit | P1 | Critical mould case | Output includes moisture reading step |
| TC-REC-004 | High + Poor Ventilation returns CO2 monitor action | Unit | P0 | High ventilation case | Action list mentions 48-hour CO2 deployment |
| TC-REC-005 | High with unknown category returns fallback actions | Unit | P1 | Category="Other", High | Returns generic 3-action fallback |
| TC-REC-006 | `affected_count >= 5` + Mold triggers severity-review action | Unit | P1 | Affected=7, category=Mold | Last action suggests severity review |
| TC-REC-007 | `is_urgent=true` on non-Critical adds triage confirm step | Unit | P1 | High + urgent | Action list ends with team-leader confirm step |

---

## 8. School sensor dashboard (`SchoolsAirQuality.jsx`, `school_air_quality.py`)

Traces: PRD FR-7. Source: `backend/tests/test_school_air_quality.py`.

| ID | Title | Type | Priority | Steps | Expected |
|---|---|---|---|---|---|
| TC-SCH-001 | `GET /air-quality/schools` returns 5 schools | API | P0 | Call endpoint | 200, 5 items with URN, name, region |
| TC-SCH-002 | `GET /air-quality/schools/{urn}` returns pollutant readings | API | P0 | Call for URN 131209 | 36 monthly readings returned |
| TC-SCH-003 | RAG band for CO2 >1500 ppm is "Poor" | Unit | P0 | Feed reading into helper | Label matches CIBSE threshold |
| TC-SCH-004 | Sidebar shows 5 schools | E2E | P0 | Open dashboard | All 5 schools listed in sidebar |
| TC-SCH-005 | Pollutant table shows RAG + % of threshold + trend | E2E | P0 | Open Oakfield Primary | Table renders with all 8 measures |
| TC-SCH-006 | Reported AQ case cross-links to school | E2E | P0 | Click linked case | Navigates to case detail |

---

## 9. Team leader dashboard (`RiskDashboard.jsx`)

Traces: PRD FR-2, FR-7.

| ID | Title | Type | Priority | Steps | Expected |
|---|---|---|---|---|---|
| TC-DASH-001 | Dashboard shows ≥1 case in each risk bucket | API | P0 | `GET /dashboard` after seed | Each bucket has at least one case |
| TC-DASH-002 | Air quality section renders severity split | E2E | P0 | Open dashboard | Severity bar chart renders with Critical/High/Medium/Low counts |
| TC-DASH-003 | Workload by officer shows at least two officers | API | P1 | `GET /dashboard` | `workload` list has ≥2 rows |
| TC-DASH-004 | High-risk schools list populated | E2E | P1 | Open dashboard | At least 1 school listed in high-risk section |

---

## 10. Applicant portal (`ApplicantPortal.jsx`, `routes/upload.py`)

Traces: FR-1. Source: `backend/tests/test_applicant.py`, `test_upload.py`.

| ID | Title | Type | Priority | Steps | Expected |
|---|---|---|---|---|---|
| TC-APP-001 | Submission returns a case reference | API | P0 | POST generic case | 201 with case_id in response |
| TC-APP-002 | Reference lookup returns status | API | P0 | GET status by reference | 200 with status + last update |
| TC-APP-003 | Browser flow: submit → receive ref → look up | E2E | P0 | Full journey | Final page shows status matching seeded workflow |

---

## 11. Cross-cutting / smoke

| ID | Title | Type | Priority | Steps | Expected |
|---|---|---|---|---|---|
| TC-SMK-001 | `docker compose up --build` boots full stack | E2E | P0 | Run on clean machine | All three services healthy within 3 minutes |
| TC-SMK-002 | `GET /` returns 200 with `ai_mode` field | API | P0 | curl root | Status 200, response has `ai_mode` |
| TC-SMK-003 | No real PII in seed data | Data | P0 | Grep `cases.json` and `mock_school_air_quality.json` | No recognisable real names / postcodes beyond synthetic set |
| TC-SMK-004 | Frontend loads without console errors | E2E | P0 | Open localhost:3000, open devtools | No errors in console |
| TC-SMK-005 | `pytest` suite green | Unit | P0 | Run `pytest` in `backend/` | All tests pass |

---

## How to run

```bash
# Backend unit + API tests
cd backend && pytest -v

# Full stack for E2E
docker compose up --build

# Pre-demo sanity
# (also available as the /demo-check slash command)
```

## Traceability

| PRD requirement | Test coverage |
|---|---|
| FR-1 Case management | TC-CASE-001..007, TC-UI-001, TC-APP-001..003 |
| FR-2 Workflow engine | TC-WF-001..005, TC-DASH-001 |
| FR-3 Risk calculation | TC-RISK-001..008, TC-UI-002 |
| FR-4 Policy matching | TC-CASE-004 (policy block present), TC-UI-001 |
| FR-5 AI integration | TC-AI-001..006 |
| FR-6 Air quality workflow | TC-AQI-001..006, TC-REC-001..007, TC-UI-003..005 |
| FR-7 School sensor dashboard | TC-SCH-001..006 |

## Known gaps

- No test for attachment upload rendering in case detail (evidence panel stubbed — see PRD weakest-part note).
- No accessibility audit (WCAG) — explicitly out of scope per PRD §5.
- No load test — demo scale only.
- No end-to-end authentication test — user switcher is a demo affordance, not a real auth layer.
