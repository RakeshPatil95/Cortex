const CASE_REFERENCE_PATTERNS = [
  /(?<![A-Z0-9/])\d{1,10}\/\d{1,10}(?![A-Z0-9/])/gi,
  /\bCASE-\d{4}-\d{3,}\b/gi,
  /\bCASE-?\d+(?![\d-])/gi,
  /\b[A-Z]{2,10}-\d{2,4}-\d+\b/gi,
  /(?<![A-Z0-9-])\d{4}-\d{3,}\b/gi,
];

const LABELED_CASE_REFERENCE_PATTERNS = [
  /\bcase(?:\s+(?:reference|number|no\.?|id))?(?:\s*[:#]\s*|\s+)([A-Z0-9][A-Z0-9_/-]*)\b/gi,
  /\breference(?:\s*[:#]\s*|\s+)([A-Z0-9][A-Z0-9_/-]*)\b/gi,
];

const ASSIGNEE_PATTERNS = [
  /\bassigned\s+to\s+["']?([\p{L}\p{M}][\p{L}\p{M}\s.'-]*?)["']?(?=\s*(?:[?.,!;؟،]|$|\b(?:with|where|whose|that)\b))/iu,
  /\bassigned\s+(?:lawyer|attorney)\s*(?:is|:)?\s*["']?([\p{L}\p{M}][\p{L}\p{M}\s.'-]*?)["']?(?=\s*(?:[?.,!;؟،]|$|\b(?:with|where|whose|that)\b))/iu,
];

function normalizeReference(reference) {
  return String(reference || '').trim().replace(/[.,;:!?]+$/, '');
}

function isPlausibleReference(reference) {
  return reference.length > 1 && /\d/.test(reference);
}

function normalizePersonName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

/**
 * Extract exact-looking case identifiers from user or analyzer text.
 * Generic phrases such as "this case" are intentionally ignored.
 */
export function extractCaseReferences(...texts) {
  const references = new Map();

  for (const value of texts.flat()) {
    if (typeof value !== 'string' || value.trim().length === 0) continue;

    for (const pattern of CASE_REFERENCE_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of value.matchAll(pattern)) {
        const reference = normalizeReference(match[0]);
        if (isPlausibleReference(reference)) {
          references.set(reference.toLowerCase(), reference);
        }
      }
    }

    for (const pattern of LABELED_CASE_REFERENCE_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of value.matchAll(pattern)) {
        const reference = normalizeReference(match[1]);
        if (isPlausibleReference(reference)) {
          references.set(reference.toLowerCase(), reference);
        }
      }
    }
  }

  return [...references.values()];
}

export function extractAssigneeName(...texts) {
  for (const value of texts.flat()) {
    if (typeof value !== 'string' || value.trim().length === 0) continue;

    for (const pattern of ASSIGNEE_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(value);
      const assignee = normalizePersonName(match?.[1]);
      if (assignee) return assignee;
    }
  }

  return null;
}

/**
 * Resolve one explicit case reference to the owning user's internal case ID.
 * Multiple references are left unscoped because they represent a comparison,
 * not a request about one specific case.
 */
export async function resolveCaseScope({
  prisma,
  userId,
  filterCaseId,
  texts = [],
}) {
  const references = filterCaseId
    ? [normalizeReference(filterCaseId)]
    : extractCaseReferences(texts);

  if (references.length !== 1) {
    return {
      case: null,
      hasExplicitReference: references.length > 0,
      ambiguous: references.length > 1,
      multipleReferences: references.length > 1,
      references,
    };
  }

  const reference = references[0];
  const caseRecords = await prisma.legalCase.findMany({
    where: {
      createdById: userId,
      OR: [
        { id: reference },
        { serialNumber: { equals: reference, mode: 'insensitive' } },
        { caseNumber: { equals: reference, mode: 'insensitive' } },
      ],
    },
    include: {
      parties: true,
      documents: true,
    },
    take: 2,
  });

  return {
    case: caseRecords.length === 1 ? caseRecords[0] : null,
    hasExplicitReference: true,
    ambiguous: caseRecords.length > 1,
    multipleReferences: false,
    references,
  };
}

/** Resolve queries such as "which case is assigned to Jane Doe?" structurally. */
export async function resolveAssigneeCaseScope({ prisma, userId, texts = [] }) {
  const assignee = extractAssigneeName(texts);
  if (!assignee) {
    return { assignee: null, cases: [] };
  }

  const cases = await prisma.legalCase.findMany({
    where: {
      createdById: userId,
      assignedTo: { equals: assignee, mode: 'insensitive' },
    },
    include: {
      parties: true,
      documents: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 8,
  });

  return { assignee, cases };
}

export function toChatCaseResult(caseRecord) {
  return {
    ...caseRecord,
    caseId: caseRecord.id,
    partyCount: caseRecord.parties?.length || 0,
    documentCount: caseRecord.documents?.length || 0,
    relevanceScore: 1,
  };
}

export function filterDocumentsForCases(documents, caseIds, limit = 15) {
  if (!Array.isArray(documents) || !Array.isArray(caseIds) || caseIds.length === 0) {
    return [];
  }

  const allowedCaseIds = new Set(caseIds);
  const documentsById = new Map();

  documents
    .filter(document => allowedCaseIds.has(document.caseId))
    .forEach(document => {
      const documentId = document.documentId || document.id;
      const existing = documentsById.get(documentId);
      if (!existing || (document.relevanceScore || 0) > (existing.relevanceScore || 0)) {
        documentsById.set(documentId, document);
      }
    });

  return [...documentsById.values()]
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, limit);
}

export function filterDocumentsForCase(documents, caseId, limit = 15) {
  return filterDocumentsForCases(documents, caseId ? [caseId] : [], limit);
}
