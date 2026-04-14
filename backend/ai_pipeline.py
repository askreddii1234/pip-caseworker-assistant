import anthropic
import os
import json
from typing import AsyncGenerator

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

MODEL = "claude-haiku-4-5-20251001"

PIP_SYSTEM_CONTEXT = """You are an AI assistant for UK DWP PIP (Personal Independence Payment) caseworkers.
PIP has 12 activities: 10 daily living (preparing food, taking nutrition, managing therapy,
washing/bathing, managing toilet needs, dressing/undressing, communicating verbally,
reading/understanding, engaging with others, making budgeting decisions) and 2 mobility
(planning/following journeys, moving around).
Each activity has descriptors scored 0-12 points. Daily living: standard rate = 8-11 points,
enhanced = 12+ points. Mobility: standard = 8-11, enhanced = 12+.
You must be factual, cite evidence, and never make up information not in the case data."""


def _build_claim_context(claim, notes, evidence, activity_scores, descriptors) -> str:
    ctx = f"""## Claim: {claim.id}
- Claimant: {claim.claimant_name}
- DOB: {claim.date_of_birth or 'Unknown'}
- Claim type: {claim.claim_type}
- Status: {claim.status}
- Primary condition: {claim.primary_condition or 'Not specified'}
- Additional conditions: {claim.additional_conditions or 'None'}
- Medication: {claim.medication or 'Not specified'}
- Created: {claim.created_at.strftime('%d %B %Y')}

## Assessment Notes
"""
    for note in notes:
        ctx += f"[{note.created_at.strftime('%d/%m/%Y %H:%M')}] {note.author}: {note.content}\n\n"

    ctx += "\n## Evidence\n"
    for ev in evidence:
        status = "Received" if ev.received else "MISSING"
        ctx += f"- {ev.document_type}: {status}"
        if ev.description:
            ctx += f" — {ev.description}"
        if ev.ai_extracted_text:
            ctx += f"\n  Extracted content: {ev.ai_extracted_text[:500]}"
        ctx += "\n"

    if activity_scores:
        ctx += "\n## Current Activity Scores\n"
        for score in activity_scores:
            ctx += f"- {score.activity_name} ({score.activity_category}): "
            if score.ai_suggested_points is not None:
                ctx += f"AI suggests {score.ai_suggested_points} points"
                if score.ai_reasoning:
                    ctx += f" — {score.ai_reasoning}"
            if score.confirmed_by_caseworker:
                ctx += f" [CONFIRMED: {score.points} points]"
            ctx += "\n"

    if descriptors:
        ctx += "\n## PIP Scoring Descriptors (applicable)\n"
        for d in descriptors:
            ctx += f"Activity {d.activity_number}: {d.activity_name} — {d.descriptor_letter}. {d.descriptor_text} ({d.points} points)\n"

    return ctx


def summarise_claim(claim, notes, evidence, activity_scores, descriptors) -> dict:
    context = _build_claim_context(claim, notes, evidence, activity_scores, descriptors)

    response = client.messages.create(
        model=MODEL,
        max_tokens=800,
        system=PIP_SYSTEM_CONTEXT + """
Given a PIP claim file, produce:
1. A concise 3-sentence summary of the claim and key evidence.
2. Suggested daily living total score (0-36) based on evidence.
3. Suggested mobility total score (0-24) based on evidence.
4. Risk level: "high" (SLA at risk or complex case), "medium", or "low".
5. One-sentence risk reasoning.

Respond ONLY in JSON:
{"summary": "...", "daily_living_score": N, "mobility_score": N, "risk_level": "...", "risk_reasoning": "..."}""",
        messages=[{"role": "user", "content": f"Summarise this PIP claim:\n\n{context}"}],
    )

    text = response.content[0].text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
        return {"summary": text, "daily_living_score": 0, "mobility_score": 0, "risk_level": "medium", "risk_reasoning": "Parse error"}


def detect_gaps(claim, notes, evidence, activity_scores, descriptors) -> dict:
    context = _build_claim_context(claim, notes, evidence, activity_scores, descriptors)

    response = client.messages.create(
        model=MODEL,
        max_tokens=500,
        system=PIP_SYSTEM_CONTEXT + """
Analyse the PIP claim evidence and identify:
1. Missing documents that are needed for a complete assessment.
2. Specific recommended next actions for the caseworker.

Respond ONLY in JSON:
{"missing": ["..."], "recommendations": ["..."]}""",
        messages=[{"role": "user", "content": f"Analyse evidence gaps:\n\n{context}"}],
    )

    text = response.content[0].text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
        return {"missing": [], "recommendations": [text]}


async def ask_about_claim_stream(claim, notes, evidence, activity_scores, descriptors, question: str) -> AsyncGenerator[str, None]:
    context = _build_claim_context(claim, notes, evidence, activity_scores, descriptors)

    with client.messages.stream(
        model=MODEL,
        max_tokens=800,
        system=PIP_SYSTEM_CONTEXT + "\nAnswer the caseworker's question using ONLY the case data provided. Be concise and actionable.",
        messages=[{"role": "user", "content": f"Case context:\n\n{context}\n\nQuestion: {question}"}],
    ) as stream:
        for text in stream.text_stream:
            yield text
