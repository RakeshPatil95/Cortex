import { describe, expect, it, vi } from 'vitest';
import {
  extractAssigneeName,
  extractCaseReferences,
  filterDocumentsForCase,
  filterDocumentsForCases,
  resolveAssigneeCaseScope,
  resolveCaseScope,
  toChatCaseResult,
} from '@/services/chat/caseScope.js';

describe('case-scoped chat retrieval', () => {
  it('extracts supported exact case references without partial duplicates', () => {
    expect(extractCaseReferences(
      'Show documents for CASE-2024-001',
      'case number 12345',
      'reference CR-2025-77',
      'give details of 2024/11001',
      'Retrieve the legal case with case number 2024/11001'
    )).toEqual(['CASE-2024-001', '12345', 'CR-2025-77', '2024/11001']);
  });

  it('resolves the reported slash-formatted case number instead of searching globally', async () => {
    const caseRecord = {
      id: 'case-11001',
      caseNumber: '2024/11001',
      parties: [],
      documents: [],
    };
    const prisma = {
      legalCase: {
        findMany: vi.fn().mockResolvedValue([caseRecord]),
      },
    };

    const result = await resolveCaseScope({
      prisma,
      userId: 'user-1',
      texts: ['give details of 2024/11001'],
    });

    expect(result.case).toBe(caseRecord);
    expect(result.references).toEqual(['2024/11001']);
  });

  it('does not treat a generic case phrase as an exact reference', () => {
    expect(extractCaseReferences('Show me the documents for this case')).toEqual([]);
  });

  it('extracts the assignee from the reported query without trailing punctuation', () => {
    expect(extractAssigneeName('which case is assigned to Adel Qasim Ibrahim ?'))
      .toBe('Adel Qasim Ibrahim');
  });

  it('resolves assignee cases within the current user ownership boundary', async () => {
    const cases = [{ id: 'case-a' }];
    const prisma = {
      legalCase: {
        findMany: vi.fn().mockResolvedValue(cases),
      },
    };

    const result = await resolveAssigneeCaseScope({
      prisma,
      userId: 'user-1',
      texts: ['which case is assigned to Adel Qasim Ibrahim ?'],
    });

    expect(result).toEqual({ assignee: 'Adel Qasim Ibrahim', cases });
    expect(prisma.legalCase.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        createdById: 'user-1',
        assignedTo: { equals: 'Adel Qasim Ibrahim', mode: 'insensitive' },
      },
    }));
  });

  it('resolves a reference only within the current user ownership boundary', async () => {
    const caseRecord = {
      id: 'internal-case-id',
      serialNumber: 'CASE-2024-001',
      parties: [{ id: 'party-1' }],
      documents: [{ id: 'document-1' }],
    };
    const prisma = {
      legalCase: {
        findMany: vi.fn().mockResolvedValue([caseRecord]),
      },
    };

    const result = await resolveCaseScope({
      prisma,
      userId: 'user-1',
      texts: ['What does CASE-2024-001 say about the hearing?'],
    });

    expect(result.case).toBe(caseRecord);
    expect(prisma.legalCase.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdById: 'user-1' }),
      include: { parties: true, documents: true },
      take: 2,
    }));
  });

  it('does not silently turn an unresolved exact reference into a global scope', async () => {
    const prisma = {
      legalCase: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const result = await resolveCaseScope({
      prisma,
      userId: 'user-1',
      texts: ['Show CASE-2024-999'],
    });

    expect(result).toMatchObject({
      case: null,
      hasExplicitReference: true,
      ambiguous: false,
      references: ['CASE-2024-999'],
    });
  });

  it('does not choose arbitrarily when a case number matches multiple cases', async () => {
    const prisma = {
      legalCase: {
        findMany: vi.fn().mockResolvedValue([{ id: 'case-a' }, { id: 'case-b' }]),
      },
    };

    const result = await resolveCaseScope({
      prisma,
      userId: 'user-1',
      texts: ['Show case number 12345'],
    });

    expect(result).toMatchObject({
      case: null,
      hasExplicitReference: true,
      ambiguous: true,
      multipleReferences: false,
    });
  });

  it('keeps only documents belonging to the resolved case', () => {
    const documents = [
      { documentId: 'doc-a', caseId: 'case-a' },
      { documentId: 'doc-b', caseId: 'case-b' },
      { documentId: 'doc-c', caseId: 'case-a' },
    ];

    expect(filterDocumentsForCase(documents, 'case-a'))
      .toEqual([documents[0], documents[2]]);
  });

  it('keeps documents linked to returned cases and excludes every other case', () => {
    const documents = [
      { documentId: 'doc-a', caseId: 'case-a', relevanceScore: 0.8 },
      { documentId: 'doc-b', caseId: 'case-b', relevanceScore: 0.9 },
      { documentId: 'doc-c', caseId: 'case-c', relevanceScore: 1 },
    ];

    expect(filterDocumentsForCases(documents, ['case-a', 'case-b']))
      .toEqual([documents[1], documents[0]]);
  });

  it('normalizes a hydrated case for the response formatter', () => {
    expect(toChatCaseResult({
      id: 'case-a',
      parties: [{ id: 'party-a' }],
      documents: [{ id: 'doc-a' }, { id: 'doc-b' }],
    })).toMatchObject({
      caseId: 'case-a',
      partyCount: 1,
      documentCount: 2,
      relevanceScore: 1,
    });
  });
});
