import { describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma';
import { deleteCaseVector, deleteDocumentChunks, searchDocuments, storeCaseVector, storeChunks } from '@/services/documentProcessor.js';

const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);
const prisma = hasTestDb ? new PrismaClient() : null;

function vectorLiteral(values) {
  return `[${values.join(',')}]`;
}

describe.skipIf(!hasTestDb)('pgvector storage [integration]', () => {
  it('stores and deletes document chunks and case vectors', async () => {
    const prefix = `store-${Date.now()}`;
    const embedding = Array(512).fill(0);
    embedding[0] = 1;

    await storeChunks([
      {
        text: '# Evidence\n\nPayment terms are net 30.',
        embedding,
        chunkIndex: 0,
        heading: 'Evidence',
        sectionPath: ['Case File', 'Evidence'],
        start: 0,
        end: 38,
      },
    ], {
      documentId: `${prefix}-doc`,
      caseId: `${prefix}-case`,
      userId: `${prefix}-user`,
    });

    const chunks = await prisma.$queryRawUnsafe(
      'SELECT "documentId", "caseId", "userId", "chunkIndex", "search_vector"::text AS "searchVector" FROM "document_chunks" WHERE "documentId" = $1',
      `${prefix}-doc`
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      documentId: `${prefix}-doc`,
      caseId: `${prefix}-case`,
      userId: `${prefix}-user`,
      chunkIndex: 0,
    });
    expect(chunks[0].searchVector).toContain('payment');

    await storeCaseVector({
      id: `${prefix}-case`,
      createdById: `${prefix}-user`,
      serialNumber: 'CASE-TEST-001',
      caseNumber: 'TEST-001',
      caseCategory: 'Civil',
      caseSubType: 'Contract',
      currentStage: 'Filed',
      status: 'active',
      priority: 'high',
      assignedTo: 'Test Lawyer',
      publicProsecutorMemo: 'Fixture memo',
      filedDate: new Date(),
      parties: [
        { name: 'Fixture Party', role: 'defendant' },
      ],
    }, {
      embeddings: [
        {
          embedding,
        },
      ],
    });

    const cases = await prisma.$queryRawUnsafe(
      'SELECT "caseId", "userId", "serialNumber", "search_vector"::text AS "searchVector" FROM "case_vectors" WHERE "caseId" = $1',
      `${prefix}-case`
    );

    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      caseId: `${prefix}-case`,
      userId: `${prefix}-user`,
      serialNumber: 'CASE-TEST-001',
    });
    expect(cases[0].searchVector).toContain('contract');

    const deleteChunksResult = await deleteDocumentChunks(`${prefix}-doc`);
    const deleteCaseResult = await deleteCaseVector(`${prefix}-case`);

    expect(deleteChunksResult.deletedCount).toBe(1);
    expect(deleteCaseResult.deletedCount).toBe(1);
  });

  it('orders chunk matches by vector similarity and applies user/case filters', async () => {
    const prefix = `test-${Date.now()}`;
    const userA = `${prefix}-user-a`;
    const userB = `${prefix}-user-b`;
    const caseA = `${prefix}-case-a`;
    const caseB = `${prefix}-case-b`;
    const documentA = `${prefix}-doc-a`;
    const zeros = Array(512).fill(0);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "document_chunks"
        ("id", "documentId", "caseId", "userId", "chunkIndex", "text", "heading", "sectionPath", "embedding")
      VALUES
        ('${prefix}-near', '${documentA}', '${caseA}', '${userA}', 0, 'near text', 'Near', ARRAY['Near'], '${vectorLiteral([1, ...zeros.slice(1)])}'::vector),
        ('${prefix}-far', '${documentA}', '${caseA}', '${userA}', 1, 'far text', 'Far', ARRAY['Far'], '${vectorLiteral([0, 1, ...zeros.slice(2)])}'::vector),
        ('${prefix}-other-user', '${prefix}-doc-b', '${caseB}', '${userB}', 0, 'other user text', 'Other', ARRAY['Other'], '${vectorLiteral([1, ...zeros.slice(1)])}'::vector)
    `);

    const matches = await prisma.$queryRawUnsafe(`
      SELECT * FROM match_chunks('${vectorLiteral([1, ...zeros.slice(1)])}'::vector, 5, '${userA}', '${caseA}')
    `);

    expect(matches.map((match) => match.id)).toEqual([
      `${prefix}-near`,
      `${prefix}-far`,
    ]);
    expect(matches.every((match) => match.userId === userA)).toBe(true);
    expect(matches.every((match) => match.caseId === caseA)).toBe(true);

    await prisma.$executeRawUnsafe(`
      DELETE FROM "document_chunks" WHERE "id" LIKE '${prefix}-%'
    `);
  });

  it('returns pgvector document and case matches through searchDocuments', async () => {
    const prefix = `search-${Date.now()}`;
    const userId = `${prefix}-user`;
    const caseId = `${prefix}-case`;
    const documentId = `${prefix}-doc`;
    const embedding = Array(512).fill(0);
    embedding[0] = 1;

    await storeChunks([
      {
        text: '# Search Fixture\n\nThe document discusses payment terms.',
        embedding,
        chunkIndex: 0,
        heading: 'Search Fixture',
        sectionPath: ['Search Fixture'],
        start: 0,
        end: 52,
      },
    ], {
      documentId,
      caseId,
      userId,
    });

    await storeCaseVector({
      id: caseId,
      createdById: userId,
      serialNumber: 'CASE-SEARCH-001',
      caseNumber: 'SEARCH-001',
      caseCategory: 'Civil',
      caseSubType: 'Contract',
      currentStage: 'Filed',
      status: 'active',
      priority: 'medium',
      assignedTo: 'Search Lawyer',
      filedDate: new Date(),
      parties: [],
    }, {
      embeddings: [{ embedding }],
    });

    const result = await searchDocuments('payment terms', { userId }, 10, {
      queryEmbedding: embedding,
    });

    expect(result.success).toBe(true);
    expect(result.results.some((match) => match.metadata.type === 'document' && match.metadata.documentId === documentId))
      .toBe(true);
    expect(result.results.some((match) => match.metadata.type === 'case' && match.metadata.caseId === caseId))
      .toBe(true);

    await deleteDocumentChunks(documentId);
    await deleteCaseVector(caseId);
  });
});
