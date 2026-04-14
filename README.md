# PIP Caseworker Assistant

AI-powered prototype to reduce PIP (Personal Independence Payment) assessment backlogs.

**Problem:** DWP PIP clearance times hit 20 weeks in Jan 2026. 84,300 people waited 6+ months. The assessment step takes 15 of the 20 weeks. The PAC says DWP has "no adequate short-term plan."

**Solution:** Two-sided prototype — claimants upload documents via a portal, AI pre-processes and scores claims against PIP descriptors, caseworkers review with AI assistance.

## Quick start

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-your-key

# Start everything
docker compose up --build

# Open in browser
# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
```

## Built for

Version 1 AI Engineering Lab Hackathon — London, April 2026

## Stack

- FastAPI + PostgreSQL + Claude API (Haiku)
- React + Tailwind CSS (GOV.UK design)
- Docker Compose
