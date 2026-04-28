# Caseworker Assistant

Prototype for **Challenge 3: Supporting casework decisions** — Version 1 AI Engineering
Lab Hackathon, April 2026.

**Problem.** Caseworkers spend a large proportion of their day gathering information:
opening a case management system, finding the right policy document, checking whether
evidence has arrived, tracking deadlines. Time that could be spent on the judgement calls
that only a human can make.

**Solution.** One screen per case showing:
- the full timeline and notes
- where the case sits in its workflow and what action is required next
- the policy extracts that apply to this case type
- a risk flag when evidence has been outstanding past policy thresholds

A team-leader dashboard surfaces cases breaching reminder/escalation thresholds.
An optional AI layer (Claude, or a deterministic mock when no API key is set) briefs
caseworkers and answers questions grounded in the case record.

## Quick start

```bash
# Optional — without it, AI runs in mocked mode (still useful for demo)
export ANTHROPIC_API_KEY=sk-ant-your-key

docker compose up --build

# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
```

## Stack
- FastAPI + PostgreSQL
- Claude API (Haiku 4.5) — optional, mock fallback
- React + Tailwind CSS (GOV.UK design language)
- Docker Compose

## What's real vs mocked
- **Real** — case data, timeline, policy matching, workflow state machine, risk
  computation from evidence thresholds, transitions.
- **Mocked (by default)** — AI brief and ask-the-case chat. Set `ANTHROPIC_API_KEY`
  to run against a live model. Both paths are grounded in the same case+policy context.
