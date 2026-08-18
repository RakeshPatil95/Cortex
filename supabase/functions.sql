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
