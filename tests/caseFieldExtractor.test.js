import { describe, expect, it, vi } from 'vitest';
import {
  extractCaseFields,
  normalizeExtractedFields,
  backfillCivilIds,
} from '@/services/cases/fieldExtractor.js';

describe('normalizeExtractedFields', () => {
  it('passes through valid enum values (case-insensitively)', () => {
    const { fields } = normalizeExtractedFields({
      serialNumber: 'SRL-2024-0001',
      caseNumber: '4521/2024',
      caseCategory: 'criminal',
      caseSubType: 'fraud',
      currentStage: 'under review',
      status: 'ACTIVE',
      priority: 'High',
      assignedTo: '  Sara Al-Mansoori  ',
    });

    expect(fields.serialNumber).toBe('SRL-2024-0001');
    expect(fields.caseCategory).toBe('Criminal');
    expect(fields.caseSubType).toBe('Fraud');
    expect(fields.currentStage).toBe('Under Review');
    expect(fields.status).toBe('active');
    expect(fields.priority).toBe('high');
    expect(fields.assignedTo).toBe('Sara Al-Mansoori');
  });

  it('drops enum values outside the allow-list to null', () => {
    const { fields } = normalizeExtractedFields({
      caseCategory: 'Espionage',       // not a category
      currentStage: 'Appeal',          // not a stage
      status: 'archived',              // not a status
      priority: 'critical',            // not a priority
    });

    expect(fields.caseCategory).toBeNull();
    expect(fields.currentStage).toBeNull();
    expect(fields.status).toBeNull();
    expect(fields.priority).toBeNull();
  });

  it('nulls a sub-type that does not belong to the chosen category', () => {
    const { fields } = normalizeExtractedFields({
      caseCategory: 'Criminal',
      caseSubType: 'Divorce', // belongs to Family, not Criminal
    });

    expect(fields.caseCategory).toBe('Criminal');
    expect(fields.caseSubType).toBeNull();
  });

  it('keeps a sub-type valid for its category (incl. Commercial)', () => {
    const { fields } = normalizeExtractedFields({
      caseCategory: 'Commercial',
      caseSubType: 'Bankruptcy',
    });

    expect(fields.caseSubType).toBe('Bankruptcy');
  });

  it('maps Arabic enum labels to the English options', () => {
    const { fields } = normalizeExtractedFields({
      caseCategory: 'جنائي',   // Criminal
      caseSubType: 'احتيال',   // Fraud
      currentStage: 'جلسة',    // Hearing
    });

    expect(fields.caseCategory).toBe('Criminal');
    expect(fields.caseSubType).toBe('Fraud');
    expect(fields.currentStage).toBe('Hearing');
  });

  it('coerces dates to YYYY-MM-DD and rejects invalid ones', () => {
    const { fields } = normalizeExtractedFields({
      filedDate: '2024-03-12',
      nextHearing: 'August 5, 2026',
    });

    expect(fields.filedDate).toBe('2024-03-12');
    expect(fields.nextHearing).toBe('2026-08-05');

    const bad = normalizeExtractedFields({ filedDate: 'not a date' });
    expect(bad.fields.filedDate).toBeNull();
  });

  it('normalizes parties: keeps named ones, defaults unknown roles to other, drops nameless', () => {
    const { parties } = normalizeExtractedFields({
      parties: [
        { name: 'John Doe', role: 'defendant', phone: '+971 50 111 2233' },
        { name: 'Acme Ltd', role: 'complainant' }, // not a valid PartyRole
        { name: '   ', role: 'plaintiff' },        // no name → dropped
        { role: 'witness' },                        // no name → dropped
      ],
    });

    expect(parties).toHaveLength(2);
    expect(parties[0]).toMatchObject({ name: 'John Doe', role: 'defendant', phone: '+971 50 111 2233' });
    expect(parties[1]).toMatchObject({ name: 'Acme Ltd', role: 'other' });
  });

  it('returns empty result for null/garbage input', () => {
    expect(normalizeExtractedFields(null)).toEqual({ fields: {}, parties: [], document: null });
    expect(normalizeExtractedFields('nope')).toEqual({ fields: {}, parties: [], document: null });
  });

  it('normalizes document metadata: valid type kept, unknown tags dropped', () => {
    const { document } = normalizeExtractedFields({
      document: {
        title: '  Appeal brief — case 2024/31275  ',
        documentType: 'legal-document',
        description: 'Appeal against a first-instance criminal judgment.',
        tags: ['Legal', 'Confidential', 'NotARealTag'],
      },
    });

    expect(document.title).toBe('Appeal brief — case 2024/31275');
    expect(document.documentType).toBe('legal-document');
    expect(document.description).toBe('Appeal against a first-instance criminal judgment.');
    expect(document.tags).toEqual(['Legal', 'Confidential']);
  });

  it('nulls an invalid document type and returns null document when absent', () => {
    const withBadType = normalizeExtractedFields({ document: { title: 'X', documentType: 'invoice', tags: [] } });
    expect(withBadType.document.documentType).toBeNull();

    const noDoc = normalizeExtractedFields({ fields: {} });
    expect(noDoc.document).toBeNull();
  });
});

describe('backfillCivilIds', () => {
  const md = 'Appellant هيا محمد جاسم | 289620940403 | case 2024/31275 serial 100807738';

  it('fills a single missing civil ID from a lone 12-digit number in the text', () => {
    const out = backfillCivilIds([{ name: 'Haya', civilId: null }], md);
    expect(out[0].civilId).toBe('289620940403');
  });

  it('does not overwrite an existing civil ID', () => {
    const out = backfillCivilIds([{ name: 'Haya', civilId: '111122223333' }], md);
    expect(out[0].civilId).toBe('111122223333');
  });

  it('assigns the first available ID when a party has a gap and multiple IDs exist', () => {
    const twoIds = 'A 289620940403 and B 445566778899';
    const out = backfillCivilIds([{ name: 'A', civilId: null }], twoIds); // 1 gap, 2 candidates
    expect(out[0].civilId).toBe('289620940403');
  });

  it('pairs multiple gaps and candidates in order', () => {
    const twoIds = 'A 289620940403 B 445566778899';
    const out = backfillCivilIds(
      [{ name: 'A', civilId: null }, { name: 'B', civilId: null }],
      twoIds,
    );
    expect(out[0].civilId).toBe('289620940403');
    expect(out[1].civilId).toBe('445566778899');
  });

  it('fills the first party and leaves extras null when parties outnumber IDs', () => {
    const oneId = 'Appellant 289620940403 vs Public Prosecution';
    const out = backfillCivilIds(
      [{ name: 'Haya', civilId: null }, { name: 'Public Prosecution', civilId: null }],
      oneId,
    );
    expect(out[0].civilId).toBe('289620940403'); // the natural person, listed first
    expect(out[1].civilId).toBeNull();           // entity, no civil ID
  });

  it('ignores non-12-digit numbers (serial/case numbers)', () => {
    const out = backfillCivilIds([{ name: 'A', civilId: null }], 'serial 100807738 case 2024/31275');
    expect(out[0].civilId).toBeNull();
  });
});

describe('extractCaseFields (mocked LLM)', () => {
  function mockClient(content) {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({ choices: [{ message: { content } }] }),
        },
      },
    };
  }

  it('parses a JSON object out of the model response', async () => {
    const client = mockClient('Here you go:\n{"caseNumber":"4521/2024","priority":"high"}');
    const raw = await extractCaseFields('# Case\n\nSome legal text long enough to send.', { openai: client });

    expect(client.chat.completions.create).toHaveBeenCalledOnce();
    expect(raw).toMatchObject({ caseNumber: '4521/2024', priority: 'high' });
  });

  it('returns null on empty markdown without calling the model', async () => {
    const client = mockClient('{}');
    const raw = await extractCaseFields('   ', { openai: client });

    expect(raw).toBeNull();
    expect(client.chat.completions.create).not.toHaveBeenCalled();
  });

  it('returns null when the response has no JSON', async () => {
    const client = mockClient('I could not find any structured data.');
    const raw = await extractCaseFields('# Some document text here', { openai: client });

    expect(raw).toBeNull();
  });
});
