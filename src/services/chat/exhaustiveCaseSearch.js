const STATUS_PATTERNS = {
  active: [
    /\bactive\b/iu,
    /\bin[\s-]?progress\b/iu,
    /\bongoing\b/iu,
  ],
  pending: [/\bpending\b/iu],
  closed: [/\bclosed\b/iu],
};

const CASE_QUERY_PATTERN = /\bcases?\b/iu;
const EXHAUSTIVE_PATTERN = /\b(?:all|every|list|show|display|total|count|how\s+many|number\s+of)\b/iu;
const LIST_PATTERN = /\b(?:all|every|list|show|display)\b/iu;
const TOTAL_PATTERN = /\b(?:total|count|how\s+many|number\s+of)\b/iu;

function firstMatchIndex(message, patterns) {
  return patterns.reduce((lowest, pattern) => {
    const match = pattern.exec(message);
    pattern.lastIndex = 0;
    return match ? Math.min(lowest, match.index) : lowest;
  }, Number.POSITIVE_INFINITY);
}

/**
 * Identify case requests that require a complete database result set rather
 * than a relevance-ranked semantic sample.
 */
export function analyzeExhaustiveCaseQuery(message) {
  const text = String(message || '');
  const isExhaustive = CASE_QUERY_PATTERN.test(text) && EXHAUSTIVE_PATTERN.test(text);

  const statuses = Object.entries(STATUS_PATTERNS)
    .map(([status, patterns]) => ({
      status,
      index: firstMatchIndex(text, patterns),
    }))
    .filter(({ index }) => Number.isFinite(index))
    .sort((a, b) => a.index - b.index)
    .map(({ status }) => status);

  return {
    isExhaustive,
    statuses,
    wantsList: LIST_PATTERN.test(text),
    wantsTotal: TOTAL_PATTERN.test(text),
  };
}

function buildCaseWhere({ userId, statuses, assignedTo, intent }) {
  const where = { createdById: userId };

  if (statuses.length > 0 && statuses.length < Object.keys(STATUS_PATTERNS).length) {
    where.status = { in: statuses };
  }

  if (assignedTo) {
    where.assignedTo = { equals: assignedTo, mode: 'insensitive' };
  }

  const priority = intent?.parameters?.priority;
  if (priority && priority !== 'any') {
    where.priority = priority;
  }

  const caseType = intent?.parameters?.caseType;
  if (caseType && caseType !== 'any') {
    where.OR = [
      { caseType: { contains: caseType, mode: 'insensitive' } },
      { caseCategory: { contains: caseType, mode: 'insensitive' } },
      { caseSubType: { contains: caseType, mode: 'insensitive' } },
    ];
  }

  return where;
}

/** Fetch every matching owned case and an authoritative all-status summary. */
export async function resolveExhaustiveCaseQuery({
  prisma,
  userId,
  query,
  intent,
  assignedTo = null,
}) {
  const analysis = analyzeExhaustiveCaseQuery(query);
  const where = buildCaseWhere({
    userId,
    statuses: analysis.statuses,
    assignedTo,
    intent,
  });

  const [cases, statusGroups] = await Promise.all([
    prisma.legalCase.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.legalCase.groupBy({
      by: ['status'],
      where: { createdById: userId },
      _count: { status: true },
    }),
  ]);

  const statusBreakdown = { active: 0, pending: 0, closed: 0 };
  statusGroups.forEach((group) => {
    if (Object.hasOwn(statusBreakdown, group.status)) {
      statusBreakdown[group.status] = group._count.status;
    }
  });

  const statusOrder = analysis.statuses.length > 0
    ? analysis.statuses
    : ['active', 'pending', 'closed'];
  const orderIndex = new Map(statusOrder.map((status, index) => [status, index]));
  cases.sort((a, b) => (
    (orderIndex.get(a.status) ?? statusOrder.length)
    - (orderIndex.get(b.status) ?? statusOrder.length)
  ));

  return {
    ...analysis,
    cases,
    matchingCases: cases.length,
    totalCases: Object.values(statusBreakdown).reduce((sum, count) => sum + count, 0),
    statusBreakdown,
  };
}

function displayStatus(status) {
  if (status === 'active') return 'In progress';
  return status ? `${status[0].toUpperCase()}${status.slice(1)}` : 'Unknown';
}

function caseLine(case_, index) {
  const reference = case_.caseNumber || case_.serialNumber || case_.id;
  const type = case_.caseCategory || case_.caseType || case_.caseSubType || 'Unspecified type';
  const stage = case_.currentStage || 'Unspecified stage';
  const assignee = case_.assignedTo || 'Unassigned';

  return `${index + 1}. **${reference}** — ${type} — Status: ${displayStatus(case_.status)} — Stage: ${stage} — Assigned lawyer: ${assignee}`;
}

/** Build a complete, deterministic answer without asking an LLM to count rows. */
export function formatExhaustiveCaseMessage(result) {
  const { cases, matchingCases, totalCases, statusBreakdown, wantsList } = result;
  const summary = [
    `Total cases: **${totalCases}**`,
    `In progress: **${statusBreakdown.active}**`,
    `Pending: **${statusBreakdown.pending}**`,
    `Closed: **${statusBreakdown.closed}**`,
  ];

  if (!wantsList) {
    return summary.join('\n');
  }

  const heading = matchingCases === totalCases
    ? `\n\nAll cases (${matchingCases}):`
    : `\n\nMatching cases (${matchingCases}):`;
  const lines = cases.length > 0
    ? cases.map(caseLine).join('\n')
    : 'No matching cases found.';

  return `${summary.join('\n')}${heading}\n${lines}`;
}

const exhaustiveCaseSearch = {
  analyzeExhaustiveCaseQuery,
  resolveExhaustiveCaseQuery,
  formatExhaustiveCaseMessage,
};

export default exhaustiveCaseSearch;
