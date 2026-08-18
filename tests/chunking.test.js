import { describe, expect, it } from 'vitest';
import { chunkMarkdown, selectStrategy } from '@/services/chunking/index.js';

describe('heading-adaptive markdown chunking', () => {
  it('preserves heading paths in chunk text and metadata', () => {
    const chunks = chunkMarkdown([
      '# Case Overview',
      '',
      'The case concerns a contract dispute.',
      '',
      '## Evidence',
      '',
      'The invoice confirms payment terms.',
    ].join('\n'), { maxChars: 120 });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      heading: 'Case Overview',
      sectionPath: ['Case Overview'],
      chunkIndex: 0,
    });
    expect(chunks[0].text).toContain('# Case Overview');
    expect(chunks[1]).toMatchObject({
      heading: 'Evidence',
      sectionPath: ['Case Overview', 'Evidence'],
      chunkIndex: 1,
    });
    expect(chunks[1].text).toContain('# Case Overview\n# Evidence');
  });

  it('keeps markdown tables together even when they exceed max size', () => {
    const markdown = [
      '# Parties',
      '',
      '| Name | Role | Phone |',
      '| --- | --- | --- |',
      '| Mohammad Al-Hassan | defendant | +965 12345678 |',
      '| Fatima Al-Salem | plaintiff | +965 87654321 |',
      '',
      'Follow-up notes after the table.',
    ].join('\n');

    const chunks = chunkMarkdown(markdown, { maxChars: 90 });
    const tableChunk = chunks.find((chunk) => chunk.text.includes('| Mohammad Al-Hassan |'));

    expect(tableChunk).toBeTruthy();
    expect(tableChunk.text).toContain('| Fatima Al-Salem |');
  });

  it('splits oversized non-table sections on paragraph boundaries', () => {
    const markdown = [
      '# Memo',
      '',
      'First paragraph has enough detail about the investigation and filing history.',
      '',
      'Second paragraph has enough detail about the next hearing and prosecutor memo.',
      '',
      'Third paragraph has enough detail about attached evidence and witness statements.',
    ].join('\n');

    const chunks = chunkMarkdown(markdown, { maxChars: 100 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.includes('# Memo'))).toBe(true);
  });

  it('selects expected ingestion strategies', () => {
    expect(selectStrategy('pdf', '# Normal PDF\n\nText content').name).toBe('ocr-parse');
    expect(selectStrategy('docx', '# Normal DOCX\n\nText content with enough words to avoid sparse PDF routing.').name)
      .toBe('heading-adaptive');
    expect(selectStrategy('xlsx', 'Name,Role\nA,defendant').name).toBe('row-aware');
  });
});
