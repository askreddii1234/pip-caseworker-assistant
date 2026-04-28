# Rebuild Playbook — Caseworker Assistant from scratch

A phased recipe to rebuild this project from `project_scope.txt` using Claude Code. Each
phase has: a one-sentence goal, the files Claude must read first, a copy-paste prompt, and
a verification step. Phases are sized to fit in one Claude Code session without blowing
context.

**Before you start**: put `project_scope.txt` and the three starter JSON files
(`cases.json`, `policy-extracts.json`, `workflow-states.json`) in a `data/` folder at the
repo root. Those are the inputs — everything else is generated.

---

## Architecture snapshot (read this first)

```
┌────────────────────┐       ┌──────────────────────┐       ┌─────────────────┐
│  React 18 + Vite   │──────▶│  FastAPI (Python)    │──────▶│  PostgreSQL 16  │
│  + Tailwind        │  REST │  - stateless         │ SQL   │  (SQLite in     │
│  (GOV.UK styling)  │  SSE  │  - SQLAlchemy 2      │       │   tests)        │
└────────────────────┘       └──────────┬───────────┘       └─────────────────┘
                                        │ optional
                                        ▼
                             ┌──────────────────────┐
                             │  Claude Haiku 4.5    │
                             │  (+ mock fallback)   │
                             └──────────────────────┘
```

**Five tables**: `cases`, `case_timeline`, `caseworker_notes`, `policies`,
`workflow_states`. JSON columns hold `allowed_transitions`, `required_actions`, and
`applicable_case_types` — no junction tables.

**One risk function** drives the whole app: for cases in `awaiting_evidence`, compare days
since last `evidence_requested` event against the workflow's `reminder_days` /
`escalation_days`. Everything else is CRUD and display.

**AI is optional**. Mock path returns deterministic, grounded responses. Challenge brief
says mocks score equally — don't block on API access.

**Three users**:
- Caseworker — sees their queue, opens a case, gets workflow + policy + risk on one screen
- Team leader — sees the risk dashboard (escalation/reminder buckets by team)
- Applicant — looks up their case by reference, sees plain-language status

---

## Phase 0 — Scaffold

**Goal**: empty but bootable Docker Compose stack: FastAPI returning `{"status":"ok"}`
and React showing a heading. No domain logic yet.

**Prompt**:
```
I'm building a prototype for a UK government caseworking tool — a hackathon project
based on a challenge brief at ./project_scope.txt. Read that file first.

Scaffold the project with:
- docker-compose.yml at the repo root with three services: postgres:16 (volume: pgdata),
  backend (FastAPI on :8000), frontend (Vite dev server on :3000 proxying to backend).
- backend/: Dockerfile (python:3.12-slim), requirements.txt with fastapi==0.115.0,
  uvicorn[standard]==0.30.0, sqlalchemy==2.0.35, psycopg2-binary, pydantic==2.9.0,
  anthropic==0.42.0, passlib[bcrypt], python-multipart, httpx==0.27.2.
  main.py with a FastAPI app, CORS allowing localhost:3000/5173, GET / returning
  {"service":"Caseworker Assistant","status":"running"}, GET /health returning {"status":"ok"}.
- frontend/: Vite + React 18 + Tailwind CSS. package.json, vite.config.js, index.html,
  src/main.jsx, src/App.jsx showing "Caseworker Assistant" heading and a PROTOTYPE tag,
  src/index.css with Tailwind directives and a few govuk-* utility classes
  (govuk-dark #0b0c0c, govuk-blue #1d70b8, govuk-green #00703c, govuk-yellow #ffdd00,
  govuk-grey #505a5f, govuk-light #f3f2f1).
- README.md with a one-paragraph problem statement pulled from project_scope.txt and
  "docker compose up --build" instructions.

Don't add domain code yet — just a bootable shell.
```

**Verify**: `docker compose up --build`. Hit `localhost:8000/health` and `localhost:3000`.

---

## Phase 1 — Data model + seeder

**Goal**: five tables, JSON seed loading on first boot, idempotent.

**Files to read first**: `data/cases.json`, `data/policy-extracts.json`,
`data/workflow-states.json`.

**Prompt**:
```
Inspect the three files in ./data/ (cases.json, policy-extracts.json, workflow-states.json).
Design the database schema from them.

Create backend/models.py with SQLAlchemy 2.0 models:
- Case: case_id PK, case_type, status, applicant_name, applicant_reference, applicant_dob,
  assigned_to, created_date, last_updated, case_notes, ai_summary. All dates as ISO strings
  (not datetime) — the JSON already stores them that way.
- CaseTimelineEvent: id PK, case_id FK, date, event, note. Ordered by date.
  Relationship from Case.
- CaseworkerNote: id PK, case_id FK, author, content, created_at (datetime). Separate from
  the seeded timeline — this is for runtime-added notes.
- Policy: policy_id PK, title, applicable_case_types (JSON column — list of strings), body.
- WorkflowState: id PK, case_type (indexed), state, label, description,
  allowed_transitions (JSON list), required_actions (JSON list),
  reminder_days (nullable int), escalation_days (nullable int).
  Flatten escalation_thresholds onto the row.
- User: id PK, username (unique), full_name, role, hashed_password.

Use JSON columns (sqlalchemy JSON type) not junction tables — these lists are always
read atomically and never queried into.

Add engine/SessionLocal/get_db/init_db at the bottom. DATABASE_URL from env, default to
postgres connection string for docker compose.

Create backend/schemas.py with Pydantic v2 models mirroring these plus a RiskFlag model
(level: "ok"|"reminder_due"|"escalation_due", reason, optional days_since_request,
reminder_days, escalation_days).

Create backend/seed_data.py that:
- Calls init_db()
- Skips if Case count > 0 (idempotent)
- Seeds three demo users (passwords "demo123", bcrypt-hashed): j.patel caseworker,
  r.singh caseworker, m.khan team_leader.
- Loads /app/data/cases.json, /app/data/policy-extracts.json,
  /app/data/workflow-states.json and inserts rows. Commit once at the end.
- Flatten workflow escalation_thresholds into reminder_days/escalation_days columns.

Wire seed() into main.py via FastAPI lifespan.
```

**Verify**: `docker compose down -v && docker compose up --build`. Then
`curl localhost:8000/docs` — no endpoints yet but app boots. Inspect DB: should have
10 cases, 10 policies, ~18 workflow states.

---

## Phase 2 — Risk computation + cases routes (non-AI spine)

**Goal**: the core value of the app — list, detail with workflow+policy, risk flags,
transitions.

**Prompt**:
```
Read backend/models.py and backend/schemas.py first so you know the schema.

Create backend/risk.py — a pure-Python module with ONE function:

  compute_risk(case, awaiting_state, today=None) -> dict

Rules:
- If case.status != "awaiting_evidence": return {"level": "ok", "reason": "..."}
- Scan case.timeline for "evidence_requested" events, take the MOST RECENT date.
- If none found: return ok.
- days = today - latest_request_date (today defaults to date.today())
- If awaiting_state is None OR both thresholds are None: return ok.
- If days >= escalation_days: "escalation_due" (wins over reminder).
- Elif days >= reminder_days: "reminder_due".
- Else: "ok".
- Include days_since_request, reminder_days, escalation_days in the returned dict when
  applicable.

No SQLAlchemy imports here — it's pure logic on already-loaded objects.

Create backend/routes/cases.py with prefix "/cases":

  GET /cases                    list with filters: case_type, status, assigned_to, risk
                                (ok|reminder_due|escalation_due), search (by applicant_name).
                                Returns each case with its computed risk. Risk is applied
                                AFTER the DB query as a Python filter.

  GET /cases/{case_id}          detail view returning:
                                - case
                                - timeline (ordered)
                                - caseworker_notes
                                - current_state (WorkflowState matching case.status)
                                - allowed_states (WorkflowStates whose state is in
                                  current_state.allowed_transitions)
                                - policies (all policies where case.case_type is in
                                  applicable_case_types)
                                - risk

  POST /cases/{case_id}/notes              add a caseworker note. Update case.last_updated.
  PATCH /cases/{case_id}/status?new_status=X
                                           validate against current_state.allowed_transitions;
                                           return 400 if not allowed.
  GET /cases/dashboard/risk?assigned_to=X  group by risk level for team leader view.
                                           Excludes closed cases. Returns stats dict with
                                           total_open, total_escalation_due, total_reminder_due,
                                           by_case_type counts.
  GET /cases/policies/?case_type=X         filter policies by case type.
  GET /cases/workflow/{case_type}          all workflow states for a case type.

Register the router in main.py. Use Depends(get_db) for sessions.

Keep functions small. Pre-cache awaiting_evidence workflow states per case_type when
computing risk across a list (avoid N+1).
```

**Verify**: hit `/docs`, try `GET /cases`, `GET /cases/CASE-2026-00042`,
`PATCH /cases/CASE-2026-00042/status?new_status=closed` (expect 400).

---

## Phase 3 — Applicant lookup + submission

**Goal**: close the "third user" gap — applicants can look up their own case and submit
new ones.

**Prompt**:
```
Read backend/routes/cases.py and backend/schemas.py.

Add two things:

1. In backend/routes/cases.py, add:

   GET /cases/by-reference/{reference}

   Looks up by applicant_reference OR case_id. Returns an ApplicantStatusOut with:
   - case_id, case_type, status, status_label (WorkflowState.label), status_description,
     applicant_name, created_date, last_updated
   - timeline (the seeded events)
   - evidence_outstanding: true if status == "awaiting_evidence"
   - evidence_message: different tone by risk level:
       ok          → "We have asked you for evidence. Please send it when you can."
       reminder    → "We are still waiting for evidence from you. Please send it as soon as possible."
       escalation  → "We have not yet received the evidence we asked for. Your case has been
                      referred to a team leader. Please contact us urgently."
     None for non-awaiting statuses.
   - what_happens_next: current workflow state's description.

   MUST NOT include assigned_to, caseworker_notes, or ai_summary.
   404 if not found.

   Add ApplicantStatusOut to schemas.py.

2. Create backend/routes/upload.py with /upload/submit:

   POST /upload/submit  (multipart form)
     applicant_name (required)
     case_type (required, must be benefit_review|licence_application|compliance_check; else 400)
     applicant_reference (optional)
     applicant_dob (optional)
     summary (optional — becomes case_notes)
     files (list[UploadFile], optional)

   Behaviour:
   - Generate case_id: CASE-{year}-{5-char uppercase uuid hex}
   - Insert case with status="case_created"
   - Add a case_created timeline event with today's date
   - Save files to /app/uploads/ with prefix {case_id}_
   - If files were uploaded, add an evidence_received timeline event listing filenames
   - Return {case_id, status, files_received}

Register both routes in main.py.
```

**Verify**: `curl -X POST -F "applicant_name=Test" -F "case_type=benefit_review"
localhost:8000/upload/submit` returns a new case_id. Then
`curl localhost:8000/cases/by-reference/<that-id>` shows it.

---

## Phase 4 — Frontend shell + queue + detail

**Goal**: caseworker core journey. Queue → open case → see workflow + policy + timeline
on one screen.

**Prompt**:
```
Read backend/routes/cases.py to learn the API shapes, then look at frontend/src/App.jsx
for the current shell.

Create frontend/src/api.js — a thin fetch wrapper with functions for every endpoint we
built: getRoot, getCases(params), getCase(id), addNote, transitionStatus,
getRiskDashboard, getPolicies, getWorkflow, getApplicantStatus, submitCase (multipart),
aiSummarise, aiAskStream (EventSource-based).

Rewrite frontend/src/App.jsx:
- Black GOV.UK header with user switcher (3 mock users)
- Tabs: Submit case, Check my case, Cases queue, Risk dashboard
- PROTOTYPE banner
- AI mode badge (live|mocked) — fetch from GET / on mount
- Route to the component matching the current tab
- When a case is opened, swap to CaseDetail

Create frontend/src/components/CaseQueue.jsx:
- Filter bar: case_type dropdown, status dropdown, risk dropdown, search box
- Table: case ID (monospace), applicant, type, status tag, risk pill (Escalate/Remind/OK),
  last updated, assigned team (team leader only)
- Caseworker role: auto-filter by their team (j.patel→team_a, r.singh→team_b, m.khan sees all)
- Click row → open case

Create frontend/src/components/CaseDetail.jsx:
- Back button, title (applicant name), meta line (case id · case type · reference)
- Risk banner at top (red/orange/green based on risk.level) with the reason
- AI brief button (fires /ai/cases/{id}/summarise, shows mocked|live badge on response)
- Three-column grid (stacks on mobile):
  1. Case summary + timeline (vertical timeline with blue left border) + caseworker notes
     with add-note form
  2. Workflow position: current state label + description + required_actions checklist +
     transition buttons from allowed_states (POST patch on click, reload on success)
  3. Applicable policy panel: collapsible <details> per policy, showing policy_id + title
     + body
- Below the grid: AI chat panel with SSE streaming. Messages bubble left/right.
  "[DONE]" closes stream.

Use Tailwind utility classes and the govuk-* palette. No state management library —
just useState/useEffect.
```

**Verify**: open `localhost:3000`, click a case, see the three panels populate. Click a
transition button, confirm status changes. Add a note, confirm it persists.

---

## Phase 5 — Dashboard, applicant portal, upload form

**Goal**: finish the three UIs.

**Prompt**:
```
Read backend routes and frontend/src/api.js first.

Create frontend/src/components/RiskDashboard.jsx:
- Four stat cards: Open cases, Escalation due, Reminder due, Case types count
- "Open by case type" strip showing counts per type
- Two sections: "Escalation due" (red) and "Reminder due" (orange), each rendering a
  table of cases. Empty state: green success box when no risk cases.
- Team leader sees all teams, caseworkers see only their team.

Create frontend/src/components/ApplicantPortal.jsx:
- Lookup form: single text input for reference (accepts REF-* or CASE-*)
- On success:
  - Big "Your case reference" card with case ID and case_type + applicant name
  - Current status label (blue)
  - If evidence_outstanding: orange "Action needed from you" panel with evidence_message
  - Timeline: "What's happened so far" — the same vertical-blue-border pattern
  - Green "What happens next" panel with what_happens_next text
- 404 → red error box

Create frontend/src/components/UploadPortal.jsx:
- Case type dropdown (the three valid types)
- Name/organisation, reference (optional), DOB (optional), summary textarea
- Drag-and-drop file picker, file list with remove buttons
- Submit → show green confirmation with case_id, link to open the case

Wire all three components into App.jsx's nav.
```

**Verify**: submit a case via the form, immediately look it up in the applicant portal
by its ID. Open the dashboard as m.khan — should see escalation/reminder buckets.

---

## Phase 6 — AI layer with mock fallback

**Goal**: AI briefs and case chat. Works with or without an API key.

**Prompt**:
```
Read backend/models.py, backend/risk.py, and backend/routes/cases.py first so you
understand the data shapes passed to the AI layer.

Create backend/ai_pipeline.py with two entry points:

  summarise_case(case, timeline, caseworker_notes, current_state, policies, risk) -> dict
    returns {summary, key_points, next_action, mocked: bool}

  ask_about_case_stream(case, timeline, notes, current_state, policies, risk, question)
    async generator yielding text chunks

Both functions check ANTHROPIC_API_KEY:
  - If set: call Claude Haiku 4.5 (model="claude-haiku-4-5-20251001"). Summary uses
    a JSON-output prompt and parses the JSON. Streaming uses client.messages.stream().
  - If not set: deterministic template-based fallback grounded in the case + risk +
    workflow. Mock summary's next_action comes from current_state.required_actions[0] if
    available. Mock stream yields in 40-character chunks to simulate streaming.

Both paths take identical arguments and return the same shape. Always set mocked field.

System prompt: "You are an assistant for UK government caseworkers working on one of
three case types: benefit_review, licence_application, or compliance_check. Be factual.
Only use information in the provided case record."

Build context string with: case metadata, status, risk flag, case notes, timeline, any
caseworker notes, current workflow state + required actions, applicable policy extracts
with their IDs.

Create backend/routes/ai.py:

  POST /ai/cases/{case_id}/summarise    → calls summarise_case, returns AISummaryOut,
                                           saves summary to case.ai_summary.
  GET  /ai/cases/{case_id}/ask/stream   → StreamingResponse with SSE frames
                                           "data: {chunk}\n\n" plus "data: [DONE]\n\n"
                                           sentinel.

In main.py GET /, return ai_mode: "live" if ANTHROPIC_API_KEY else "mocked" so the
frontend can badge it.

The frontend CaseDetail should already consume these — just wire them up if not.
```

**Verify without key**: click "AI brief" — should return a grounded mock summary with
`mocked: true` badge. Ask a question in chat — should stream mock response in chunks.
**With key**: same behaviour but `mocked: false` and real Claude output.

---

## Phase 7 — Tests

**Goal**: 60+ tests, ~5 second run, in-memory SQLite with StaticPool.

**Prompt**:
```
Read backend/risk.py, backend/routes/cases.py, backend/routes/ai.py, and
backend/ai_pipeline.py first.

Create backend/requirements-dev.txt that includes requirements.txt plus
pytest==8.3.3 and pytest-asyncio==0.24.0.

Create backend/pytest.ini with:
  [pytest]
  testpaths = tests
  pythonpath = .
  asyncio_mode = auto

Create backend/tests/conftest.py:
- Before importing models, set DATABASE_URL=sqlite:// and ANTHROPIC_API_KEY="" in os.environ.
- Session-scoped fixture that swaps models.engine with a new engine using StaticPool
  and check_same_thread=False, then creates all tables. Drops on teardown.
- Autouse function-scoped fixture that truncates every table after each test.
- Provide a `db` fixture yielding a fresh SessionLocal().
- Provide a `seeded` fixture that inserts a deterministic dataset:
  - Workflow states for benefit_review (reminder 28 / escalation 56) and
    licence_application (reminder 14 / escalation 30). Both full state machines.
  - Two policies (POL-BR-003 for benefit_review, POL-LA-001 for licence_application).
  - Five cases covering edges:
    CASE-OK        awaiting_evidence, request 10 days ago → ok
    CASE-REM       awaiting_evidence, request 30 days ago → reminder_due (benefit)
    CASE-ESC       awaiting_evidence, request 60 days ago → escalation_due
    CASE-CLOSED    closed
    CASE-LIC       licence_application, request 20 days ago → reminder_due (licence)
- Provide a `client` fixture returning TestClient(app) — DO NOT use with-statement so
  lifespan seed doesn't run.

Write these test files:

tests/test_risk.py — pure unit tests using SimpleNamespace (no DB). Cover: non-awaiting
short-circuits, no evidence request, exact reminder boundary, between thresholds, exact
escalation boundary, past escalation, multiple requests (uses latest), missing workflow
state, no thresholds, future-dated request, fixed-today determinism. ~15 tests.

tests/test_cases_routes.py — integration tests via TestClient + seeded. Cover: list with
every filter (case_type, status, risk levels, assigned_to, search), detail includes
workflow+policy+risk, timeline, transitions (allowed/disallowed/from-closed/404), notes
(create/updates last_updated/404), dashboard stats and team filter, policies endpoint,
workflow endpoint (valid + 404). ~20 tests.

tests/test_applicant.py — lookup by ref, by case_id, 404, status_label mapping,
information-hiding (no assignee/notes fields in response), all three urgency messages
(ok/reminder/escalation), closed-case handling, timeline included. ~10 tests.

tests/test_upload.py — invalid case_type (400), missing required field (422), happy path
creates case+timeline, case retrievable afterwards. ~4 tests.

tests/test_ai_mock.py — mock summarise returns mocked=true, includes applicant name,
surfaces risk reason, next_action from workflow, handles missing workflow, handles empty
timeline/notes. Mock ask_stream: is async, yields multiple chunks, includes question and
required actions. ~7 tests.

Run `pytest -q` and fix anything that fails.
```

**Verify**: `cd backend && pip install -r requirements-dev.txt && pytest -q`. Expect
all green in under 5 seconds.

---

## Phase 8 — Polish + demo prep

**Goal**: ready to demo.

**Prompt**:
```
Final polish:

1. Update CLAUDE.md at repo root to describe the project, architecture, module layout,
   env vars, demo users (j.patel, r.singh, m.khan — password demo123), and a list of
   demo case references to use when presenting.

2. Update README.md with a short problem statement, quick-start, and a "What's real vs
   mocked" section honestly listing which parts are mocked.

3. Add a demo script in docs/DEMO.md — a 3-minute walkthrough:
   - 30s: problem framing (caseworker spends day gathering info, team leader has no
     view, applicant waits weeks with no update)
   - 60s: caseworker journey — open queue, filter to escalation_due, open CASE-2026-00214,
     point out risk banner, workflow panel with required actions, matched policy, AI brief
   - 45s: team leader journey — open dashboard, show buckets, click an escalated case
   - 30s: applicant journey — open "Check my case", enter REF-77291, show timeline + status
   - 15s: wrap — "all data synthetic, AI has a mock fallback, honest about what's real"

4. Sanity check: docker compose down -v && docker compose up --build. Walk the full
   journey. Fix anything broken.
```

**Verify**: walk the demo script cold. Time yourself.

---

## Shortcuts — Claude Code slash commands

These live in `.claude/commands/` and run as `/command-name`:

- `/generate-cases N` — generate N more synthetic cases matching the schema
- `/add-case-type NAME` — add a fourth case type end-to-end (policies, workflow, sample
  cases, UI labels)
- `/demo-check` — pre-demo sanity pass (tests, boot, key flows)
- `/seed-reset` — tear down volume and rebuild
- See `.claude/agents/hackathon-builder.md` for a heavier implementer agent

---

## Timing estimates (your mileage will vary)

| Phase | Rough time with Claude Code |
|-------|------------------------------|
| 0 — Scaffold | 15 min |
| 1 — Data model + seed | 25 min |
| 2 — Risk + cases routes | 40 min |
| 3 — Applicant + upload | 20 min |
| 4 — Frontend shell + queue + detail | 60 min |
| 5 — Dashboard + applicant + upload UI | 30 min |
| 6 — AI with mock | 30 min |
| 7 — Tests | 40 min |
| 8 — Polish | 20 min |
| **Total** | **~4.5 hours** |

This fits in a single hackathon day with time for debugging and demo rehearsal.

---

## Tips for running the phases

- **Start each phase in a fresh Claude Code session** to keep context clean.
- **Read the files named in "Files to read first"** — tell Claude to read them before it
  writes. That's what the prompts assume.
- **Verify after each phase** before moving on. A broken phase contaminates the next.
- **When Claude over-builds**, stop it and say "delete the abstraction, do the minimal
  thing." The prompts are written to discourage this, but mileage varies.
- **If you're running out of time**, skip Phase 7 (tests). Everything else is demo-critical.
