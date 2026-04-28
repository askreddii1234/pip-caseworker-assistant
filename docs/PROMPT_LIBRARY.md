# Prompt Library — Caseworker Assistant

Reusable prompts that produced this project and can produce a similar one in another domain. Each section: **Purpose** (when to use), **Inputs** (what to paste in alongside), and the **Prompt** itself. Prompts are written for Claude Code with this repo open, but work in any AI coding tool.

Companion documents:
- [`PRD.md`](./PRD.md) — what we built and why.
- [`REBUILD_PLAYBOOK.md`](./REBUILD_PLAYBOOK.md) — phased rebuild recipe.

---

## Section 1 — Discovery & scoping

### 1.1 Turn a problem brief into a PRD

**Purpose**: convert an unstructured challenge brief into a structured PRD before any code.
**Inputs**: paste the raw problem statement.

```
Read the problem brief I've pasted below. Produce a PRD with these sections:
Problem, Users (with volume + core need), Goals, Non-goals, Scope (in/out),
User stories per user type, Functional requirements (numbered), Non-functional
requirements (stack, boot time, data policy, design), Success metrics that a
demo judge could verify in under 5 minutes, Risks & mitigations.

Rules:
- Non-goals must be explicit — name things we are NOT doing.
- Every functional requirement must be independently verifiable.
- Success metrics must be observable, not subjective ("user feels informed" is
  not acceptable; "dashboard shows ≥1 case per risk bucket" is).

[paste brief]
```

### 1.2 Identify the smallest viable slice

**Purpose**: carve a demo-sized MVP out of an ambitious PRD.

```
Given the PRD at docs/PRD.md, identify the smallest slice that still proves the
core thesis. Output three lists:
1. Must-build (without this, the demo doesn't land)
2. Nice-to-have (impressive but skippable)
3. Defer (will look like scope creep tomorrow)

For each item in list 1, state the single screen or endpoint that proves it.
```

---

## Section 2 — Architecture

### 2.1 Produce a one-line architecture

**Purpose**: force a crisp architectural statement before opening an editor.

```
Based on the PRD at docs/PRD.md, write the architecture as ONE paragraph.
Include: frontend stack, backend stack, database, optional AI layer, and the
data-flow direction. Then list exactly the tables you will create and what
lives as a JSON column instead of a junction table. Bias toward fewer tables.
```

### 2.2 Decide mock-vs-live for AI

**Purpose**: make the AI dependency explicit and swappable.

```
I need the AI features (summarisation + grounded Q&A) to work identically
whether or not an API key is available. Propose a design where:
- A single module owns the decision (env var present → live, else mock)
- The mock is deterministic and grounded in the same context a live call would
  receive
- The frontend shows a visible badge indicating which path is active
- Swapping providers (Claude → another model) is a one-file change

Show me the file layout and the public function signature.
```

---

## Section 3 — Data & domain modelling

### 3.1 Generate synthetic cases

**Purpose**: produce realistic seed data matching an existing schema.
**Existing slash command**: `/generate-cases N`

```
Generate N more synthetic cases that match the schema in data/cases.json
exactly. Rules:
- Case IDs continue from the highest existing ID
- Mix across all existing case types with realistic distribution
- Timelines must be internally consistent (no evidence_received before
  evidence_requested)
- Dates must land within the last 120 days relative to {today}
- Vary risk states: some ok, some reminder_due, some escalation_due
- No real names — use synthetic but plausible UK names
- Preserve all required fields including submission_payload for specialist
  case types

Append to data/cases.json. Do not rewrite existing entries.
```

### 3.2 Add a new case type end-to-end

**Purpose**: extend the platform to a new domain without forking the codebase.
**Existing slash command**: `/add-case-type NAME`

```
Add a new case type called {NAME} to this project. Preserve the existing
generic experience — do not clutter the UI for other case types.

Changes required, in order:
1. data/workflow-states.json — add state machine entry (states, transitions,
   required_actions, reminder_days, escalation_days)
2. data/policy-extracts.json — add 3–5 policy extracts for this case type
3. data/cases.json — add 5 sample cases covering varied statuses and risk
4. backend/schemas.py — extend specialist fields if needed
5. backend/recommendations.py — add rules for this case type if behaviour
   differs from default
6. frontend/src/components/CaseDetail.jsx — add specialist panel gated by
   case_type equality check
7. frontend/src/components/CaseQueue.jsx — ensure filter dropdown picks up
   new type

Run the tests after. Do not modify unrelated case types.
```

### 3.3 Derive reference thresholds from published standards

**Purpose**: make data credible — ground it in real documents.

```
I need a DATA_SPEC.md that documents the thresholds driving my RAG bands.
The rule: every threshold cites a published standard (CIBSE, WHO, UK NAQS,
ONS, etc.). Output a Markdown document with:
- One table per measure
- Threshold rows with units and source citation
- A "Composite index" section explaining how individual measures combine
- A "Seasonal patterns" section that a data consumer would expect

Do not invent numbers. If you don't have a source, mark it TODO and move on.
```

---

## Section 4 — Backend implementation

### 4.1 Risk as a pure function

**Purpose**: keep the load-bearing logic deterministic and auditable.

```
Write backend/risk.py as a pure function. Signature:
    compute_risk(case: Case, workflow: WorkflowState, today: date) -> Literal["ok","reminder_due","escalation_due"]

Rules:
- No database calls. Caller fetches inputs.
- No randomness, no wall-clock reads — today is injected for testability.
- Only cases in awaiting_evidence can be non-ok.
- Compare days since most recent evidence_requested event against
  workflow.reminder_days and workflow.escalation_days.
- Return escalation_due if past escalation threshold, else reminder_due if
  past reminder threshold, else ok.

Add a unit test file that covers: no evidence_requested event, within both
thresholds, past reminder only, past escalation, case not in awaiting_evidence.
```

### 4.2 Stream AI output via SSE

**Purpose**: get responsive UX on long LLM calls without WebSockets.

```
Expose GET /ai/cases/{case_id}/ask/stream as a Server-Sent Events endpoint.

Requirements:
- Accept a `q` query param with the user's question.
- Fetch the case + matched policies, build a grounded prompt.
- If ANTHROPIC_API_KEY is set, stream tokens from Claude Haiku 4.5.
- If not set, stream a deterministic mock response in chunks to preserve UX.
- On error, emit a single event with type="error" and a plain-text message —
  do not leak stack traces.
- CORS must allow the Vite dev origin.

Frontend: consume via EventSource and append chunks to the chat panel.
```

### 4.3 Grounded prompt construction

**Purpose**: prevent hallucination by scoping what the model can reference.

```
Write the system prompt for the case Q&A feature. Constraints:
- The model may only reference: the case record, its timeline, the matched
  policy extracts, and the workflow definition.
- If the user asks something not answerable from that context, the model
  must say so and suggest what would be needed.
- The model must never invent a policy reference, case ID, or person's name.
- Output format: plain text, short paragraphs. No markdown headers.
- Tone: neutral, professional, civil-service register.
```

---

## Section 5 — Frontend

### 5.1 Specialist panel gated by case type

**Purpose**: extend the detail view without breaking generic cases.

```
In frontend/src/components/CaseDetail.jsx, add a specialist panel for
case_type === "{NAME}". Rules:
- Panel must only render when case_type matches — zero DOM impact for other
  types.
- Reuse the existing Tailwind classes and GOV.UK colour tokens from App.jsx.
- Data source: case.submission_payload (JSON).
- Include a visible severity chip and urgency flag if present.
- Do not duplicate the timeline or policy panels — those remain shared.
```

### 5.2 AI-mode badge

**Purpose**: be honest with the judge about what's live vs. mocked.

```
Show a badge in the app header indicating AI mode. Source of truth: the
root GET / endpoint returns { ai_mode: "live" | "mocked" }.

Rules:
- Fetch once on app load.
- Live → green pill labelled "AI: live (Claude Haiku)".
- Mocked → amber pill labelled "AI: mocked".
- On fetch failure, show a grey pill labelled "AI: unknown" — do not crash.
```

---

## Section 6 — Testing & verification

### 6.1 Smoke-test the happy paths

**Purpose**: catch regressions before a demo.
**Existing slash command**: `/demo-check`

```
Run pytest in backend/. Then boot the stack with docker compose and verify:
1. GET / returns 200 with ai_mode field
2. GET /cases returns the seeded cases
3. GET /cases/CASE-2026-00042 returns workflow + policy + risk
4. Dashboard route returns all four risk buckets
5. Frontend loads at localhost:3000 without console errors

Report each check as PASS/FAIL with the observed response. Do not fix
anything — just report.
```

### 6.2 Pre-demo sanity pass

**Purpose**: final check against the exact flow you'll demo.

```
Pretend you are a hackathon judge with 5 minutes. Walk through the demo
script in order and flag anything that would embarrass us:
- Broken link
- Empty state we forgot to style
- AI mode badge wrong or missing
- Risk pill showing "ok" on a case that should be escalation_due
- Any console error in the browser
- Any route returning 500

Report a punch list, ordered by visibility to the judge.
```

---

## Section 7 — Demo preparation

### 7.1 Draft a 3-minute demo script

**Purpose**: turn the prototype into a rehearsed narrative.

```
Write a 3-minute demo script for a hackathon judge. Structure:
1. Hook (15s) — the problem in one sentence, the promise in one sentence
2. Caseworker flow (60s) — open CASE-2026-00042, point at timeline,
   workflow, policy, risk; ask the AI a grounded question
3. Team leader flow (30s) — risk dashboard, escalation bucket
4. Generalisation proof (45s) — air quality case + school sensor cross-link
5. Close (15s) — what's live, what's mocked, what we'd do with another week

For each beat, write the click path AND the exact sentence to say out loud.
```

### 7.2 Anticipate judge questions

**Purpose**: avoid getting caught flat-footed in Q&A.

```
Based on this prototype, generate the 10 hardest questions a hackathon judge
might ask. For each, write:
- The question
- The ideal 2-sentence answer
- The file or endpoint to point at if they want proof

Cover: problem framing, AI strategy, hallucination, scalability, privacy,
what's mocked, weakest part, scope, future work, and the commercial angle.
```

---

## Section 8 — Air quality specialist workflow

These prompts specifically produce the school air quality (`air_quality_concern`) features — specialist intake, RAG-banded sensor dashboard, rules-based recommendations, and case-to-school cross-linking.

### 8.1 Design the 8-section intake form

**Purpose**: specialist submission form for parents / staff / school admins reporting air quality concerns, without cluttering the generic case intake.

```
Build a React intake component AirQualityIntake.jsx for case_type
"air_quality_concern". 8 sections, rendered as a single scrollable form
with visible section headers (GOV.UK style):

1. Submitter information
   - submitter_name (required)
   - submitter_role (Parent | Student | Teaching Staff | Facilities Staff
     | Admin Staff | Other)
   - contact_email (required, validated)
   - contact_phone (optional)

2. Location
   - school_name (required, typeahead from seeded list of 5 schools)
   - building_location_room (required)

3. Incident details
   - incident_datetime (required, ISO)
   - issue_category (Odor | Dust/Particles | Mold/Moisture | Chemical
     Smell | Poor Ventilation | Temperature Issues | Other)
   - detailed_description (required, min 50 chars — show live counter)

4. Health impact
   - symptoms (multi-select: headache, cough, eye irritation, breathing
     difficulty, dizziness, nausea, skin irritation, none)
   - affected_count (integer, default 1)
   - duration (free text)

5. Environmental observations
   - observations (multi-select: visible mould, condensation, unusual
     smell, dust build-up, damaged walls, broken ventilation, none)

6. Severity
   - severity_level (Low | Medium | High | Critical) — default Medium
   - urgency (boolean toggle, default false)

7. Evidence uploads
   - photos/videos (optional, metadata only for the prototype)
   - supporting_documents (optional)

8. Related cases
   - related_incidents (free text, optional — plain list of prior case IDs)

On submit:
- POST to /cases/air-quality
- Show a confirmation card with the new case ID (format
  AQT-YYYY-MM-XXXXX), a copyable link to the detail page, and a "Submit
  another" button.

Reuse existing Tailwind tokens. Do NOT introduce a new design system.
```

### 8.2 Specialist detail panel (gated by case type)

**Purpose**: render extra air-quality panels on the shared case detail screen without polluting other case types.

```
In frontend/src/components/CaseDetail.jsx, add a specialist panel that
renders only when case.case_type === "air_quality_concern".

Panel contents, in this order:
1. Summary card — school + room/location, issue_category, severity chip
   (colour-coded), URGENT flag (if is_urgent), current status
2. Incident description — full detailed_description
3. Symptoms & impact — badge list of selected symptoms, affected_count,
   duration
4. Environmental observations — badge list
5. Evidence panel — thumbnails or filename list (stubbed is fine)
6. Recommended next actions — call GET /cases/{id}/recommended-actions
   and render each action as a checklist item with rationale at the bottom

Rules:
- Zero DOM impact for other case types
- Reuse timeline, notes, policy panels from the shared layout
- Severity chip colours: Critical=red, High=orange, Medium=yellow, Low=grey
- If recommendations endpoint returns applicable=false, hide the
  recommendations block entirely
```

### 8.3 Rules-based recommendations engine

**Purpose**: deterministic next-action engine for air quality cases — no LLM, fully auditable.

```
Write backend/recommendations.py. Public function:
    recommend(case: Case) -> dict

Contract:
- If case.case_type != "air_quality_concern" → return
  { applicable: False, actions: [], rationale: "..." }
- Otherwise return { applicable: True, severity_level, issue_category,
  actions: [...], rationale: "..." }

Rules (tier 1 — severity):
- Critical → always prepend four CRITICAL_ACTIONS:
  1. Contact submitter by telephone today (email alone not acceptable)
  2. Close affected area until qualified assessor attends site
  3. Escalate to team leader same working day (POL-AQ-004)
  4. Issue holding update to school leadership within 2 hours
  Then extend with first 2 category-specific high-severity actions.
- High → category-specific actions from BY_CATEGORY_HIGH. If category
  unknown, fall back to 3 generic actions.
- Medium → category-specific from BY_CATEGORY_MEDIUM, generic fallback.
- Low → LOW_ACTIONS: log for monitoring, 7-working-day inspection,
  acknowledge submitter.

Rules (tier 2 — modifiers):
- If affected_count >= 5 AND category in {Mold/Moisture, Chemical Smell}
  → append "Review whether severity should be upgraded (POL-AQ-001)".
- If case.is_urgent AND severity != Critical → append
  "Submitter flagged urgent — confirm triage severity with team leader".

Category-specific actions must be realistic and reference the correct
policy (POL-AQ-002 for mould, POL-AQ-003 for ventilation, POL-AQ-004 for
critical escalation, POL-AQ-005 for temperature).

No LLM calls. Pure Python. Add unit tests covering each severity tier and
both modifiers.
```

### 8.4 Generate the school air quality sensor dataset

**Purpose**: produce realistic, SAMHE-compatible synthetic sensor data. Must be grounded in published standards — no invented numbers.

```
Generate data/mock_school_air_quality.json covering 5 UK schools × 36
months (Apr 2023 – Mar 2026). Structure:

{
  "metadata": {
    "description": "...",
    "generated_date": "...",
    "period_from": "2023-04",
    "period_to": "2026-03",
    "total_months": 36,
    "measures_description": { co2_ppm: "...", ... },
    "notes": "..."
  },
  "schools": [
    {
      "urn": "100023",
      "name": "Oakfield Primary School",
      "samhe_monitor_id": "SAMHE-LA351-001",
      "address": { line1, line2, town, postcode },
      "local_authority": "...",
      "local_authority_code": "...",
      "region": "North West",
      "school_type": "Community School",
      "phase": "Primary",
      "ofsted_rating": "Requires Improvement",
      "ofsted_rating_numeric": 3,
      "pupil_count": 412,
      "building_era": "1960s",
      "building_condition": "D - Poor",
      "notes": "Near busy road, damp issues",
      "air_quality_monthly": [ ...36 entries... ]
    },
    ... 4 more
  ]
}

School archetypes (must be reflected in readings):
1. Oakfield Primary — 1960s, Grade D, near busy road → elevated NO2 +
   PM, damp (high winter humidity)
2. St Mary's CE Primary — 1980s, Grade C, partial HVAC upgrade 2019 →
   moderate CO2, improving trend from 2019
3. Greenwood Academy — 2015 build, Grade A, MVHR ventilation → best AQ
   in set; lowest CO2
4. Riverside Community Primary — 1990s, Grade C, winter condensation →
   humidity >70% Dec/Jan
5. Northgate Secondary — 1970s, Grade D, 1,240 pupils, no HVAC →
   highest CO2, frequently exceeds 1500ppm

Monthly reading fields (all required):
- month (YYYY-MM)
- co2_ppm, temperature_c, humidity_pct, pm2_5_ugm3, pm10_ugm3,
  tvoc_ugm3, no2_ugm3
- air_quality_index (1-5, composite — worst of CO2/PM2.5/NO2 bands)
- school_in_session (false for Jul/Aug, true otherwise)

Seasonal patterns:
- Jan–Feb: peak CO2 + PM (heating on, windows closed)
- Mar–Apr: improving
- May–Jun: good (windows open)
- Jul–Aug: low (school_in_session=false, minimal occupancy)
- Sep–Oct: rising
- Nov–Dec: approaching winter peak

Thresholds for the composite AQI (do NOT invent — use CIBSE TM21 / BB101
for CO2, WHO AQG 2021 for PM, UK NAQS for NO2):
- 1 Excellent: CO2<800, PM2.5<5, NO2<15
- 2 Good: CO2<1000, PM2.5<10, NO2<25
- 3 Moderate: CO2<1200, PM2.5<15, NO2<35
- 4 Poor: CO2<1500, PM2.5<20, NO2<45
- 5 Very Poor: any of CO2>=1500, PM2.5>=20, NO2>=45

Output must parse as valid JSON and match the schema documented in
data/DATA_SPEC.md.
```

### 8.5 Author the data specification

**Purpose**: produce `DATA_SPEC.md` so every RAG threshold in the app is traceable to a real standard.

```
Write data/DATA_SPEC.md documenting the mock_school_air_quality.json
schema. Required sections:

1. Overview table — file, format, coverage, period, granularity, sensor
   style (SAMHE-compatible)
2. Top-level structure — JSON shape
3. `metadata` object fields
4. `schools` array — identity, address, administrative, school
   characteristics, building fields. Include allowed values.
5. Building condition grades (DfE PSDS scale A–D) with descriptions
6. `air_quality_monthly` fields with units
7. Reference thresholds — one table per measure, citing the source:
   - CO2: CIBSE TM21 / BB101
   - PM2.5 & PM10: WHO Air Quality Guidelines 2021
   - NO2: UK NAQS annual legal limit
   - Temperature: CIBSE / BB101 classroom range
   - Humidity: optimal / too dry / mould growth risk
8. Composite air quality index definition (1–5, worst-of rule)
9. Seasonal patterns table
10. Schools-in-dataset summary table

Every numeric threshold must cite its source. If a threshold has no
published source, mark it TODO — do not invent.
```

### 8.6 RAG-banded pollutant helpers

**Purpose**: convert raw sensor readings into caseworker-friendly RAG bands, % of threshold, certainty, trend, next actions, and source citations.

```
In backend/school_air_quality.py, expose helpers that turn a monthly
reading into a display-ready row. For each measure, output:

{
  "measure": "CO2",
  "value": 1340,
  "unit": "ppm",
  "rag": "amber",
  "pct_of_threshold": 89,
  "threshold_cited": 1500,
  "certainty": "high",
  "trend": "rising",
  "actions": ["Deploy CO2 monitor for 48h", ...],
  "sources": ["CIBSE TM21", "BB101"]
}

RAG band rules (reuse from DATA_SPEC.md — do not duplicate numbers):
- CO2: green <1000, amber 1000–1500, red >=1500
- PM2.5: green <=5, amber 5–15, red >15
- PM10: green <=15, amber 15–45, red >45
- NO2: green <=25, amber 25–40, red >40
- Temperature: green 18–23, amber 16–18 or 23–28, red <16 or >28
- Humidity: green 40–60, amber 30–40 or 60–70, red <30 or >70

Additional helpers:
- pct_of_threshold(value, threshold) → rounded int
- certainty — "high" when >=6 consecutive months of data, "medium"
  >=3 months, "low" otherwise
- trend — compare last 3 months vs prior 3 months: "rising", "falling",
  "stable" (within 5% band)
- actions — pulled from a small map keyed by (measure, rag)
- sources — citation strings matching DATA_SPEC

No external calls. Pure Python. Cover with unit tests including edge
cases (missing months, single reading, exactly on threshold).
```

### 8.7 Parent-facing schools dashboard

**Purpose**: public view of sensor data for the 5 schools, with cross-links to any case reports against that school.

```
Build frontend/src/components/SchoolsAirQuality.jsx. Layout:

Left sidebar (fixed width):
- List of 5 schools with URN, name, region, building condition badge
- Click to select; selection persisted in URL query string (?urn=...)

Main area:
- School header: name, address, phase, pupil count, Ofsted rating,
  building era + condition
- Pollutant table: one row per measure (CO2, temperature, humidity,
  PM2.5, PM10, TVOC, NO2, AQI). Columns: current value, RAG badge,
  % of threshold, certainty, trend arrow, recommended actions
  (collapsed, expand on click), sources (as tooltip or footnote)
- Trend chart: 36-month sparkline for the selected measure
- Linked cases panel: list of air_quality_concern cases where
  submission_payload.school_name matches the selected school. Each
  item is a row with case_id, incident_datetime, severity chip,
  current status, linking to the case detail page

Data sources:
- GET /air-quality/schools — sidebar list
- GET /air-quality/schools/{urn} — main view data
- GET /cases?case_type=air_quality_concern — to filter linked cases

Design: GOV.UK palette. Mobile-responsive (sidebar collapses to
dropdown below 768px). No external charting library — use inline SVG
for the sparkline.
```

### 8.8 Cross-link cases to schools

**Purpose**: bind subjective reports to objective sensor data — the core credibility move.

```
When a case of type air_quality_concern is created, the intake sets
submission_payload.school_name. Add:

1. Backend: in GET /air-quality/schools/{urn}, include a
   `linked_cases` array of cases whose submission_payload.school_name
   matches this school. For each, include case_id, incident_datetime,
   severity_level, is_urgent, status, and a short description preview
   (first 120 chars).

2. Frontend: in SchoolsAirQuality.jsx, render linked_cases as a panel
   beneath the pollutant table. Each row opens the case detail in the
   caseworker UI (same tab).

3. Conversely, in CaseDetail.jsx for an air_quality_concern case, add
   a "View school sensor data" link that deep-links to
   /schools-air-quality?urn={matching_urn}. Resolve the URN by looking
   up the school_name in the seeded list.

Seed data rule: the school_name values in
data/cases.json[air_quality_concern cases] MUST exactly match the
names in mock_school_air_quality.json. If you generate new cases, pick
from the existing 5 school names — never invent a new school.
```

### 8.9 Air quality dashboard block for team leader

**Purpose**: extend the team-leader dashboard with AQ-specific KPIs.

```
Extend RiskDashboard.jsx and the GET /dashboard response with an
air_quality block:

Backend:
{
  "air_quality": {
    "by_severity": {"Critical": n, "High": n, "Medium": n, "Low": n},
    "by_school": [{"school_name": "...", "open_cases": n,
                   "highest_severity": "..."}],
    "workload_by_officer": [{"officer": "...", "open_cases": n,
                             "critical_count": n}],
    "high_risk_schools": [{"school_name": "...", "reason": "..."}],
    "sla_breaches": n
  }
}

Rules for high_risk_schools:
- School has >=2 open AQ cases with severity in {High, Critical}, OR
- School's latest sensor AQI is 5 (Very Poor), OR
- School is the subject of a recurring-mould case (3rd+ in 12 months)

Frontend:
- Render the block below the generic risk buckets
- Severity split as a stacked bar
- By-school as a sortable table (click column header to sort)
- High-risk schools as red-bordered cards with the reason string
- Officer workload as a bar chart, critical count highlighted
```

### 8.10 Seed 10 realistic air quality cases

**Purpose**: produce demo-ready AQ cases covering the full severity / status / school spectrum.

```
Append 10 air_quality_concern cases to data/cases.json. Requirements:

- Case IDs continue from highest existing; use CASE-2026-XXXXX format
- Mix of severities: 2 Critical, 3 High, 3 Medium, 2 Low
- Mix of is_urgent: 4 urgent, 6 not urgent (but all Critical are urgent)
- Mix of statuses: 1 case_created, 3 awaiting_evidence, 2 under_review,
  1 pending_decision, 2 escalated, 1 closed
- Mix of categories across all 7 issue categories
- school_name MUST match one of the 5 seeded schools exactly
- Every timeline event internally consistent (no evidence_received
  before evidence_requested)
- Dates within the last 120 days of today
- submission_payload populated with all 8 intake sections

Must include these flagship demo cases (use these exact IDs):
- CASE-2026-00401 — escalated, Critical + URGENT — chemical spill in
  school prep room, Northgate Secondary
- CASE-2026-00402 — awaiting_evidence, High — mould in primary
  classroom with asthmatic pupils, Oakfield Primary
- CASE-2026-00406 — escalated, High + URGENT — recurring mould, 3rd
  instance in 12 months, Riverside Community Primary
- CASE-2026-00409 — case_created, Critical + URGENT — just-submitted
  cleaning-product incident, St Mary's CE Primary

No real PII. Use synthetic but plausible UK names. Do not modify the
existing generic cases.
```

### 8.11 Air quality policies

**Purpose**: produce policy extracts matching the recommendations engine's citations (POL-AQ-001..005).

```
Append 5 policy extracts to data/policy-extracts.json:

POL-AQ-001 — Triage severity rules
  applicable_case_types: [air_quality_concern]
  body: when to upgrade Medium→High or High→Critical; covers affected
  count thresholds, vulnerable pupils, recurring incidents

POL-AQ-002 — Inspection SLAs
  Mould: 5 working days (High), 5 (Medium), 7 (Low)
  Chemical smell: same-day (High+), 1 day (Medium)
  Ventilation: 5 working days (CO2 assessment)
  Dust: 3 working days post-works

POL-AQ-003 — Poor ventilation handling
  CO2 assessment protocol, 48-hour monitor deployment, temporary
  mitigation options (reduced capacity, windows, scheduling)

POL-AQ-004 — Critical escalation protocol
  Same-working-day escalation to team leader, telephone contact with
  submitter, close affected space, holding update to school leadership
  within 2 hours

POL-AQ-005 — Temperature / overheating
  Classroom range 18–23°C per BB101; <16°C too cold; >28°C overheating
  threshold for learning spaces; logger deployment for 48 hours

Each extract: realistic paragraph, no boilerplate. Total length
~150–250 words per policy.
```

---

## Section 9 — Meta / agents

### 9.1 Delegate a focused build

**Purpose**: use a subagent when a task is well-specified and you don't need to hand-hold.
**Existing agent**: `hackathon-builder`

```
Agent(subagent_type="hackathon-builder"):
"Implement Phase {N} of docs/REBUILD_PLAYBOOK.md. Read CLAUDE.md and the
playbook phase first. Match existing patterns. Verify with the concrete
check defined in the phase. Report what's done + what's deferred + any
surprise you hit."
```

### 9.2 Pre-commit review

**Purpose**: last-line check before the demo.

```
Review the uncommitted changes on this branch. Flag:
- Secrets or keys accidentally committed
- Console.log or print statements left in
- TODOs that would be visible to a judge
- Dead imports or unused files

Do not fix — just list. One line per issue with file:line.
```

---

## How to adapt this library to a different domain

1. Replace the domain nouns in Section 3 (cases → claims / applications / tickets).
2. Re-derive thresholds in Section 3.3 for your new domain's standards.
3. Keep Sections 1, 2, 4.1, 4.2, 4.3, 5.2, 6, 7, 8 almost verbatim — they are domain-independent.
4. The one-file AI swap (Section 2.2) means you can pilot any model without rewriting the app.
