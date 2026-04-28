# School Air Quality Tracker

Prototype for **Challenge 3: Supporting casework decisions** — Version 1 AI Engineering Lab Hackathon, April 2026.

A casework decision-support tool focused on **school air quality** alongside three other case types. Surfaces what's known, what's missing, and what guidance applies — with retrieval-augmented AI answers that cite their sources.

> The repository directory is `pip-caseworker-assistant/` for historical reasons. The project pivoted from PIP-specific scope to a multi-case-type tool with a strong school-air-quality slant.

---

## What it does

Five user surfaces:

| # | Audience | Surface |
|---|----------|---------|
| 1 | Public / generic intake | Submit a case (benefit review · licence application · compliance check) |
| 2 | Schools / parents / staff | **8-section air quality concern intake** with severity routing |
| 3 | Caseworker | Single case view: timeline, workflow position, applicable policy, risk flag, AI brief + Q&A grounded in retrieved guidance |
| 4 | Team leader | Risk dashboard — escalation/reminder backlog plus an air-quality slice (severity, schools, workload, high-risk schools) |
| 5 | Parents / public | **Schools sensor dashboard** — 5 schools × 36 months SAMHE-style monitor data, cross-linked to live air-quality cases |

---

## Architecture

```
                            BROWSER
                ┌──────────────────────────────┐
                │  React 18 + Tailwind         │
                │  GOV.UK design language      │
                │  ─────────────────────────   │
                │  CaseQueue · CaseDetail      │
                │  AirQualityIntake            │
                │  SchoolsAirQuality           │
                │  RiskDashboard · Portal      │
                └──────────────┬───────────────┘
                               │ HTTP + SSE
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │  FastAPI (Python 3.12)                                 │
   │  ─────────────────────────────────────────────────────  │
   │  routes/cases.py            — list, detail, dashboard  │
   │  routes/air_quality.py      — POST /cases/air-quality  │
   │  routes/school_air_quality  — sensor dashboard         │
   │  routes/ai.py               — summarise, ask/stream    │
   │  routes/upload.py           — generic intake           │
   │                                                        │
   │  rag.py        — BM25 over data/knowledge_base/*.md ───┐│
   │  ai_pipeline   — Claude (live) / deterministic (mock) ││
   │  risk.py       — reminder / escalation thresholds     ││
   │  recommendations — rules engine for AQ cases          ││
   └────────────────┬───────────────────────────────┬──────┘│
                    │                               │       │
                    ▼                               ▼       │
        ┌────────────────────┐         ┌─────────────────────┴──┐
        │  PostgreSQL 16     │         │  data/                  │
        │  cases · timeline  │         │  ├─ cases.json          │
        │  notes · policies  │         │  ├─ policy-extracts.json│
        │  workflow_states   │         │  ├─ workflow-states.json│
        │  users             │         │  ├─ mock_school_air…    │
        └────────────────────┘         │  └─ knowledge_base/*.md │
                                       │     (RAG corpus)        │
                                       └─────────────────────────┘
```

**Stack** — FastAPI · PostgreSQL 16 · React 18 + Tailwind · Anthropic Claude Haiku 4.5 (live) or deterministic mock (default) · Docker Compose · BM25 retrieval (`rank-bm25`).

---

## Domain model

### Case types

Four case types share a common workflow but differ in required actions, allowed transitions, and reminder/escalation thresholds:

| Case type | Reminder | Escalation |
|-----------|----------|------------|
| `benefit_review` | 28 d | 56 d |
| `licence_application` | 21 d | 42 d |
| `compliance_check` | 14 d | 28 d |
| **`air_quality_concern`** | **3 d** | **7 d** |

### Workflow states

Shared: `case_created` → `awaiting_evidence` → `under_review` → `pending_decision` → `closed`, with `escalated` as a branch. Per-type `required_actions` and `allowed_transitions` are defined in `data/workflow-states.json`.

### Database schema

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `cases` | One row per case | `case_id` PK, `case_type`, `status`, `applicant_name`, `assigned_to`, `severity_level` *(AQ)*, `is_urgent` *(AQ)*, `submission_payload` *(JSON, AQ-specific fields)*, `ai_summary` |
| `case_timeline` | Immutable audit log | `id` PK, `case_id` FK, `date`, `event`, `note` |
| `caseworker_notes` | Free-text notes added post-seed | `id` PK, `case_id` FK, `author`, `content`, `created_at` |
| `policies` | Hand-curated policy extracts | `policy_id` PK, `title`, `applicable_case_types[]`, `body` |
| `workflow_states` | State machine per case type | `(case_type, state)` PK, `label`, `description`, `allowed_transitions[]`, `required_actions[]`, `reminder_days`, `escalation_days` |
| `users` | Demo accounts | `username` PK, `full_name`, `role`, `hashed_password` |

The RAG layer adds two **logical** entities (Source Document, Chunk) — held in memory rather than database tables. See `docs/RAG_ARCHITECTURE.md` § 4 for the full data model and the upgrade path to persistent vector storage.

### Risk computation

Pure-Python (`backend/risk.py`). For cases in `awaiting_evidence`, compares days since the most recent `evidence_requested` timeline event against the workflow's thresholds. Returns `escalation_due` > `reminder_due` > `ok`.

### Air-quality specifics

- 8-section intake captures submitter, location, incident, exposure, observations, severity, related history, attachments — all fields stored in `cases.submission_payload` (JSONB)
- Severity routing: `Critical → team_c`, `High → team_b`, else `team_a`
- `is_urgent = urgency_flag OR severity == Critical`
- Recommendations engine (`backend/recommendations.py`) keyed on `(issue_category, severity_level)` produces caseworker action lists
- Sensor dashboard reads `data/mock_school_air_quality.json` (5 schools, 36 months, 8 measures) and applies CIBSE / WHO AQG / UK NAQS thresholds for RAG bands, certainty, trend, and recommended actions

---

## Retrieval-Augmented Generation

The AI brief and Q&A are grounded in a curated knowledge base. Retrieval uses **BM25** over markdown files with YAML frontmatter — no vector store, no embeddings, sub-millisecond per query.

```
case context  ─┐
KB chunks     ─┼─►  Claude (or deterministic mock)  ─►  answer with [KB-N] citations
question      ─┘
```

**Knowledge base** (`data/knowledge_base/`, **28 chunks indexed at startup**):

| Doc | Source | Covers |
|-----|--------|--------|
| `bb101-ventilation` | DfE Building Bulletin 101 | CO2 thresholds, thermal comfort, mould response |
| `who-aqg-2021` | WHO Air Quality Guidelines 2021 | PM2.5 / PM10 / NO2 / O3 health-based limits |
| `cibse-tm21-ventilation` | CIBSE Technical Memorandum | Sensor placement, ventilation strategies, trend reading |
| `hse-schools-iaq` | HSE / COSHH | Chemical exposure response, RIDDOR, multi-pupil incidents |
| `samhe-sensor-guidance` | SAMHE programme | Interpreting classroom sensor traces |

Every retrieved chunk carries `doc_id`, `title`, `publisher`, `year`, `url` so the UI can render a Sources panel with clickable provenance. The model is instructed to cite each borrowed claim with a `[KB-N]` marker.

**Mock mode** (no `ANTHROPIC_API_KEY`) still runs retrieval — the deterministic generator quotes the top-1 chunk verbatim, so the demo works fully offline.

Full design + governance discussion: **[`docs/RAG_ARCHITECTURE.md`](docs/RAG_ARCHITECTURE.md)**.

---

## Quick start (local)

```bash
# Optional — without it, AI runs in deterministic mock mode (still useful for demo)
cp .env.example .env
# Edit .env to add ANTHROPIC_API_KEY if you have one

docker compose up --build

# Frontend:  http://localhost:3000
# API docs:  http://localhost:8000/docs
# Root:      http://localhost:8000/   (shows ai_mode: live | mocked)
```

On startup the backend logs `[rag] indexed 28 knowledge-base chunks` once the corpus is loaded.

For VM deployment (GCP Compute Engine), see **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**.

---

## Demo cases

Pick these for a guided walkthrough:

| Case | Type | Status | What's interesting |
|------|------|--------|--------------------|
| `CASE-2026-00042` | benefit review | awaiting_evidence | Risk depends on today |
| `CASE-2026-00214` | benefit review | escalated | Evidence 64 days overdue |
| `CASE-2026-00091` | licence application | under_review | Clean path |
| `CASE-2026-00107` | compliance check | escalated | Serious breaches found |
| `CASE-2026-00401` | air quality | escalated | **Critical + URGENT** — chemical spill in school prep room |
| `CASE-2026-00402` | air quality | awaiting_evidence | **High** — mould in primary classroom with asthmatic pupils |
| `CASE-2026-00406` | air quality | escalated | **High + URGENT** — recurring mould, 3rd in 12 months |
| `CASE-2026-00409` | air quality | case_created | **Critical + URGENT** — just-submitted cleaning-product incident |

Open `CASE-2026-00401`, click **AI brief**, then ask *"What's the immediate response for chemical exposure affecting 8 pupils?"* — the answer streams with inline `[KB-N]` pills and a Sources panel pointing to BB101, HSE COSHH, and `POL-AQ-004`.

---

## Mock users (password: `demo123`)

| Username | Role | Sees |
|----------|------|------|
| `j.patel` | Caseworker | team_a cases |
| `r.singh` | Caseworker | team_b cases |
| `m.khan` | Team leader | All teams (use this for the risk dashboard) |

---

## What's real vs. mocked

| Component | Status |
|-----------|--------|
| Case data, timeline, policy matching, workflow state machine | **Real** — backed by Postgres + seeded JSON |
| Risk thresholds, recommendations engine | **Real** — pure Python, deterministic |
| RAG retrieval (BM25 over knowledge base) | **Real** — runs in both AI modes |
| Sensor data | **Synthetic** — `data/mock_school_air_quality.json`, SAMHE-shaped |
| AI brief + Q&A | **Mocked by default**, live with `ANTHROPIC_API_KEY` |
| All applicant / school / pupil PII | **Synthetic** — no real personal data anywhere |

---

## Project structure

```
backend/
  main.py                 — FastAPI app, lifespan, CORS, RAG index build
  models.py               — SQLAlchemy: cases, timeline, notes, policies, workflow, users
  schemas.py              — Pydantic schemas (incl. AirQualityDashboardOut, KbChunkOut)
  risk.py                 — risk flag computation
  recommendations.py      — rules engine for AQ cases
  school_air_quality.py   — sensor dataset loader, RAG / trend / certainty helpers
  ai_pipeline.py          — Claude (live) + deterministic mock; takes kb_chunks
  rag.py                  — BM25 retriever (frontmatter parser, chunker, index)
  seed_data.py            — loads cases / policies / workflow-states JSON
  routes/
    cases.py              — CRUD, detail, risk dashboard (with AQ slice)
    ai.py                 — POST /summarise (RAG-grounded), GET /ask/stream (SSE)
    upload.py             — generic case submission
    air_quality.py        — 8-section AQ intake
    school_air_quality.py — sensor dashboard endpoints
  tests/                  — 113 tests covering risk, intake, sensor, RAG, AI mock, routes

frontend/
  src/
    App.jsx               — GOV.UK layout, nav, user switcher, AI badge
    api.js                — fetch wrapper, SSE consumer for ask/stream
    components/
      CaseQueue            — filterable list with risk pill + severity chip
      CaseDetail           — three-panel + AQ specialist panel + AI brief + Q&A with KB citations
      RiskDashboard        — escalation/reminder + AQ slice
      UploadPortal         — generic intake
      AirQualityIntake     — 8-section AQ intake
      SchoolsAirQuality    — sensor dashboard with cross-linked cases
      ApplicantPortal      — applicant self-service status

data/
  cases.json                       — 20 synthetic cases (10 legacy + 10 AQ)
  policy-extracts.json             — 15 policies incl. POL-AQ-001..005
  workflow-states.json             — state machines per case type
  mock_school_air_quality.json     — 5 schools × 36 months × 8 measures
  DATA_SPEC.md                     — threshold authority (CIBSE / WHO / UK NAQS)
  knowledge_base/                  — RAG corpus (5 markdown docs, 28 chunks)

docs/
  CONTEXT.md                       — full app context snapshot
  RAG_ARCHITECTURE.md              — RAG data model, governance, demo Q&A
  DEPLOYMENT.md                    — GCP VM walkthrough
  PRD.md · TEST_CASES.md · PROMPT_LIBRARY.md · REBUILD_PLAYBOOK.md

.claude/
  agents/hackathon-builder.md      — focused implementer agent
  commands/                        — /generate-cases · /add-case-type · /demo-check · /seed-reset
```

---

## Documentation index

| Doc | Audience | Read for |
|-----|----------|----------|
| `docs/CONTEXT.md` | Anyone joining the project | Full snapshot of the app today |
| `docs/RAG_ARCHITECTURE.md` | Data architects, standards team | RAG data model, governance, demo Q&A |
| `docs/DEPLOYMENT.md` | DevOps / demo runner | GCP VM steps |
| `docs/PRD.md` | Product / hackathon judges | Problem statement, scope, success criteria |
| `docs/TEST_CASES.md` | QA / reviewer | Manual test scenarios |
| `docs/REBUILD_PLAYBOOK.md` | Anyone wanting to rebuild from scratch | Phased prompts |
| `data/DATA_SPEC.md` | Engineers extending sensor logic | Threshold authority + data shape |

---

## Tests

```bash
docker compose exec backend pytest -q
# 113 passed
```

Coverage includes risk thresholds, AQ intake, recommendations engine, sensor RAG bands / trend / certainty, BM25 retrieval, AI mock mode (with and without KB chunks), case routes, applicant lookup, and generic upload.

---

## Hackathon toolkit

Slash commands (in `.claude/commands/`):

- `/generate-cases N` — generate N more synthetic cases
- `/add-case-type NAME` — scaffold a fifth case type end-to-end
- `/demo-check` — pre-demo sanity pass
- `/seed-reset` — wipe and re-seed the database

---

## Key environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Optional. Unset → mock AI mode | (unset) |
| `DATABASE_URL` | Postgres connection string | auto-set by docker-compose |
| `PUBLIC_HOST` | Hostname/IP the browser uses (for VM deploys) | `localhost` |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list | localhost variants |
| `KB_DIR` | Path to RAG knowledge base | `/app/data/knowledge_base` |

See `.env.example` for the canonical list.

---

## License & credits

Hackathon prototype — synthetic data only, no production guarantees. Knowledge-base documents are paraphrased synthesis of public UK schools indoor-air-quality guidance for retrieval-augmented Q&A; see each file's frontmatter for original publisher and year.
