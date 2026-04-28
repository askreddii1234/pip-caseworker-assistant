# Product Requirements Document — Caseworker Assistant

**Status**: Hackathon prototype (Version 1 AI Engineering Lab, April 2026)
**Challenge**: Challenge 3 — Supporting casework decisions
**Author**: askreddii1234
**Last updated**: 2026-04-16

---

## 1. Problem

Caseworkers across government spend a significant proportion of their day on information-gathering rather than decision-making. A typical case requires opening 3–4 systems (case management, policy guidance, email, evidence log) and reading weeks of unstructured notes before the caseworker can act. Team leaders have no system-level view of cases nearing breach. Applicants wait weeks with no meaningful status.

The information already exists — it is just scattered. This is a **surfacing problem, not a capacity problem**.

## 2. Users

| User | Volume | Core need |
|---|---|---|
| **Caseworker** | 20–40 live cases | Understand a new case in under a minute; know the required next action; apply the correct policy |
| **Team leader** | 200–300 across a team | See which cases are at risk of breach; know where capacity is under pressure |
| **Applicant / submitter** | 1 case | Know where their case is in the process without making a phone call |

## 3. Goals

1. Reduce time-to-first-action on a new case by surfacing timeline, policy, workflow state, and risk on one screen.
2. Give team leaders a real-time view of reminder-due and escalation-due cases, segmented by team.
3. Give applicants a self-service status page keyed to case reference.
4. Demonstrate the pattern generalises across case types (benefit review, licence application, compliance check, specialist intakes).

## 4. Non-goals

- Automated decision-making. The system surfaces information — humans decide.
- Replacing existing case management systems. This is a decision-support layer.
- Integrating with live departmental systems. All data is synthetic.
- Building our own LLM. AI is a pluggable component.

## 5. Scope

### In scope (built)

- Four case types: `benefit_review`, `licence_application`, `compliance_check`, `air_quality_concern`
- Shared workflow state machine with per-case-type transitions, required actions, and escalation thresholds
- Deterministic risk calculation (days-since-evidence-requested vs. policy threshold)
- Rules-based policy matcher
- Rules-based recommendations engine (air quality)
- AI summariser + grounded Q&A (live Claude Haiku 4.5 or deterministic mock, toggled by env var)
- Three UIs: caseworker queue + detail, team leader dashboard, applicant portal
- Specialist school air quality sensor dashboard (5 schools × 36 months × 8 measures)

### Out of scope (explicitly)

- Authentication beyond a mock user switcher
- File storage for uploaded evidence (metadata only)
- Notifications (email/SMS to applicants)
- Cross-department policy federation
- Multi-language support
- Accessibility audit (GOV.UK patterns followed but not WCAG-audited)

## 6. User stories

### Caseworker
- As a caseworker, when I open a case I see its full timeline, current workflow state, required next action, and the matched policy extract on one screen.
- As a caseworker, I can ask a natural-language question about the case and receive an answer grounded strictly in the case record and policy.
- As a caseworker, I see a visible risk flag (ok / reminder due / escalation due) so I can prioritise without guesswork.

### Team leader
- As a team leader, I see a dashboard of all cases segmented by risk bucket and team.
- As a team leader, for air quality cases I see severity breakdown, workload by officer, and which schools are highest risk.

### Applicant / submitter
- As an applicant, I can submit a case via a structured form and receive a case reference.
- As an applicant, I can look up my case by reference and see plain-language status.

### Specialist (school air quality)
- As a parent, I can view live-style sensor readings for a school with RAG bands driven by published standards (CIBSE, WHO AQG, UK NAQS).
- As a caseworker investigating a complaint, I can cross-reference the complaint against the school's objective sensor trend.

## 7. Functional requirements

### FR-1 Case management
- Create, list, filter, and view cases across all four case types.
- Case detail shows timeline (from `case_timeline`), notes (from `caseworker_notes`), and submission payload.

### FR-2 Workflow engine
- State machine definition lives in `data/workflow-states.json` — one entry per case type.
- Each state defines allowed transitions and required actions.
- UI shows current state, the required action, and which transitions are legal from here.

### FR-3 Risk calculation
- Pure function in `backend/risk.py`.
- For cases in `awaiting_evidence`: days since most recent `evidence_requested` event vs. workflow's `reminder_days` / `escalation_days`.
- Returns one of `ok`, `reminder_due`, `escalation_due`.

### FR-4 Policy matching
- Policies matched by `case_type`. For air quality, additionally by `issue_category` and `severity_level`.
- Rules-based — transparent and auditable.

### FR-5 AI integration
- Endpoint: `POST /ai/cases/{id}/summarise` — one-shot grounded summary.
- Endpoint: `GET /ai/cases/{id}/ask/stream` — SSE-streamed Q&A.
- When `ANTHROPIC_API_KEY` is set → live Claude Haiku 4.5.
- When unset → deterministic mock that produces same response shape from case record.
- Root `GET /` returns `ai_mode: live | mocked` — frontend displays a visible badge.

### FR-6 Air quality specialist workflow
- 8-section intake form (submitter, location, incident, health impact, observations, severity, evidence, related cases).
- Case detail renders extra panel only when `case_type == air_quality_concern`.
- Recommendations engine produces rules-based next actions keyed to severity + category.

### FR-7 School sensor dashboard
- 5 UK schools, 36 months of monthly averages, 8 measures.
- RAG bands driven by `data/DATA_SPEC.md` thresholds (not invented).
- Each submitted AQ case cross-links to the school's sensor trend.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Stack | FastAPI + Postgres 16 + React 18 + Tailwind + Docker Compose |
| Boot | `docker compose up --build` produces a demo-ready stack in under 3 minutes |
| Data | 100% synthetic — no real PII anywhere |
| Design | GOV.UK visual patterns (phase banner, black header, structured forms) |
| API | JSON for all responses; SSE for streamed AI output |
| AI cost | Must run at zero cost via the mock path; live mode is opt-in |
| Extensibility | Adding a case type = edit 3 JSON files + one UI conditional |

## 9. Success metrics (demo)

- A judge can boot the stack and open a case in under 5 minutes.
- For any demo case, the caseworker sees timeline, workflow, policy, and risk on one screen without scrolling a second system.
- Team leader dashboard shows at least one case in each risk bucket.
- AI mode badge is visible and accurate.
- Air quality case cross-links correctly to its school's sensor trend.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM unavailable during demo | Mock path is deterministic and visibly signposted via `ai_mode` badge |
| Data looks fake | Thresholds, case structure, and timelines modelled on real standards (CIBSE, WHO, UK NAQS); cited in `DATA_SPEC.md` |
| Scope creep during demo | Four case types fixed; specialist features gated to `air_quality_concern` only |
| Hallucination in AI responses | Prompts restrict answers to supplied case + policy context; refuse otherwise |

## 11. Architecture (one line)

React 18 → FastAPI (stateless, SQLAlchemy 2) → Postgres 16. Optional Claude Haiku 4.5 branch through `ai_pipeline.py` with a deterministic mock fallback. Five tables, JSON columns for `allowed_transitions` / `required_actions` / `applicable_case_types` — no junction tables.

## 12. Open questions

- Does the real deployment target sit behind a departmental SSO (Azure AD, GovOne Login)?
- Which policy extraction pipeline feeds the policy store in production (manual curation vs. document ingestion)?
- What is the audit-logging requirement for AI-generated summaries shown to caseworkers?

## 13. Appendix — file map

```
backend/
  main.py, models.py, schemas.py, risk.py, recommendations.py
  school_air_quality.py, ai_pipeline.py, seed_data.py
  routes/ — cases, ai, upload, air_quality, school_air_quality
frontend/src/
  App.jsx, api.js
  components/ — CaseQueue, CaseDetail, RiskDashboard,
                UploadPortal, AirQualityIntake, ApplicantPortal,
                SchoolsAirQuality
data/
  cases.json, policy-extracts.json, workflow-states.json
  mock_school_air_quality.json, DATA_SPEC.md
```
