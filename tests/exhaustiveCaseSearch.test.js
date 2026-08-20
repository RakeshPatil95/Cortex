import { describe, expect, it, vi } from 'vitest';
import {
  analyzeExhaustiveCaseQuery,
  formatExhaustiveCaseMessage,
  resolveExhaustiveCaseQuery,
} from '@/services/chat/exhaustiveCaseSearch.js';

describe('exhaustive structured case search', () => {
  it('recognizes the reported request and maps in-progress to active', () => {
    expect(analyzeExhaustiveCaseQuery(
      'List all pending, closed and inprogress cases also tell total number of cases'
    )).toEqual({
      isExhaustive: true,
      statuses: ['pending', 'closed', 'active'],
      wantsList: true,
      wantsTotal: true,
    });
  });

  it('does not redirect an ordinary relevance search', () => {
    expect(analyzeExhaustiveCaseQuery('Find criminal cases about fraud').isExhaustive)
      .toBe(false);
  });

  it('fetches all matching cases without a take limit and reports database totals', async () => {
    const cases = [
      { id: 'pending-1', status: 'pending', updatedAt: new Date('2026-01-03') },
      { id: 'active-1', status: 'active', updatedAt: new Date('2026-01-02') },
      { id: 'closed-1', status: 'closed', updatedAt: new Date('2026-01-01') },
    ];
    const prisma = {
      legalCase: {
        findMany: vi.fn().mockResolvedValue(cases),
        groupBy: vi.fn().mockResolvedValue([
          { status: 'active', _count: { status: 20 } },
          { status: 'pending', _count: { status: 18 } },
          { status: 'closed', _count: { status: 12 } },
        ]),
      },
    };

    const result = await resolveExhaustiveCaseQuery({
      prisma,
      userId: 'user-1',
      query: 'List all pending, closed and inprogress cases and give the total',
      intent: { parameters: { priority: 'any', caseType: 'any' } },
    });

    expect(prisma.legalCase.findMany).toHaveBeenCalledWith({
      where: { createdById: 'user-1' },
      orderBy: { updatedAt: 'desc' },
    });
    expect(prisma.legalCase.findMany.mock.calls[0][0]).not.toHaveProperty('take');
    expect(result.cases.map(case_ => case_.status)).toEqual(['pending', 'closed', 'active']);
    expect(result).toMatchObject({
      matchingCases: 3,
      totalCases: 50,
      statusBreakdown: { active: 20, pending: 18, closed: 12 },
    });
  });

  it('produces a deterministic total, breakdown, and complete list', () => {
    const message = formatExhaustiveCaseMessage({
      cases: [{
        id: 'case-1',
        caseNumber: '2026/100',
        caseCategory: 'Criminal',
        status: 'active',
        currentStage: 'Hearing',
        assignedTo: 'Lawyer One',
      }],
      matchingCases: 1,
      totalCases: 50,
      statusBreakdown: { active: 20, pending: 18, closed: 12 },
      wantsList: true,
    });

    expect(message).toContain('Total cases: **50**');
    expect(message).toContain('In progress: **20**');
    expect(message).toContain('Pending: **18**');
    expect(message).toContain('Closed: **12**');
    expect(message).toContain('**2026/100** — Criminal — Status: In progress');
  });
});
