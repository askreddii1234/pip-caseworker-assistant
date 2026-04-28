---
description: Generate N more synthetic cases matching the existing schema, append to data/cases.json
argument-hint: "<number_of_cases>"
---

Generate $ARGUMENTS more synthetic cases and append them to `data/cases.json`.

Requirements:
1. Read `data/cases.json` first so you match the existing structure exactly.
2. Read `data/workflow-states.json` so statuses align with defined states.
3. Read `data/policy-extracts.json` so case notes can reference realistic scenarios.
4. Each generated case MUST:
   - Have a unique `case_id` in format `CASE-2026-XXXXX` (5-digit number, don't collide with existing IDs)
   - Pick `case_type` from: benefit_review, licence_application, compliance_check
   - Pick `status` from the valid states for its case_type
   - Have a plausible applicant (individual with DOB for benefit_review; organisation with null DOB for licence_application/compliance_check)
   - Have `assigned_to` as team_a, team_b, or team_c
   - Have `created_date` and `last_updated` as ISO dates in 2026 (last_updated >= created_date)
   - Have a timeline with 2-6 events whose dates are between created_date and last_updated, in chronological order, with realistic `event` names (case_created, evidence_requested, evidence_received, under_review, pending_decision, escalated, closed, consultation_opened, site_visit, inspection_completed)
   - Have case_notes of 2-4 sentences telling a coherent story matching the timeline
5. Cover a mix of risk profiles — include at least one case whose latest evidence_requested is >56 days before last_updated (triggers escalation), at least one 28-56 days (reminder), and at least one well within threshold or not awaiting evidence.
6. Append to the existing JSON array — don't replace.
7. After writing, run `docker compose down -v && docker compose up --build` if the stack is running, OR tell me to do that so the seeder picks up the new cases.

No real PII — synthetic names only. British names/places preferred to match the domain.
