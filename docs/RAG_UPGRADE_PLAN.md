# Cortex RAG Upgrade — Implementation Plan

## Context

The current doc-analysis pipeline extracts text with `pdfjs-dist`/`mammoth` (flat text, no tables/OCR), chunks it with a naive fixed-size character splitter, embeds with OpenAI `text-embedding-3-small` (512-d), and stores/searches vectors in **Pinecone**. Retrieval is pure semantic similarity — weak on exact identifiers (`CASE-2024-001`, party names), with no reranking, no lexical search, and no evaluation to measure quality.

This plan upgrades the pipeline to: **Firecrawl** markdown extraction → **heading-adaptive chunking** with **per-document auto-selected strategy** → **Supabase pgvector** storage (consolidating with the existing Postgres) → **hybrid BM25 + vector retrieval** with a **custom local reranker**, **expanding-window** context, **HyDE** and **query decomposition** query transforms — all measured against a **golden-set precision/recall** harness that gates every change.

### Confirmed decisions
- **Reranker:** custom local hybrid scorer (no external API) — blends the normalized fused retrieval score with lexical term coverage/TF, exact phrase/n-gram overlap, high-value field matches, and query-intent alignment. Gated by `ENABLE_RERANK`.
- **Existing data:** re-ingest from scratch from original files in Supabase Storage (discard Pinecone data; old pdfjs chunks not migrated).
- **Tests:** mock external APIs (Firecrawl/OpenAI) for fast deterministic unit gates; a few opt-in integration tests run only when real keys are present.
- **"Auto select"** = a per-**document** strategy router (ingestion). **HyDE** = Hypothetical Document Embeddings (query transform).

### Current-state facts (from exploration)
- No test framework (only ESLint). `package.json` scripts: `dev/build/start/lint`, `db:*`. `@/*` → `./src/*`.
- Postgres via Prisma (`prisma/schema.prisma`, provider `postgresql`, `DATABASE_URL`+`DIRECT_URL`). **pgvector not enabled; no embedding columns.**
- `TEST_DATABASE_URL`/`TEST_DIRECT_URL` already referenced in `src/config/database.js`.
- Pinecone surface area (all must migrate):
  - `src/services/documentProcessor.js` — `initializePinecone`, `storeInPinecone` (L204), `searchDocuments` (L349), `storeCaseMetadataInPinecone` (L450), `deleteDocumentFromPinecone` (L544/557), `deleteCaseMetadataFromPinecone` (L523).
  - `src/app/api/cases/route.js` (L328) and `src/app/api/cases/[id]/route.js` (L291/383/450/460) — case-vector create/update/delete.
  - `src/app/api/documents/process/route.js` (L90) — delete on doc removal.
- Files already stored in Supabase Storage bucket `legal-documents` (`src/config/supabase.js`); raw files remain the source of truth for re-ingestion.

---

## Required environment variables (add before Task 1)

| Variable | Purpose | Notes |
|---|---|---|
| `FIRECRAWL_API_KEY` | Firecrawl `/v2/parse` document parsing | New |
| `DATABASE_URL`, `DIRECT_URL` | Postgres / pgvector | **Existing** — pgvector reuses these; no new connection var. Extension enabled via migration. |
| `TEST_DATABASE_URL`, `TEST_DIRECT_URL` | Test database | **Existing** — used by the test harness. |
| `OPENAI_API_KEY`, `SUPABASE_*` | Embeddings / storage | **Existing** |

Optional feature flags (added in Task 12, default off for safe rollout): `ENABLE_HYDE`, `ENABLE_QUERY_DECOMPOSITION`, `ENABLE_RERANK`.

---

## Working agreement
- **One task at a time.** A task is "done" only when its tests pass (`npm test` green for the task's suite). Do not start the next task until the current one is verified.
- Each task is a small, reviewable change. Commit per task (on a feature branch, not `main`).
- Retrieval-quality tasks (7–11) must **hold or beat** the golden-set baseline from Task 2 — that is their gate.
- **Every step logs its flow** (see Logging convention below) so the pipeline is observable end-to-end while building and debugging.

## Logging convention
Every task must add **step-level logging** so the flow is traceable in the console. Requirements:
- Use a small shared logger helper `src/services/logger.js` (wraps `console`, supports namespaces + timing) rather than scattered `console.log`. Each stage logs under a namespace, e.g. `[firecrawl]`, `[chunking]`, `[pgvector]`, `[retrieval:bm25]`, `[retrieval:vector]`, `[rerank]`, `[hyde]`, `[eval]`.
- For each step log: **start** (inputs/sizes — never secrets/PII values), **result** (counts + timing in ms), and **errors** (with context). Examples:
  - `[firecrawl] parsing CASE-2024-001 doc (pdf, 482KB) → ok, 6,214 chars markdown in 1,840ms`
  - `[chunking] heading-adaptive: 6,214 chars → 9 chunks (avg 690, tables kept: 1) in 12ms`
  - `[pgvector] upsert 9 chunks for doc DOC-… → ok in 95ms`
  - `[retrieval] hybrid: vector 30 + bm25 18 → fused 34 → reranked top 8 (total 410ms)`
  - `[query] intent=hybrid, hyde=on, decompose=off → 2 subqueries`
- Gate logging behind a `DEBUG_RAG` env flag (or log level) so verbose step logs are easy to switch on in dev and quiet in prod; errors always log.
- Every per-task "Test/gate" includes: running the step once with `DEBUG_RAG=1` and confirming the expected log lines appear in order.

---

## Tasks

### Task 0 — Plan doc + branch
- Create feature branch `feat/rag-upgrade`.
- **Test/gate:** branch checked out; `npm run build` still passes (baseline green).

### Task 1 — Testing foundation + shared logger
- Add **Vitest** + scripts (`test`, `test:watch`, `test:integration`). Add a test setup that loads `TEST_DATABASE_URL`. Add a mock layer (helpers to stub `fetch`/OpenAI). Write one smoke test.
- Add the shared step logger `src/services/logger.js` (namespaced, timing helper, gated by `DEBUG_RAG`) referenced by the Logging convention above, with a unit test.
- Files: `package.json`, `vitest.config.js`, `tests/setup.js`, `tests/mocks/*`, `tests/smoke.test.js`, `src/services/logger.js`, `tests/logger.test.js`.
- **Test/gate:** `npm test` runs and the smoke + logger tests pass offline (no external keys needed); `DEBUG_RAG=1` shows namespaced log lines, and they are silent when the flag is off.

### Task 2 — Golden set + precision/recall eval harness (baseline)
- Create a curated golden set: ~20–30 representative questions (case lookups, party/contact, document-content, exact-ID, Arabic) each labeled with the **expected source document(s)/case(s)** and an expected-answer rubric — defined at the **document/answer level**, not chunk-IDs, so it survives re-chunking.
- Build an eval runner that calls `processChatMessage`, computes **recall@k, precision@k, MRR**, and an LLM-graded answer-correctness score; prints a report.
- Files: `tests/golden/cases.json`, `scripts/eval.js`, `src/services/eval/metrics.js`.
- **Test/gate:** `node scripts/eval.js` runs against the **current (Pinecone)** system and records a baseline report committed to `docs/eval-baseline.md`. This baseline gates Tasks 7–11.

### Task 3 — Firecrawl extraction (markdown)
- New `src/services/firecrawlProcessor.js` → `extractWithFirecrawl(bytes, fileName, fileType, opts)` calling `/v2/parse` (multipart upload, `formats:['markdown']`, `parsePDF` mode). Rewire `extractTextFromDocument` (`documentProcessor.js`) to use it; keep TXT local. Remove `pdfjs-dist`+`mammoth` usage and `pdfProcessor.js`.
- **Test/gate:** unit tests with **mocked** Firecrawl assert PDF/DOCX → markdown string and error handling; opt-in integration test parses a real sample when `FIRECRAWL_API_KEY` present.

### Task 4 — Heading-adaptive chunking + per-document auto-select strategy
- New `src/services/chunking/` with `chunkMarkdown` (heading split → size-split oversized sections on blank-line boundaries, never inside tables, heading-path prepended + `heading`/`sectionPath` metadata) and a `selectStrategy(fileType, markdown)` router (e.g. spreadsheet→row-aware, scanned→OCR-parse, default→heading-adaptive). Replace `chunkText` call in `processDocument`.
- **Test/gate:** unit tests assert headings preserved, tables not split, chunk sizes/overlap within bounds, heading-path injected, and router picks expected strategy per fixture.

### Task 5 — Supabase pgvector storage layer
- Prisma migration: `CREATE EXTENSION vector;`; add `DocumentChunk` (text, `embedding vector(512)`, `documentId`, `caseId`, `userId`, `chunkIndex`, `heading`, `sectionPath`, ordering, FTS `tsvector`) and `CaseVector` (`embedding vector(512)` + case metadata) models. Add HNSW index on embeddings and GIN index on the `tsvector`. Create SQL RPC `match_chunks(query_embedding, match_count, filter_user, filter_case)` and `match_cases(...)`.
- Files: `prisma/schema.prisma`, `prisma/migrations/*`, `supabase/functions.sql` (RPCs).
- **Test/gate:** integration test against test DB: insert known vectors, call `match_chunks`, assert correct similarity ordering and that user/case filters apply.

### Task 6 — Move ingestion writes/deletes to pgvector
- Rewrite `storeInPinecone`→`storeChunks`, `storeCaseMetadataInPinecone`→`storeCaseVector`, `deleteDocumentFromPinecone`/`deleteCaseMetadataFromPinecone` to Supabase upserts/deletes (also populate the `tsvector` column for BM25). Update call sites in `cases` routes and `documents/process` route.
- **Test/gate:** integration test: process a fixture doc → rows land in `DocumentChunk` with embeddings + tsvector; delete removes them; case create/update/delete writes/removes `CaseVector`.

### Task 7 — Move query reads to pgvector + remove Pinecone
- Rewrite `searchDocuments`/`searchWithVector`/`searchCaseDocuments` to call the `match_*` RPCs; keep return shape. Remove `@pinecone-database/pinecone` dep and all `PINECONE_*` usage.
- **Test/gate:** end-to-end chat retrieval returns docs from pgvector; `grep -ri pinecone src/` returns nothing; **eval recall@k ≥ baseline** (Task 2).

### Task 8 — Re-ingestion of existing documents
- One-off `scripts/reingest.js`: iterate documents in DB/Storage, run Firecrawl → chunk → embed → pgvector.
- **Test/gate:** dry-run on a small fixture set succeeds; eval run after re-ingest **≥ baseline** (expected to improve).

### Task 9 — Hybrid BM25 + vector retrieval
- Add Postgres full-text (`tsvector`/`ts_rank`) lexical search alongside vector `match_*`; fuse with **Reciprocal Rank Fusion** in a `hybridSearch` helper. Used by `vectorSearch.js`.
- **Test/gate:** unit test of RRF fusion ordering; eval shows **exact-ID/name queries** now retrieved (recall up on that golden subset); overall **≥ baseline**.

### Task 10 — Custom local reranking
- `src/services/retrieval/rerank.js`: take fused top-N (~30) and rescore locally with a hybrid scorer — normalized fused score (`base`) + lexical coverage/TF (`lexical`) + exact phrase/n-gram (`phrase`) + high-value field matches (`field`) + intent alignment (`intent`) — return top-K (~8). No external API. Bilingual EN/AR normalization. Wire after hybrid fusion; gated by `ENABLE_RERANK`.
- **Test/gate:** unit tests assert lexical promotion, field tie-break, intent direction, Arabic-variant matching, and disabled/no-term passthrough; eval **precision@k ≥ post-Task-9**.

### Task 11 — Expanding-window context
- After rerank, fetch neighbor chunks (by `documentId`+`chunkIndex` order already stored) and merge into the context window passed to `responseFormatter`.
- **Test/gate:** unit test: a matched chunk yields a window including its neighbors without duplication; eval answer-correctness **≥ previous**.

### Task 12 — Query transforms (HyDE + decomposition) behind the auto-select router
- New `src/services/retrieval/queryTransform.js`: `hyde(query)` (LLM writes a hypothetical answer → embed that) and `decompose(query)` (split multi-part into sub-queries, retrieve each, merge). Add a complexity router in `processChatMessage` that gates HyDE/decomposition/rerank via `ENABLE_*` flags so simple lookups stay cheap/fast.
- **Test/gate:** unit tests with mocked LLM for HyDE output and decomposition into sub-queries + merge; eval on semantic/multi-part golden subsets **≥ previous**; assert simple-lookup path skips the expensive transforms (latency guard).

---

## End-to-end verification (after all tasks)
1. `npm test` — all unit suites green (offline, mocked).
2. `npm run test:integration` (with keys) — Firecrawl parse and pgvector match live paths pass.
3. `node scripts/eval.js` — final precision/recall/MRR/answer-correctness **meets or exceeds** `docs/eval-baseline.md` across every golden subset; commit final report to `docs/eval-final.md`.
4. Manual: upload a sample legal PDF via the UI, confirm markdown chunks land in `DocumentChunk`, then ask an exact-ID question and a semantic question in chat and confirm correct, well-sourced answers.
5. `grep -ri pinecone src/ package.json` — empty.

## Out of scope / risks
- Supabase hosted Postgres uses native FTS (`tsvector`) for "BM25-like" lexical ranking (true BM25 extensions like ParadeDB `pg_search` aren't available on hosted Supabase) — acceptable and noted.
- pgvector at very large scale needs index tuning (HNSW params); fine for current volume.
- Stacking HyDE+decompose+rerank adds latency/cost — mitigated by the Task 12 router and feature flags.
