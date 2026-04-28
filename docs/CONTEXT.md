# School Air Quality Tracker — Project Context

Hackathon prototype for **Challenge 3: Supporting casework decisions** (Version 1 AI Engineering Lab, April 2026). Repo dir is still `pip-caseworker-assistant/` for historical reasons — the project pivoted away from PIP to a multi-case-type caseworker assistant, with a strong focus on **school air quality**.

App title is now **"School Air Quality Tracker"** (`backend/main.py:1`, v0.2.0).

---

## 1. Problem & solution

Government caseworkers spend significant time gathering information from multiple systems. Team leaders lack a view of which cases are at risk of breaching deadlines. Applicants wait weeks with no meaningful status update.

Four user surfaces:

1. **Generic case intake** (`UploadPortal`) — submit benefit_review / licence_application / compliance_check.
2. **Specialist air-quality intake** (`AirQualityIntake`) — 8-section form for school AQ concerns.
3. **Caseworker case view** (`CaseDetail`) — timeline, workflow, policy, risk, AI summarise + Q&A; specialist AQ panel renders for `air_quality_concern`.
4. **Team leader risk dashboard** (`RiskDashboard`) — escalation/reminder backlog plus an **air-quality slice** (severity, schools, workload, high-risk schools).
5. **Schools sensor dashboard** (`SchoolsAirQuality`) — parent-facing, 5 schools × 36 months synthetic SAMHE-compatible sensor data, **cross-linked to live AQ cases by school name**.

---

## 2. Architecture

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Tailwind, GOV.UK design language |
| Backend | FastAPI (Python 3.12) |
| Database | PostgreSQL 16 (Docker) |
| AI | Anthropic Claude `claude-haiku-4-5-20251001` when `ANTHROPIC_API_KEY` set, deterministic mock fallback otherwise |
| Infra | Docker Compose |

`/` returns `ai_mode: "live" | "mocked"` — frontend renders a badge.

---

## 3. Domain model

### Case types (4)
- `benefit_review`
- `licence_application`
- `compliance_check`
- `air_quality_concern` — school AQ reports (mould, ventilation, chemical smells, temperature, dust)

### Shared workflow states
`case_created` → `awaiting_evidence` → `under_review` → `pending_decision` → `closed`, with `escalated` as a branch. Per-type `required_actions` and `allowed_transitions` differ.

### Reminder / escalation thresholds
| Case type | Reminder | Escalation |
|-----------|----------|------------|
| benefit_review | 28 days | 56 days |
| licence_application | 21 days | 42 days |
| compliance_check | 14 days | 28 days |
| **air_quality_concern** | **3 days** | **7 days** |

### Risk calculation (`backend/risk.py`)
For cases in `awaiting_evidence`, compare days since the most recent `evidence_requested` timeline event against the workflow's thresholds. Returns `escalation_due` > `reminder_due` > `ok`.

---

## 4. Backend (`backend/`)

```
main.py                 — FastAPI app, CORS, lifespan seed; registers 5 routers
models.py               — SQLAlchemy: cases (with severity_level, is_urgent, submission_payload), case_timeline, caseworker_notes, policies, workflow_states, users
schemas.py              — Pydantic; includes AirQualityDashboardOut
risk.py                 — pure-Python risk flag computation
recommendations.py      — rules-based recommended actions for air_quality_concern
school_air_quality.py   — in-memory loader for mock_school_air_quality.json; RAG / pct-of-threshold / certainty / trend / actions / sources helpers (CIBSE / WHO AQG / UK NAQS thresholds)
ai_pipeline.py          — Claude + deterministic mock fallback
seed_data.py            — loads cases.json, policy-extracts.json, workflow-states.json
routes/
  cases.py              — CRUD, detail view (workflow + policy + risk), dashboard (incl. air_quality block), recommended-actions, policies, workflow
  ai.py                 — POST /ai/cases/{id}/summarise, GET /ai/cases/{id}/ask/stream (SSE)
  upload.py             — generic case submission
  air_quality.py        — POST /cases/air-quality (8-section specialist intake)
  school_air_quality.py — GET /air-quality/schools, GET /air-quality/schools/{urn} (sensor dashboard with cross-linked AQ cases)
tests/                  — 8 test files, ~2.8k lines (intake, recommendations, sensor RAG/trend/certainty, risk, cases routes, AI mock, upload, applicant)
```

### Key model fields (Case)
- `case_id`, `case_type`, `status`, `applicant_name`, `applicant_reference`, `applicant_dob`
- `assigned_to` (team_a / team_b / team_c), `created_date`, `last_updated`
- **`severity_level`** — Low / Medium / High / Critical (AQ-specific)
- **`is_urgent`** — boolean priority flag
- **`submission_payload`** — JSON; AQ stores 8-section form data (issue_category, school_name, symptoms, affected_count, contact info, observations, attachments, etc.)

### Air-quality thresholds (`backend/school_air_quality.py`)
| Pollutant | Green | Amber | Red | Source |
|-----------|-------|-------|-----|--------|
| CO2 | ≤1000 ppm | ≤1500 | >1500 | CIBSE TM21 / BB101 |
| PM2.5 | ≤10 µg/m³ | ≤15 | >15 | WHO AQG 2021 |
| PM10 | ≤15 µg/m³ | ≤45 | >45 | WHO AQG 2021 |
| NO2 | ≤25 µg/m³ | ≤40 | >40 | UK NAQS annual |
| TVOC | ≤250 µg/m³ | ≤500 | >500 | indicative |
| Temperature | 18–23°C | 16–28°C | outside | BB101 |
| Humidity | 40–60% | 30–70% | outside | BB101 |

Helpers: `rag_for`, `pct_of_threshold`, `certainty_for` (uses building condition A–E + in-session flag), `trend_for` (3-month rolling window, 5% threshold), `actions_for`, `summarise_school`, `detail_school`, `all_summaries`.

### Recommendations engine (`backend/recommendations.py`)
Rules keyed on `(issue_category, severity_level)`:
- **Critical** → telephone contact (POL-AQ-004), immediate escalation, holding update.
- **High** → category-driven: e.g. Mold/Moisture → facilities inspection within 5 working days.
- **Medium** → category-driven, weekly updates.
- **Low** → monitoring + standard-timescale inspection.
- **Auto-escalation** if `affected_count ≥ 5` and category in {Mold/Moisture, Chemical Smell}.
- Cross-check: if `is_urgent` but not Critical, confirm triage with team leader.

### AI pipeline (`backend/ai_pipeline.py`)
- Model: `claude-haiku-4-5-20251001`.
- `summarise_case` → JSON `{summary, key_points, next_action}`.
- `ask_about_case_stream` → async generator, served as SSE.
- Mock mode: deterministic templates that pull from case notes / timeline / risk reason.
- Context builder includes: case header, notes, timeline, current workflow state with required actions, applicable policy extracts.

---

## 5. Frontend (`frontend/src/`)

```
App.jsx                       — GOV.UK layout, nav, user switcher, AI-mode badge
api.js                        — fetch wrapper; SSE consumer for ask/stream
components/
  CaseQueue.jsx              — filterable list with risk pill + severity chip
  CaseDetail.jsx             — three-panel view; specialist AQ panel renders conditionally
  RiskDashboard.jsx          — team-leader backlog + air-quality section
  UploadPortal.jsx           — generic submission form
  AirQualityIntake.jsx       — 8-section intake for air_quality_concern
  SchoolsAirQuality.jsx      — parent-facing sensor dashboard: 5-school sidebar + pollutant table (RAG / % of threshold / certainty / trend / actions / sources) + cross-linked parent reports
  ApplicantPortal.jsx        — applicant self-service status check
```

### Nav tabs (App.jsx)
1. Submit case (generic)
2. Report air quality (8-section form)
3. **Schools air quality** (sensor dashboard)
4. Check my case (applicant)
5. Cases queue (caseworker)
6. Risk dashboard (team leader)

---

## 6. Data layer (`data/`)

| File | What it contains |
|------|------------------|
| `cases.json` | 20 synthetic cases (10 legacy + 10 air quality). AQ school_names align to the sensor-dataset schools |
| `policy-extracts.json` | 15 policies including POL-AQ-001..005 |
| `workflow-states.json` | State machines per case type |
| `mock_school_air_quality.json` | 5 UK schools × 36 months × 8 measures, SAMHE-compatible |
| `DATA_SPEC.md` | Authoritative thresholds (CIBSE TM21 / BB101, WHO AQG 2021, UK NAQS) |

### Schools in the sensor dataset
1. Oakfield Primary
2. St Mary's C of E Primary
3. Greenwood Academy
4. Riverside Community Primary
5. Northgate Secondary

Each school has: URN, address, Ofsted, building era, building condition (A–E grade — drives certainty), pupil count, SAMHE monitor ID.

### Air-quality policy extracts
- `POL-AQ-001` — severity escalation triggers (5+ affected with mold/chemical)
- `POL-AQ-002` — high-severity response protocols (facilities inspection, isolation)
- `POL-AQ-003` — escalation to team leader (unresolved >7 days)
- `POL-AQ-004` — Critical severity immediate actions (telephone contact, escalation, holding update)
- `POL-AQ-005` — additional AQ guidance

---

## 7. End-to-end flows

### Submit an air-quality concern
`AirQualityIntake.jsx` 8-section form → `POST /cases/air-quality` (`routes/air_quality.py:82-131`) → generates `case_id` and `applicant_ref AQ-{YYYY}-{suffix}` → stores all fields in `submission_payload` JSON → routes by severity (Critical→team_c, High→team_b, else→team_a) → sets `is_urgent = urgency OR Critical` → seeds initial timeline (`case_created` + optional `flagged_urgent`).

### Schools sensor dashboard
`SchoolsAirQuality.jsx` → `GET /air-quality/schools` (list with open/total AQ case counts) → user selects school → `GET /air-quality/schools/{urn}?timeframe=...` → backend calls `detail_school()` (pollutant table, trends, certainty, actions) and `matched_cases_for(school_name)` for the parent-reports panel → user clicks a parent report to open the linked case.

### Team-leader risk dashboard
`GET /cases/dashboard/risk` (`routes/cases.py:138-219`) → builds escalation/reminder lists from open cases → if AQ cases exist, adds `air_quality` block: severity counts, by_school, by_issue_category, workload_by_officer, sla_breach (escalation + urgent non-closed), high_risk_schools (count ≥2 or 1 Critical or 2 High).

### AI summarise + Q&A
`POST /ai/cases/{id}/summarise` → loads case + timeline + notes + current workflow state + applicable policies + risk → calls Claude or mock → stores result in `case.ai_summary`.
`GET /ai/cases/{id}/ask/stream` → same context → streams Claude response over SSE.

---

## 8. Conventions

- All API responses are JSON; AI streaming via SSE.
- No real PII anywhere — all data is synthetic.
- GOV.UK design patterns: phase banner, black header, structured forms.
- Mock users (password `demo123`): `j.patel` (caseworker, team_a), `r.singh` (caseworker, team_b), `m.khan` (team leader).

---

## 9. Demo cases

| Case | Type | Status | Notes |
|------|------|--------|-------|
| `CASE-2026-00042` | benefit_review | awaiting_evidence | risk depends on today |
| `CASE-2026-00214` | benefit_review | escalated | evidence 64 days overdue in source data |
| `CASE-2026-00091` | licence_application | under_review | clean path |
| `CASE-2026-00107` | compliance_check | escalated | serious breaches found |
| `CASE-2026-00401` | air_quality | escalated | **Critical + URGENT** — chemical spill in school prep room |
| `CASE-2026-00402` | air_quality | awaiting_evidence | **High** — mould in primary classroom with asthmatic pupils |
| `CASE-2026-00406` | air_quality | escalated | **High + URGENT** — recurring mould, 3rd in 12 months |
| `CASE-2026-00409` | air_quality | case_created | **Critical + URGENT** — just-submitted cleaning-product incident |

---

## 10. Hackathon toolkit

- `docs/REBUILD_PLAYBOOK.md` — phased prompts to rebuild from scratch
- `docs/PRD.md`, `docs/PROMPT_LIBRARY.md`, `docs/TEST_CASES.md`
- Slash commands: `/generate-cases N`, `/add-case-type NAME`, `/demo-check`, `/seed-reset`
- Agent: `.claude/agents/hackathon-builder.md`

---

## 11. Key env vars

- `ANTHROPIC_API_KEY` — optional; unset → mocked AI mode
- `DATABASE_URL` — auto-set by docker compose
- `VITE_API_URL` — frontend API base URL

---

*Last updated: 2026-04-28*
