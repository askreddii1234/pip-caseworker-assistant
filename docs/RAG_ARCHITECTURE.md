# RAG Architecture — School Air Quality Tracker

Audience: data architects and demo reviewers.
Scope: the BM25-based retrieval-augmented generation layer added in
`backend/rag.py` and wired into the AI summarise / Q&A endpoints.

---

## 1. What RAG is — and the problem it solves

**Retrieval-Augmented Generation** combines two systems:

1. A **retriever** that searches a corpus of trusted documents and returns
   the passages most relevant to a query.
2. A **generator** (an LLM) that produces an answer *conditioned on* those
   passages.

It exists to solve four concrete LLM weaknesses:

| Problem | What RAG does about it |
|---------|------------------------|
| Training data is frozen and general | Inject current, domain-specific documents at query time |
| LLMs hallucinate plausible falsehoods | Constrain answers to the retrieved evidence; refuse when nothing matches |
| LLMs cannot cite their sources | Attach provenance to every retrieved chunk; model echoes citation markers |
| Fine-tuning is expensive and slow | Update the corpus instead of the model |

For a casework decision-support system, RAG is the only acceptable
architecture: every answer must be defensible, current, and auditable.

---

## 2. The four pipeline stages

```
                    ┌─────────────┐    ┌─────────────┐
                    │   Source    │    │  Source     │
                    │ document A  │    │ document B  │
                    └──────┬──────┘    └──────┬──────┘
                           │                  │
                           ▼                  ▼
        ┌──────────────────────────────────────────────────┐
   (1)  │  INGESTION    parse · validate · attach metadata │
        └──────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────────────┐
   (2)  │  CHUNKING     split into retrieval units          │
        │               carry doc metadata into each chunk  │
        └──────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────────────┐
   (3)  │  INDEXING     build retrieval data structure      │
        │               (inverted index, vector index, …)   │
        └──────────────────────────────────────────────────┘
                           │
        ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
        runtime
        ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                           │
        user query         │
        ────────────────►  ▼
        ┌──────────────────────────────────────────────────┐
   (4a) │  RETRIEVAL    score chunks against query          │
        │               filter by ACL / tags                │
        │               return top-k                        │
        └──────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────────────┐
   (4b) │  GENERATION   compose prompt = system + case +    │
        │                              chunks + question    │
        │               LLM streams answer with [KB-N]      │
        │                              citation markers     │
        └──────────────────────────────────────────────────┘
```

---

## 3. How this app implements each stage

| Stage | File | Function |
|-------|------|----------|
| Ingestion | `backend/rag.py` | `_parse_frontmatter()` reads YAML header, returns `(meta, body)` |
| Chunking  | `backend/rag.py` | `_split_by_heading()` then `_size_cap()` (max 280 words, 40 overlap) |
| Indexing  | `backend/rag.py` | `build_index()` tokenises, builds in-memory `BM25Okapi` |
| Retrieval | `backend/rag.py` | `retrieve(query, top_k, case_type)` — filter then rank |
| Generation| `backend/ai_pipeline.py` | `_format_kb()` injects chunks as `[KB-N]` blocks; `summarise_case` and `ask_about_case_stream` call the model |
| Wiring    | `backend/routes/ai.py` | `_summary_query()` builds retrieval query; SSE emits `event: sources` ahead of the answer |
| UI        | `frontend/src/components/CaseDetail.jsx` | `renderWithCitations()` parses `[KB-N]`; `<SourcesPanel>` renders provenance |

Build is triggered once on app startup from `backend/main.py:lifespan`,
which calls `rag.build_index()` after the database seed.

---

## 4. Data model

This is the part most relevant to a data architect. The RAG layer
introduces three new logical entities and connects them to the existing
operational entities.

### 4.1 Logical model

```
   ┌────────────────────┐         ┌────────────────────┐
   │  Source Document   │ 1   * ──┤      Chunk         │── *  1 ┐
   │  (KB document)     │         │                    │        │
   ├────────────────────┤         ├────────────────────┤        │
   │ doc_id   PK        │         │ chunk_id  PK       │        │
   │ title              │         │ doc_id    FK ──────┘        │
   │ publisher          │         │ heading_path                │
   │ year               │         │ text                        │
   │ url                │         │ token_count                 │
   │ applies_to[]       │         │ ordinal (within doc)        │
   │ source_hash        │         │ embedding (vector RAG only) │
   │ ingested_at        │         └────────────────────┘
   │ version            │                    │
   └────────────────────┘                    │
                                             │ ranked at query time
                                             ▼
                                    ┌────────────────────┐
                                    │  Retrieval Result  │
                                    ├────────────────────┤
                                    │ chunk_id   FK      │
                                    │ score              │
                                    │ rank               │
                                    │ retrieved_at       │
                                    │ for_query (hash)   │
                                    └────────────────────┘

   Operational entities (already exist):
   ┌────────────┐    ┌────────────┐    ┌────────────────┐
   │   Case     │    │  Policy    │    │ AI Interaction │
   │            │    │ (POL-AQ-…) │    │ (logged Q&A)   │
   └────────────┘    └────────────┘    └────────────────┘
                            │                  │
                            └─────cites────────┤ (chunk_id, doc_id)
                                               │
   Chunk ─── cited_by ────────────────────────┘
```

**Key design point**: a Chunk has its document's metadata *denormalised
into it* (title, publisher, year, url) so a retrieval result is a complete
citable unit on its own. This is deliberate — at retrieval time you almost
always need the metadata, and it removes a join on the hottest path.

### 4.2 Source Document — the ingestion contract

Authoritative metadata travels with the document via YAML frontmatter:

| Field | Type | Purpose |
|-------|------|---------|
| `doc_id` | string, unique | Stable identifier; used in `[KB-N]` resolution and citation links |
| `title` | string | Displayed in the Sources panel |
| `publisher` | string | Provenance — DfE, WHO, HSE, internal |
| `year` | integer | Currency check; informs trust scoring |
| `url` | URL | Citation back-link for the user |
| `applies_to` | list of case types | **Access/relevance filter** — drives query-time scoping |
| `source_hash` | sha256 *(future)* | Detect content change between rebuilds |
| `version` | semver *(future)* | Track edits to the same authoritative doc |
| `classification` | enum *(future)* | OFFICIAL / OFFICIAL-SENSITIVE / restricted to roles |

In this prototype the file's mtime + content hash would be enough; in a
production system, treat each source document as a versioned record with
an audit trail (who ingested it, when, from which upstream system).

### 4.3 Chunk — the retrieval unit

Schema (`KbChunk` dataclass in `backend/rag.py`):

| Field | Type | Notes |
|-------|------|-------|
| `chunk_id` | string `{doc_id}#{ordinal}` | Stable across rebuilds *if* chunker is deterministic |
| `doc_id` | string | FK to Source Document |
| `title`, `publisher`, `year`, `url` | string | Denormalised from doc — see 4.1 |
| `applies_to` | list[str] | Filter pushed down from doc |
| `heading_path` | string | "## Mould and damp" → context for the user |
| `text` | string | The retrievable content (≤280 words) |
| `score` | float | Set per-query; not stored |

**Sizing**: 280 words ≈ 350 tokens. Empirically, this is the sweet spot
for school-IAQ technical guidance — small enough that a returned chunk is
focused, large enough that one chunk usually carries the full answer.

**Overlap**: 40 words at section boundaries. Avoids splitting a definition
across chunks in a way that nukes BM25 recall.

**Stability**: chunk IDs are deterministic given the input file and
chunker config. If you change the chunker, IDs change — log this as a
breaking-change event for any downstream system that pinned a specific
chunk_id.

### 4.4 Index — physical storage

Two valid choices, with trade-offs:

| Property | BM25 (this app) | Vector (pgvector + embeddings) |
|----------|-----------------|--------------------------------|
| Storage | In-memory inverted index | Postgres table, ~1.5KB / chunk |
| Recall on paraphrase | Weak (literal terms) | Strong |
| Recall on rare terms | **Strong** (CO2, POL-AQ-004) | Mediocre unless reranked |
| Cost per query | Microseconds, free | ~$0.0001 (Voyage) + DB hit |
| Cold start | Rebuild on every restart (~1s for 30 docs) | Index persists |
| Determinism | Total — same query → same ranks | Embedding model version matters |
| Best for | Short corpora, exact-term casework | Long corpora, conceptual queries |

For schools indoor-air-quality guidance — small corpus, term-heavy
("PM2.5", "POL-AQ-004", "1500 ppm") — BM25 is genuinely competitive.
The architect's call is *not* "BM25 is amateur, vectors are professional":
it's "what does my retrieval distribution actually look like?"

### 4.5 Connection to operational data

The casework data model already has tight provenance: every workflow
transition is a timeline event, every decision can be traced. RAG fits in
without disturbing it:

- **Case (existing)** carries `case_type`. This is the *retrieval scope*.
  When the AI Q&A endpoint runs, `case.case_type` becomes a filter on
  Chunk.applies_to. Air quality cases see WHO/BB101/HSE; benefit review
  cases see DWP/HMRC guidance (when added).

- **Policy (existing)** is hand-curated, hand-attached. It is not
  retrieved by query — it's already attached deterministically to every
  case of its type. RAG complements it: policies are the *narrow,
  authoritative rules*, KB chunks are the *broader explanatory guidance*.

- **AI Interaction log (recommended add)** should record `(case_id,
  question, retrieved_chunk_ids[], answer, ai_mode, created_at)`. This
  gives you (a) auditability for any decision influenced by an AI brief
  and (b) the dataset to evaluate retrieval quality over time.

---

## 5. Standards & governance considerations

These are the questions a standards team should ask of any RAG system,
and how this app answers them today:

### 5.1 Provenance
- ✅ Every retrieved chunk carries publisher, year, URL.
- ✅ Citations are surfaced in the UI.
- ✅ The `KB-N` markers in the answer are linked to the sources panel.
- ⚠ Source content is not yet hashed — content drift between rebuilds
  is undetectable. **Recommendation**: add `source_hash` to frontmatter
  and verify on ingest.

### 5.2 Currency
- ✅ Each doc carries a `year` field.
- ⚠ No automated stale-doc check. **Recommendation**: alert when a doc
  is older than its publisher's review cycle (e.g., WHO AQG every 5y).

### 5.3 Access control
- ✅ `applies_to` filter prevents leak between case types.
- ⚠ No row-level ACL on chunks. **Recommendation**: extend frontmatter
  with `classification` + role-based filter at retrieval.

### 5.4 Citation integrity
- ⚠ Citations are model-generated; an LLM *can* hallucinate `[KB-99]`.
  **Recommendation**: post-hoc validate that every emitted `[KB-N]`
  marker corresponds to a chunk we actually returned. Strip invalid
  markers before display. (Mock mode is deterministic and safe.)

### 5.5 Auditability
- ⚠ Q&A interactions are not logged. **Recommendation**: add an
  `ai_interaction` table (case_id, question, retrieved_chunk_ids[],
  answer_text, model_id, ai_mode, latency_ms, user_id, ts).

### 5.6 Evaluation
- ⚠ No retrieval evaluation harness. **Recommendation**: a small set of
  golden queries with expected top-1 doc_id, run in CI. The smoke test
  in this branch is a manual version of that.

### 5.7 PII
- ✅ KB corpus is public guidance — no PII concern in retrieval.
- ✅ Case PII is not sent to the retriever (BM25 is local).
- ⚠ Case PII *is* sent to the LLM in live mode. **Recommendation**:
  before live-mode rollout, redact applicant names and references in the
  prompt context unless legally cleared.

### 5.8 Reproducibility
- BM25 retrieval is deterministic. Same query + same index = same ranks.
- Generation is non-deterministic by default. For audit, record the
  retrieved chunk IDs alongside the answer — even if the wording varies,
  the *evidence* is reproducible.

---

## 6. Operational characteristics

| Metric | This implementation |
|--------|---------------------|
| Corpus size | 5 documents, **28 chunks** |
| Index size | <100 KB in memory |
| Index build time | ~1 second on app startup |
| Query latency | sub-millisecond (BM25 over 28 docs) |
| End-to-end latency | dominated by LLM (1–5s in live mode) |
| Failure mode | Empty index → empty source list, generation continues without RAG |
| New dep | `rank-bm25==0.2.2` (pure Python, no native code) |

---

## 7. Upgrade path

When BM25 becomes the bottleneck (corpus >500 chunks, conceptual queries
where exact terms don't appear):

1. Add `pgvector` extension to Postgres.
2. Add `chunks` and `chunk_embeddings` tables (the schema in 4.1).
3. Embed at ingest time (Voyage `voyage-3` or local `bge-small-en-v1.5`).
4. Rewrite `retrieve()` as: vector top-50 → BM25 rerank top-5 → return.
   This **hybrid** approach captures the best of both.
5. Add a re-rank model (Cohere Rerank, or `bge-reranker-base`) for the
   final ordering.

The data model in section 4.1 already accommodates this — the only
addition is the `embedding` column on the chunk table.

---

## 8. Demo Q&A cheat sheet

Likely questions and crisp answers:

**Q: Is this a vector database?**
> No. It's BM25 — a classical sparse retriever. We chose it deliberately
> because the corpus is small and term-heavy (PM2.5, 1500 ppm,
> POL-AQ-004). For this scale, BM25 is faster, deterministic, free, and
> demonstrably accurate. The data model is forward-compatible with adding
> embeddings.

**Q: How do you stop the model hallucinating?**
> Three controls. The system prompt instructs the model to use only the
> case record and KB chunks provided. The chunks themselves carry
> citations — the model is asked to mark every borrowed claim with `[KB-N]`.
> In mock mode (no API key) the answer is deterministic, so demos are
> reproducible. The remaining gap — the model could *misuse* a citation —
> is mitigated by validating markers post-hoc.

**Q: Where is your knowledge base stored?**
> As markdown files under `data/knowledge_base/`, with YAML frontmatter
> for metadata. Each file is a logical Source Document. We chose flat
> files over a CMS because (a) review and version control via Git is
> exactly what a standards team needs, (b) frontmatter doubles as a
> validatable schema, (c) ingestion is one filesystem walk.

**Q: How do you keep it fresh?**
> Today, restart the app. The `ingested_at` and `version` fields exist in
> the data model; an incremental ingest endpoint is straightforward to
> add and is in the upgrade path.

**Q: What about access control?**
> `applies_to` provides per-case-type scoping. It's enforced at
> retrieval time — even if a chunk matches the query lexically, it is
> filtered out if its case-type set doesn't match. For role-level ACLs,
> a `classification` field in frontmatter and a role filter in
> `retrieve()` is the natural extension.

**Q: How do you evaluate retrieval quality?**
> A golden query set: ~20 hand-curated questions with the expected
> top-1 chunk_id. Run in CI on every change to the chunker, the corpus,
> or the BM25 parameters. We have a manual version of this in the smoke
> test today; formalising it is the next standards milestone.

**Q: Why these specific documents?**
> They are the four pillars cited in the existing app code:
> CIBSE TM21 / BB101 (UK schools), WHO AQG 2021 (health thresholds),
> HSE / COSHH (incident response), SAMHE (sensor interpretation). The
> RAG corpus is the *machine-readable form* of guidance that is already
> hardcoded into the threshold tables in `backend/school_air_quality.py`.

**Q: What's your data lineage from corpus to citation?**
> Source PDF → paraphrased markdown excerpt with frontmatter (manual,
> reviewed) → ingest at startup → chunked deterministically → indexed in
> memory → retrieved at query time → injected into prompt with `[KB-N]`
> marker → model emits marker in answer → frontend renders marker as
> a clickable pill linked to publisher URL. Every hop preserves the
> `doc_id`.

**Q: Can you swap the LLM?**
> Yes. The `MODEL` constant in `ai_pipeline.py` is the only place the
> model is named. The retrieval layer is model-agnostic — any LLM that
> takes a system prompt + user message can consume the formatted KB
> block. Mock mode is the proof: it consumes the exact same chunks and
> produces a deterministic answer without any model.

---

*Last updated: 2026-04-28. Owner: Caseworker Assistant team.*
