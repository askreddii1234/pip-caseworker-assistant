---
description: Pre-demo sanity pass — run tests, boot the stack, check key flows
---

Pre-demo sanity pass. Report a short punch list of "ready / broken / watch-out" items.
Under 250 words in your final reply.

Do these in parallel where possible:

1. **Tests**: run `cd backend && pytest -q`. Report pass count and any failures.

2. **Boot check**: check `docker compose ps` — are postgres, backend, frontend all running?
   If not, tell me to run `docker compose up --build` but don't do it yourself.

3. **Key endpoints** (only if backend is up):
   - `curl -s localhost:8000/health` → should be `{"status":"ok"}`
   - `curl -s localhost:8000/` → check `ai_mode` is set to "live" or "mocked"
   - `curl -s localhost:8000/cases | python -m json.tool | head -20` → should show cases
   - `curl -s localhost:8000/cases/dashboard/risk` → verify stats dict populated

4. **Demo data spot check**: confirm these demo references still exist and behave:
   - CASE-2026-00042 (benefit review, should be awaiting_evidence)
   - CASE-2026-00214 (benefit review, should be escalated)
   - CASE-2026-00107 (compliance check, should be escalated)
   - REF-77291 (applicant lookup should work and return CASE-2026-00042)

5. **AI mode**: confirm ANTHROPIC_API_KEY status matches what you plan to demo. Note it
   explicitly — "running in mocked mode" or "running against live Claude."

6. **Frontend spot check**: curl `localhost:3000` and verify a 200 OK. Don't parse HTML,
   just confirm it's serving.

Report format:
```
READY:
- <what's working>

BROKEN (fix before demo):
- <blocker with one-line fix suggestion>

WATCH-OUT:
- <minor risks, e.g. "mock mode — don't promise live AI in pitch">
```
