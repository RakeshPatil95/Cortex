import { describe, expect, it } from 'vitest';
import { extractTextFromDocument } from '@/services/documentProcessor.js';

describe('document extraction', () => {
  it('keeps TXT extraction local', async () => {
    const file = new File(['plain legal note'], 'note.txt', { type: 'text/plain' });

    const result = await extractTextFromDocument(file, 'txt');

    expect(result).toEqual({
      text: 'plain legal note',
      success: true,
    });
  });
});
