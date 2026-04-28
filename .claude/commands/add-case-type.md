---
description: Add a fourth case type end-to-end (policies, workflow, sample cases, UI labels)
argument-hint: "<case_type_name>"
---

Add a new case type `$ARGUMENTS` end-to-end across the stack.

Before touching any code, ask me for the following inputs:
1. Display label (e.g. "passport_application" → "Passport application")
2. Which states from the standard set apply: case_created, awaiting_evidence, under_review, pending_decision, escalated, closed — plus any extra states specific to this type
3. Reminder threshold (days) and escalation threshold (days) for the awaiting_evidence state
4. At least three policy extract themes (e.g. "Eligibility", "Evidence requirements", "Decision process")
5. Whether applicants are individuals, organisations, or both

Then, in order:

**Backend**:
1. Add states to `data/workflow-states.json` under `case_types.<new_type>` following the exact shape of the existing types (states array with allowed_transitions, required_actions, escalation_thresholds where relevant).
2. Add 3-4 policy extracts to `data/policy-extracts.json` with `policy_id` in a new prefix (e.g. POL-PA-001...).
3. Add 2-3 sample cases to `data/cases.json` with this case_type, covering different statuses and at least one evidence-overdue case.
4. In `backend/routes/upload.py`, add the new case type to `VALID_CASE_TYPES`.

**Frontend**:
5. In `frontend/src/components/CaseQueue.jsx`, add the new type to the `CASE_TYPES` label map.
6. In `frontend/src/components/CaseDetail.jsx`, same — add to `CASE_TYPES`.
7. In `frontend/src/components/UploadPortal.jsx`, add an entry to `CASE_TYPES` array.
8. In `frontend/src/components/ApplicantPortal.jsx`, add to `CASE_TYPE_LABELS`.

**Tests** (if tests exist):
9. Add a sample case for the new type to the `seeded` fixture in `tests/conftest.py`.
10. Add one assertion to `test_cases_routes.py` confirming filtering by the new type works.

**Verify**:
11. Tell me to run `docker compose down -v && docker compose up --build` to re-seed.
12. Point me at a URL to test the new type (queue filter + detail view + applicant lookup of one of the new sample cases).

No placeholder data — every field must be plausible for the case type I described.
