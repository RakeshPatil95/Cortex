# Cortex Document Analysis Lifecycle

> Complete technical documentation of upload and Q&A flows.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend Framework | Next.js 15.5.7 + React 19.1.0 |
| Backend Runtime | Node.js (Next.js API Routes) |
| Database | PostgreSQL (via Supabase) |
| ORM | Prisma 6.16.2 |
| Vector Database | Pinecone (`cortex` index) |
| File Storage | Supabase Storage (`legal-documents` bucket) |
| Primary LLM | OpenAI GPT-5 |
| Embedding Model | OpenAI text-embedding-3-small (512 dims) |
| LLM Orchestration | LangChain (`@langchain/core`, `@langchain/openai`) |
| Document Parsing — PDF | `pdfjs-dist` 3.11.174 |
| Document Parsing — DOCX | `mammoth` 1.11.0 |
| Authentication | NextAuth 4.24.11 |

---

## 📤 Document Upload Flow

### 1. User Initiates Document Upload

User selects files from the case form (drag-drop or file picker).

- **File:** `src/components/cases/CaseForm.jsx`
- **Allowed Formats:** PDF, DOCX, DOC, TXT (max 10MB per file)
- **Handler Functions:** `handleDocumentUpload()`, `handleDrop()`, `addDocuments()`
- **Generated Metadata:** Unique document ID (`DOC-{timestamp}-{random}`), title, description, type, tags

### 2. Frontend Form Submission with FormData

Case and documents are validated and sent to the backend API.

- **API Endpoint:** `POST /api/documents/process`
- **Request Payload:** FormData with — `file` (blob), `caseId`, `documentId`, `documentTitle`, `documentType`, `userId`, `userName`, `userEmail`
- **Authentication:** NextAuth session validation required

### 3. Backend Document Validation

API validates file type, size, and required metadata.

- **File:** `src/app/api/documents/process/route.js` (lines 31–45)
- **Validations:**
  - ✓ MIME type check (PDF, DOCX, DOC, TXT)
  - ✓ File size limit (10MB)
  - ✓ Required fields: `caseId`, `documentId`, `documentTitle`

### 4. Text Extraction from Document

Extract raw text content based on file type.

- **File:** `src/services/documentProcessor.js` (lines 55–112)
- **PDF Processing:** Library `pdfjs-dist` — page-by-page text extraction + metadata (`src/services/pdfProcessor.js`)
- **DOCX Processing:** Library `mammoth` — `extractRawText()` returns plain text
- **TXT Processing:** UTF-8 `TextDecoder`
- **Output:** Plain text string with metadata (page count for PDFs, extraction messages for DOCX)

### 5. Text Chunking

Split extracted text into overlapping semantic chunks.

- **File:** `src/services/documentProcessor.js` — `chunkText()` (lines 117–152)
- **Chunking Strategy:**
  - Chunk Size: 1000 characters
  - Overlap: 200 characters
  - Boundary Detection: Sentence/newline boundaries
- **Output Per Chunk:** Object with `text`, start position, end position, `chunkIndex`

### 6. Generate Vector Embeddings

Convert text chunks into semantic vector embeddings.

- **File:** `src/services/documentProcessor.js` — `generateEmbeddings()` (lines 157–174)
- **Embedding Service:**
  - Provider: OpenAI API
  - Model: `text-embedding-3-small`
  - Dimensions: 512
- **Request Format:** Batch request with all chunks (multiple chunks per API call for efficiency)
- **Output:** Array of objects with `text`, embedding vector, `embeddingId` (index), chunk metadata
- **API Key:** `OPENAI_API_KEY` from environment

### 7. Upsert to Pinecone Vector DB

Store embeddings in Pinecone with comprehensive metadata.

- **File:** `src/services/documentProcessor.js` — `storeInPinecone()` (lines 179–241)
- **Vector Format:**

```js
// For each chunk:
{
  id: "{documentId}-chunk-{index}",
  values: [/* 512-dimensional vector */],
  metadata: { documentId, caseId, userId, type: 'document', chunkIndex, text, ... }
}
```

- **Pinecone Configuration:** Index Name `cortex`, API Key `PINECONE_API_KEY`, Operation `index.upsert()`
- **Metadata Stored:** `documentId`, `caseId`, `userId`, `fileName`, `fileType`, `documentTitle`, `type`, `chunkIndex`, `text`, `textLength`, `startPosition`, `endPosition`, `userName`, `userEmail`, `processedAt`
- **Vector Dimension:** 512 (must match embedding model output)

### 8. Return Success Response

Confirm upload to frontend with summary.

- **File:** `src/app/api/documents/process/route.js` (lines 58–62)
- **Response Data:**

```json
{ "success": true, "documentId": "...", "fileName": "...", "fileType": "...", "textLength": 0, "totalChunks": 0, "upsertedCount": 0 }
```

### Upload Flow Summary

- **Entry Point:** `src/components/cases/CaseForm.jsx` (drag-drop or file picker)
- **API Handler:** `POST /api/documents/process`
- **Text Extraction:** `pdfjs-dist` (PDF) + `mammoth` (DOCX) + `TextDecoder` (TXT)
- **Chunking:** 1000-char chunks with 200-char overlap
- **Embeddings:** OpenAI text-embedding-3-small (512 dimensions)
- **Vector Storage:** Pinecone index `cortex` with full metadata

---

## 💬 Chat / Question-Answer Flow

### 1. User Submits Question in Chat

User types a message in the chat interface and submits.

- **File:** `src/components/chat/ChatContent.jsx` (lines 71–128)
- **Input Validation:** ✓ Non-empty message, ✓ Previous conversation history attached
- **Data Sent:** `{ message: string, history: array of previous messages, filters: object }`

### 2. Backend Receives Message

API endpoint validates and processes the chat request.

- **API Endpoint:** `POST /api/chat`
- **File:** `src/app/api/chat/route.js` (lines 16–71)
- **Authentication:** NextAuth session validation, extract `userId`
- **Input Checks:** ✓ Message non-empty, ✓ History is array, ✓ Filters are valid

### 3. Query Intent Analysis

AI analyzes the query to determine the search strategy.

- **File:** `src/services/chat/queryAnalyzer.js` — `analyzeQueryIntent()` (lines 18–319)
- **LLM Used:** OpenAI GPT-5 with extended thinking (`reasoning_effort: 'medium'`)
- **Analysis Output:**

```js
{
  type: 'hybrid', // always
  confidence: 0-1,
  parameters: { timeRange, caseType, priority, status, ... },
  contextualSearchTerms: [/* extracted terms */],
  improvedQuery: 'enhanced question with schema context'
}
```

- **Context Used:** Conversation history (last 5 messages), database schema knowledge, legal terminology mapping
- **Note:** Query is ALWAYS categorized as `hybrid` (uses both SQL + vector search)

### 4a. SQL Search — Structured Case Data

Query the database for case metadata matches.

- **File:** `src/services/chat/textToSql.js` — `searchCasesWithSQL()` (lines 24–38)
- **Process:**
  1. AI generates PostgreSQL SELECT query via LangChain
  2. LLM understands schema and intent
  3. Query auto-corrects enum casting (`status::text`, `priority::text`, `role::text`)
  4. Executes via Prisma raw SQL
- **Query Generation Details:** LLM `ChatOpenAI GPT-5`; schema awareness, case ID detection, legal terminology mapping; fallback returns clarification prompt if query unclear
- **Searchable Fields:** `serialNumber`, `caseNumber`, `caseType`, `caseCategory`, `caseSubType`, `currentStage`, `status`, `priority`, `assignedTo`, `filedDate`, `nextHearing`, `parties` (via JOIN)
- **Execution:** `prisma.$queryRawUnsafe(sqlQuery, userId)` — auto-filters by user

### 4b. Vector Search — Semantic Document Search

Search Pinecone for semantically similar documents.

- **File:** `src/services/chat/vectorSearch.js` — `searchWithVector()` (lines 16–155)
- **Process:**
  1. Enhanced query with contextual terms
  2. Generate embedding via OpenAI
  3. Search Pinecone with similarity threshold
  4. De-duplicate results by `documentId`
  5. Return top matches with metadata
- **Embedding for Query:** Model `text-embedding-3-small` (512 dims); input = user message + contextual search terms
- **Pinecone Query:**

```js
index.query({
  vector: [/* 512-dim embedding */],
  topK: 30,
  includeMetadata: true,
  filter: { userId: userId, caseId?: caseId }
})
```

- **Result Processing:** Separate matches into cases and documents, map metadata fields to display format, extract relevant excerpts from text

### 5. Combine and Rank Results

Merge SQL and vector results intelligently.

- **File:** `src/services/chat/index.js` — `processChatMessage()` (lines 238–361)
- **Strategy — If SQL cases found:**
  - Scope document search to related cases only (top 5)
  - Limit documents to 3 most relevant per case
  - De-duplicate by `documentId`
- **Strategy — If NO SQL cases found:**
  - Run enhanced global semantic search
  - Return more results (8 cases, 15 documents)
  - Use `enhanced_global_semantic` strategy
- **Fallback Behavior:** If SQL search fails with an unclear query, trigger AI clarification prompt asking for more details

### 6. Generate Conversational Response

Format results as a natural language response.

- **File:** `src/services/chat/responseFormatter.js` — `formatResponse()` (lines 19–80)
- **LLM Response Generation:** `generateConversationalMessage()` via `ChatOpenAI GPT-5`
- **Input:** Case results, document results, conversation context
- **Instructions:** Professional lawyer-to-lawyer tone, conversational language, include contact details when asked
- **Field Mapping in Response:**
  - `serialNumber` → "case reference"
  - `caseCategory` → "type of case"
  - `assignedTo` → "assigned lawyer"
  - `filedDate` → "filing date"
  - `nextHearing` → "next hearing"
  - `parties` → contact details (name, address, phone, email, role)

### 7. Generate AI Suggested Follow-up Questions

Suggest contextual next questions for the user.

- **File:** `src/services/chat/responseFormatter.js` — `generateAISuggestedQuestions()` (lines 362–551)
- **Generation:** `ChatOpenAI GPT-5`
- **Input:** Database schema, current results, conversation context
- **Output:** 3 natural follow-up questions in the same language as the query
- **Format:** JSON array `["q1", "q2", "q3"]`
- **Context Provided:** Case types, categories, statuses, priorities, stages, assigned lawyers, document types, tags, filing dates, next hearings

### 8. Return Response to Client

Send formatted results back to the frontend.

- **File:** `src/app/api/chat/route.js` (lines 49–53)
- **Response Structure:**

```js
{
  success: true,
  message: "conversational response",
  results: { cases: [...], documents: [...] },
  suggestedQuestions: ["q1", "q2", "q3"],
  intent: "hybrid",
  confidence: 0-1,
  totalResults: { cases: N, documents: N },
  timestamp: "ISO string"
}
```

### Chat Q&A Flow Summary

- **Entry Point:** `src/components/chat/ChatContent.jsx` (`POST /api/chat`)
- **Intent Analysis:** OpenAI GPT-5 with extended thinking
- **SQL Search:** LangChain + Prisma for structured case data
- **Vector Search:** Pinecone with OpenAI embeddings (512-dim)
- **Response Generation:** OpenAI GPT-5 creates conversational message
- **Suggestions:** OpenAI GPT-5 generates 3 contextual follow-up questions
- **Result Format:** Combined cases + documents with full contact details

---

## 📁 Key File Paths Reference

| Component/Service | File Path | Key Functions/Exports |
|---|---|---|
| Document Upload UI | `src/components/cases/CaseForm.jsx` | `handleDocumentUpload`, `addDocuments`, `handleDrop`, `removeDocument` |
| Upload API Handler | `src/app/api/documents/process/route.js` | `POST` (process), `DELETE` (delete from Pinecone) |
| Document Processor | `src/services/documentProcessor.js` | `processDocument`, `extractTextFromDocument`, `chunkText`, `generateEmbeddings`, `storeInPinecone`, `searchDocuments`, `deleteDocumentFromPinecone` |
| PDF Text Extraction | `src/services/pdfProcessor.js` | `extractTextFromPDF` (uses `pdfjs-dist`) |
| Chat UI | `src/components/chat/ChatContent.jsx` | `sendMessage`, `loadInitialSuggestions`, user input handling |
| Chat API Handler | `src/app/api/chat/route.js` | `POST` (process message), `GET` (suggestions/health) |
| Chat Main Orchestrator | `src/services/chat/index.js` | `processChatMessage`, `getInitialSuggestedQuestions` |
| Query Intent Analysis | `src/services/chat/queryAnalyzer.js` | `analyzeQueryIntent` (uses `ChatOpenAI GPT-5`) |
| SQL Query Generation | `src/services/chat/textToSql.js` | `searchCasesWithSQL`, `generateSQLQuery`, `executeSQLQuery`, `getCaseStatistics` |
| Vector Search | `src/services/chat/vectorSearch.js` | `searchWithVector`, `findSimilarCases`, `searchCaseDocuments` |
| Response Formatter | `src/services/chat/responseFormatter.js` | `formatResponse`, `generateConversationalMessage`, `generateAISuggestedQuestions` |
| OpenAI Service | `src/services/openai.js` | `OpenAIService` (wrapper for OpenAI client) |
| Supabase Config | `src/config/supabase.js` | `supabase`, `supabaseAdmin`, `STORAGE_BUCKETS`, `UPLOAD_CONFIG` |
| Database Schema | `prisma/schema.prisma` | `LegalCase`, `CaseDocument`, `CaseParty`, `User` models |

---

## 🤖 AI Models & External Services

| Service | Use Case | Model/Resource | Environment Variable |
|---|---|---|---|
| Embeddings | Convert text chunks & queries to 512-dim vectors | OpenAI text-embedding-3-small | `OPENAI_API_KEY` |
| Query Intent Analysis | Understand user intent, improve query, extract context | OpenAI GPT-5 (extended thinking) | `OPENAI_API_KEY` |
| SQL Generation | Convert natural language to PostgreSQL queries | OpenAI GPT-5 (LangChain) | `OPENAI_API_KEY` |
| Response Generation | Create conversational assistant responses | OpenAI GPT-5 | `OPENAI_API_KEY` |
| Suggested Questions | Generate contextual follow-up questions | OpenAI GPT-5 | `OPENAI_API_KEY` |
| Vector Storage | Store & search document embeddings | Pinecone (index: `cortex`) | `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` |
| Case Metadata Storage | Store case summaries as vectors in Pinecone | Pinecone (same `cortex` index) | `PINECONE_API_KEY` |
| File Storage | Store uploaded documents (PDFs, DOCX, etc.) | Supabase Storage (bucket: `legal-documents`) | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Relational Database | Store case, party, document metadata | PostgreSQL (Supabase) | `DATABASE_URL`, `DIRECT_URL` |

---

## ⚡ Critical Technical Details

### Embedding Dimension Matching

**CRITICAL:** All embeddings use 512 dimensions (OpenAI text-embedding-3-small). When querying Pinecone, dummy vectors must use the same dimension (line 545 in `documentProcessor.js` shows `new Array(512).fill(0)`).

### Enum Field Casting in SQL

**IMPORTANT:** Only 3 fields are PostgreSQL ENUM types:

1. `legal_cases.status` (CaseStatus: active, pending, closed)
2. `legal_cases.priority` (CasePriority: high, medium, low)
3. `case_parties.role` (PartyRole: defendant, plaintiff, co_defendant, witness, expert, lawyer, other)

These MUST be cast to text before `ILIKE`:

```sql
lc."status"::text ILIKE '%active%'
```

All other fields are TEXT, use directly:

```sql
lc."caseCategory" ILIKE '%fraud%'
```

### Query Always Hybrid

**Design Pattern:** `queryAnalyzer.js` ALWAYS returns `type: 'hybrid'`, forcing both SQL and vector searches. This ensures comprehensive results even if one strategy fails.

### User Isolation via userId

**Security:** All searches filter by `userId` extracted from the NextAuth session:

- SQL: `WHERE lc."createdById" = $1`
- Vector: `filter: { userId: userId }` in Pinecone query

This prevents users from seeing other users' data.

### Chunking & Deduplication

**Document Search:** Each document may have multiple chunks. Vector search returns top `K=30` results, then deduplicates by `documentId`, keeping only the most relevant chunk per document (highest relevance score).

### Case Metadata in Vectors

**Dual Storage:** Case information is stored TWO ways:

1. **As vectors:** `storeCaseMetadataInPinecone()` stores case summary as a vector with metadata (`type: 'case'`)
2. **As SQL:** Full case data in PostgreSQL

This allows vector search to find cases by semantic similarity to the query.

### LangChain Integration

**Libraries Used:**

- `@langchain/core`: Core LLM abstractions
- `@langchain/openai`: `ChatOpenAI` class for GPT-5 calls

**Usage:** Wraps the OpenAI API with a unified interface for prompt/response handling. Used in `queryAnalyzer`, `textToSql`, and `responseFormatter`.
