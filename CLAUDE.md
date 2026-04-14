# PIP Caseworker Assistant

AI-powered prototype to reduce PIP (Personal Independence Payment) assessment backlogs.
Built for the Version 1 AI Engineering Lab Hackathon, April 2026.

## Problem
DWP PIP clearance times hit 20 weeks in January 2026 (DWP told Parliament it was 16).
84,300 people waited 6+ months. 4,600 waited over a year. The assessment provider step
takes 15 of the 20 weeks. PAC says DWP has "no adequate short-term plan to improve this."

## Solution
Two-sided prototype:
1. **Claimant portal** — upload PIP2 form, GP letters, ID. Track claim status.
2. **Caseworker dashboard** — AI-summarised claims queue, pre-scored PIP activities,
   evidence gap detection, streaming AI assistant for case questions.

## Architecture
- **Frontend**: React 18 + Tailwind CSS (GOV.UK design language)
- **Backend**: FastAPI (Python 3.12)
- **Database**: PostgreSQL 16 (via Docker)
- **AI**: Anthropic Claude API (claude-haiku-4-5-20251001 for speed)
- **Infra**: Docker Compose (local development)

## Commands
- `docker compose up --build` — start full stack
- `docker compose down -v` — tear down and reset data
- Backend API docs: http://localhost:8000/docs
- Frontend: http://localhost:3000

## Project structure
```
backend/
  main.py           — FastAPI app, CORS, lifespan seed
  models.py         — SQLAlchemy models (pip_claims, activity_scores, evidence, pip_descriptors, users)
  schemas.py        — Pydantic request/response schemas
  ai_pipeline.py    — Claude API integration (summarise, score, gaps, ask, stream)
  seed_data.py      — loads synthetic data from /data on startup
  routes/
    claims.py       — CRUD endpoints for /claims
    ai.py           — AI endpoints: /ai/claims/{id}/summarise, /gaps, /ask, /ask/stream
    upload.py       — file upload endpoint for claimant documents

frontend/
  src/
    App.jsx         — main layout, nav, user switcher
    api.js          — fetch wrapper for all API calls
    components/
      ClaimQueue.jsx     — sortable claims table with filters
      ClaimDetail.jsx    — full claim view with notes, evidence, AI panel
      AIAssistant.jsx    — streaming chat panel for case questions
      RiskDashboard.jsx  — team leader backlog/risk overview
      UploadPortal.jsx   — claimant document upload page

data/
  claims.json           — 6 synthetic PIP claims (no real PII)
  pip_descriptors.json  — 12 PIP activity scoring descriptors from GOV.UK
```

## Conventions
- All API responses use JSON
- AI streaming uses Server-Sent Events (SSE) at /ai/claims/{id}/ask/stream
- No real PII anywhere — all data is synthetic
- GOV.UK design patterns: phase banner, black header, structured forms
- PIP has 12 activities: 10 daily living + 2 mobility, each scored 0-12 points
- Standard rate = 8+ points, Enhanced rate = 12+ points

## Key env vars
- ANTHROPIC_API_KEY — required for AI features
- DATABASE_URL — auto-set by docker compose
- VITE_API_URL — frontend API base URL

## Mock users (password: demo123)
- j.patel (caseworker)
- r.singh (caseworker)  
- m.khan (team leader)
