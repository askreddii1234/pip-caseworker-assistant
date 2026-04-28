# Caseworker Assistant

Prototype for **Challenge 3: Supporting casework decisions** (Version 1 AI Engineering Lab
Hackathon, April 2026). Repo directory is still `pip-caseworker-assistant/` for historical
reasons — the project pivoted away from PIP-specific scope.

## Problem
Caseworkers across government spend significant time gathering information from multiple
systems: case management notes spread across fields, policy guidance in long documents,
evidence logged in separate systems. Team leaders lack a view of which cases are at risk
of breaching deadlines. Applicants wait weeks with no meaningful status update.

## Solution
Three surfaces:
1. **Claimant/applicant portal** — submit a case (any of three types) with documents.
2. **Caseworker case view** — one screen showing case + timeline, current workflow
   position with required actions, matched policy extracts, and evidence-overdue risk.
3. **Team leader dashboard** — cases breaching reminder/escalation thresholds, by team.

## Architecture
- **Frontend**: React 18 + Tailwind (GOV.UK design language)
- **Backend**: FastAPI (Python 3.12)
- **Database**: PostgreSQL 16 (via Docker)
- **AI**: Optional. Anthropic Claude (claude-haiku-4-5-20251001) when `ANTHROPIC_API_KEY`
  is set, otherwise a deterministic mock path produces grounded responses from the case
  record. The challenge brief explicitly states mocks score as well as live models.
- **Infra**: Docker Compose

## Commands
- `docker compose up --build` — start full stack
- `docker compose down -v` — tear down and reset data
- Backend API docs: http://localhost:8000/docs
- Frontend: http://localhost:3000

## Domain model
Four case types, each with its own workflow state machine:
- `benefit_review`
- `licence_application`
- `compliance_check`
- `air_quality_concern` — school air quality reports (mould, ventilation, chemical smells, etc.). Specialist fields live in `Case.submission_payload` (JSON); severity (`Low`/`Medium`/`High`/`Critical`) and `is_urgent` are top-level columns.

Shared states: `case_created` → `awaiting_evidence` → `under_review` → `pending_decision`
→ `closed`, with `escalated` as a branch. Per case-type `required_actions` and
`allowed_transitions` differ.

**Risk calculation**: for cases in `awaiting_evidence`, compare days since the most
recent `evidence_requested` timeline event against the workflow's `reminder_days` and
`escalation_days` thresholds. `escalation_due` > `reminder_due` > `ok`.

## Project structure
```
backend/
  main.py                  — FastAPI app, CORS, lifespan seed
  models.py                — SQLAlchemy: cases (with severity_level / is_urgent / submission_payload), case_timeline, caseworker_notes, policies, workflow_states, users
  schemas.py               — Pydantic request/response schemas (includes AirQualityDashboardOut)
  risk.py                  — pure-Python risk flag computation
  recommendations.py       — rules-based recommended actions for air_quality_concern
  school_air_quality.py    — in-memory loader for mock_school_air_quality.json; RAG / pct-of-threshold / certainty / trend / actions / sources helpers keyed off DATA_SPEC thresholds (CIBSE / WHO AQG / UK NAQS)
  ai_pipeline.py           — Claude + deterministic mock fallback
  seed_data.py             — loads cases.json, policy-extracts.json, workflow-states.json
  routes/
    cases.py               — CRUD, detail view with workflow+policy+risk, dashboard (incl. air_quality block), recommended-actions, policies, workflow
    ai.py                  — /ai/cases/{id}/summarise, /ask/stream
    upload.py              — generic case submission endpoint
    air_quality.py         — POST /cases/air-quality — 8-section specialist intake
    school_air_quality.py  — GET /air-quality/schools + /air-quality/schools/{urn} — sensor dashboard with cross-linked AQ cases

frontend/
  src/
    App.jsx                       — layout, nav, user switcher, AI-mode badge
    api.js                        — fetch wrapper
    components/
      CaseQueue.jsx          — filterable cases list with risk pill + severity chip
      CaseDetail.jsx         — three-panel view: timeline/notes | workflow | policy + AI chat; specialist AQ panel renders conditionally
      RiskDashboard.jsx      — team leader backlog (escalation/reminder) + air-quality section (severity, schools, workload, high-risk schools)
      UploadPortal.jsx       — generic submission form
      AirQualityIntake.jsx   — 8-section intake for air_quality_concern
      SchoolsAirQuality.jsx  — parent-facing sensor dashboard: sidebar of 5 schools + pollutant table (RAG / % of threshold / certainty / trend / actions / sources) + cross-linked parent reports that open the linked case

data/
  cases.json                      — 20 synthetic cases (10 legacy + 10 air quality); AQ case school_names align to the sensor-dataset schools
  policy-extracts.json            — 15 policy extracts (incl. POL-AQ-001..005)
  workflow-states.json            — state machine per case type (incl. air_quality_concern with 3-day reminder / 7-day escalation)
  mock_school_air_quality.json    — 5 UK schools × 36 months × 8 measures, SAMHE-compatible synthetic sensor data
  DATA_SPEC.md                    — authoritative thresholds (CIBSE TM21 / BB101, WHO AQG 2021, UK NAQS) driving RAG bands in school_air_quality.py
```

## Conventions
- All API responses use JSON
- AI streaming via SSE at `/ai/cases/{id}/ask/stream`
- No real PII anywhere — all data is synthetic
- GOV.UK design patterns: phase banner, black header, structured forms
- `/` root endpoint returns `ai_mode: live | mocked` — frontend shows a badge

## Key env vars
- `ANTHROPIC_API_KEY` — optional; if unset the app runs in mocked AI mode
- `DATABASE_URL` — auto-set by docker compose
- `VITE_API_URL` — frontend API base URL

## Mock users (password: demo123)
- j.patel (caseworker) → team_a
- r.singh (caseworker) → team_b
- m.khan (team leader) → sees all teams

## Hackathon toolkit
- `docs/REBUILD_PLAYBOOK.md` — phased prompts to rebuild this project from scratch
- `.claude/commands/generate-cases.md` — `/generate-cases N`
- `.claude/commands/add-case-type.md` — `/add-case-type NAME`
- `.claude/commands/demo-check.md` — `/demo-check` pre-demo sanity pass
- `.claude/commands/seed-reset.md` — `/seed-reset` wipe and re-seed
- `.claude/agents/hackathon-builder.md` — focused implementer agent

## Demo cases (pick these for a guided walkthrough)
- `CASE-2026-00042` — benefit review, `awaiting_evidence` (risk depends on today)
- `CASE-2026-00214` — benefit review, `escalated` (evidence 64 days overdue in source data)
- `CASE-2026-00091` — licence application, `under_review` (clean path)
- `CASE-2026-00107` — compliance check, `escalated` (serious breaches found)
- `CASE-2026-00401` — air quality, `escalated`, Critical + URGENT — chemical spill in school prep room
- `CASE-2026-00402` — air quality, `awaiting_evidence`, High — mould in primary classroom with asthmatic pupils
- `CASE-2026-00406` — air quality, `escalated`, High + URGENT — recurring mould, 3rd instance in 12 months
- `CASE-2026-00409` — air quality, `case_created`, Critical + URGENT — just-submitted cleaning-product incident
