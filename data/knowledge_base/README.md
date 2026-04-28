# Knowledge base

This directory contains the corpus indexed by `backend/rag.py` for the AI
brief and Q&A on case detail screens. Each file is markdown with YAML
frontmatter providing source metadata.

## Status

These are **paraphrased synthesis documents** prepared for the hackathon
prototype. They are not verbatim copies of the underlying publications and
should not be treated as authoritative — they capture the substance of public
UK schools indoor-air-quality guidance for retrieval-augmented Q&A only.

For a production system, replace each file with the official text, retaining
the same frontmatter shape.

## Sources covered

| Doc ID | Origin | What it covers |
|--------|--------|----------------|
| `bb101` | DfE Building Bulletin 101 | Ventilation, CO2 thresholds, thermal comfort in schools |
| `who-aqg-2021` | WHO Global Air Quality Guidelines 2021 | PM2.5, PM10, NO2, O3 health-based thresholds |
| `cibse-tm21` | CIBSE Technical Memorandum (TM21/TM40) | Ventilation strategies and CO2 monitoring |
| `hse-schools-iaq` | HSE / COSHH | Chemical exposure response, evacuation, RIDDOR |
| `samhe-sensor` | SAMHE programme | Reading classroom sensor data, common patterns |

## Frontmatter schema

```yaml
---
doc_id: bb101                       # short stable id, used in [KB-N] citations
title: Building Bulletin 101 ...    # displayed in Sources panel
publisher: Department for Education
year: 2018
url: https://www.gov.uk/...         # clickable in UI
applies_to: [air_quality_concern]   # filters retrieval by case_type
---
```
