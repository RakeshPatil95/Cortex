import { describe, expect, it } from 'vitest';
import { parseBoldMarkdown } from '@/lib/markdown.js';

describe('chat Markdown formatting', () => {
  it('turns double-star markers into bold text segments', () => {
    expect(parseBoldMarkdown('Case **2024/11001** is **active**.')).toEqual([
      { text: 'Case ', bold: false },
      { text: '2024/11001', bold: true },
      { text: ' is ', bold: false },
      { text: 'active', bold: true },
      { text: '.', bold: false },
    ]);
  });

  it('supports triple-star emphasis and preserves line breaks', () => {
    expect(parseBoldMarkdown('First\n***important***')).toEqual([
      { text: 'First\n', bold: false },
      { text: 'important', bold: true },
    ]);
  });

  it('leaves unmatched markers as plain text', () => {
    expect(parseBoldMarkdown('An unmatched ** marker')).toEqual([
      { text: 'An unmatched ** marker', bold: false },
    ]);
  });
});
