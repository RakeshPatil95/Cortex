CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "document_chunks" (
  "id" TEXT PRIMARY KEY,
  "documentId" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "heading" TEXT,
  "sectionPath" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "startPosition" INTEGER,
  "endPosition" INTEGER,
  "embedding" vector(512) NOT NULL,
  "search_vector" tsvector,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_chunks_documentId_chunkIndex_key"
  ON "document_chunks" ("documentId", "chunkIndex");

CREATE INDEX IF NOT EXISTS "document_chunks_documentId_idx"
  ON "document_chunks" ("documentId");

CREATE INDEX IF NOT EXISTS "document_chunks_caseId_idx"
  ON "document_chunks" ("caseId");

CREATE INDEX IF NOT EXISTS "document_chunks_userId_idx"
  ON "document_chunks" ("userId");

CREATE INDEX IF NOT EXISTS "document_chunks_embedding_hnsw_idx"
  ON "document_chunks"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "document_chunks_search_vector_gin_idx"
  ON "document_chunks"
  USING gin ("search_vector");

CREATE OR REPLACE FUNCTION document_chunks_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."search_vector" :=
    to_tsvector(
      'simple',
      coalesce(NEW."heading", '') || ' ' ||
      array_to_string(NEW."sectionPath", ' ') || ' ' ||
      coalesce(NEW."text", '')
    );
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "document_chunks_search_vector_trigger" ON "document_chunks";
CREATE TRIGGER "document_chunks_search_vector_trigger"
BEFORE INSERT OR UPDATE ON "document_chunks"
FOR EACH ROW EXECUTE FUNCTION document_chunks_search_vector_update();

CREATE TABLE IF NOT EXISTS "case_vectors" (
  "id" TEXT PRIMARY KEY,
  "caseId" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "serialNumber" TEXT,
  "caseNumber" TEXT,
  "caseCategory" TEXT,
  "caseSubType" TEXT,
  "currentStage" TEXT,
  "status" TEXT,
  "priority" TEXT,
  "assignedTo" TEXT,
  "publicProsecutorMemo" TEXT,
  "parties" TEXT,
  "summary" TEXT NOT NULL,
  "embedding" vector(512) NOT NULL,
  "search_vector" tsvector,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "case_vectors_caseId_idx"
  ON "case_vectors" ("caseId");

CREATE INDEX IF NOT EXISTS "case_vectors_userId_idx"
  ON "case_vectors" ("userId");

CREATE INDEX IF NOT EXISTS "case_vectors_embedding_hnsw_idx"
  ON "case_vectors"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "case_vectors_search_vector_gin_idx"
  ON "case_vectors"
  USING gin ("search_vector");

CREATE OR REPLACE FUNCTION case_vectors_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."search_vector" :=
    to_tsvector(
      'simple',
      coalesce(NEW."serialNumber", '') || ' ' ||
      coalesce(NEW."caseNumber", '') || ' ' ||
      coalesce(NEW."caseCategory", '') || ' ' ||
      coalesce(NEW."caseSubType", '') || ' ' ||
      coalesce(NEW."currentStage", '') || ' ' ||
      coalesce(NEW."status", '') || ' ' ||
      coalesce(NEW."priority", '') || ' ' ||
      coalesce(NEW."assignedTo", '') || ' ' ||
      coalesce(NEW."parties", '') || ' ' ||
      coalesce(NEW."publicProsecutorMemo", '') || ' ' ||
      coalesce(NEW."summary", '')
    );
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "case_vectors_search_vector_trigger" ON "case_vectors";
CREATE TRIGGER "case_vectors_search_vector_trigger"
BEFORE INSERT OR UPDATE ON "case_vectors"
FOR EACH ROW EXECUTE FUNCTION case_vectors_search_vector_update();

CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(512),
  match_count INTEGER DEFAULT 10,
  filter_user TEXT DEFAULT NULL,
  filter_case TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  "documentId" TEXT,
  "caseId" TEXT,
  "userId" TEXT,
  "chunkIndex" INTEGER,
  text TEXT,
  heading TEXT,
  "sectionPath" TEXT[],
  similarity DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    dc."id",
    dc."documentId",
    dc."caseId",
    dc."userId",
    dc."chunkIndex",
    dc."text",
    dc."heading",
    dc."sectionPath",
    1 - (dc."embedding" <=> query_embedding) AS similarity
  FROM "document_chunks" dc
  WHERE (filter_user IS NULL OR dc."userId" = filter_user)
    AND (filter_case IS NULL OR dc."caseId" = filter_case)
  ORDER BY dc."embedding" <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION match_cases(
  query_embedding vector(512),
  match_count INTEGER DEFAULT 10,
  filter_user TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  "caseId" TEXT,
  "userId" TEXT,
  "serialNumber" TEXT,
  "caseNumber" TEXT,
  "caseCategory" TEXT,
  "caseSubType" TEXT,
  "currentStage" TEXT,
  status TEXT,
  priority TEXT,
  "assignedTo" TEXT,
  parties TEXT,
  summary TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    cv."id",
    cv."caseId",
    cv."userId",
    cv."serialNumber",
    cv."caseNumber",
    cv."caseCategory",
    cv."caseSubType",
    cv."currentStage",
    cv."status",
    cv."priority",
    cv."assignedTo",
    cv."parties",
    cv."summary",
    1 - (cv."embedding" <=> query_embedding) AS similarity
  FROM "case_vectors" cv
  WHERE (filter_user IS NULL OR cv."userId" = filter_user)
  ORDER BY cv."embedding" <=> query_embedding
  LIMIT match_count;
$$;
