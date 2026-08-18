import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { extractWithFirecrawl } from '@/services/firecrawlProcessor.js';

describe('firecrawl processor', () => {
  it('extracts markdown from a PDF parse response', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-firecrawl-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          markdown: '# Contract\n\nPayment terms are net 30.',
          metadata: {
            pages: 2,
          },
        },
      }),
    });

    const result = await extractWithFirecrawl(
      new Uint8Array([1, 2, 3]),
      'contract.pdf',
      'pdf',
      { fetch: fetchMock }
    );

    expect(result).toMatchObject({
      text: '# Contract\n\nPayment terms are net 30.',
      markdown: '# Contract\n\nPayment terms are net 30.',
      provider: 'firecrawl',
      success: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.firecrawl.dev/v2/parse',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-firecrawl-key',
        },
        body: expect.any(FormData),
      })
    );
  });

  it('extracts markdown from a DOCX parse response', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-firecrawl-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        markdown: '## Witness Statement\n\nThe witness confirms receipt.',
      }),
    });

    const result = await extractWithFirecrawl(
      new Uint8Array([4, 5, 6]),
      'statement.docx',
      'docx',
      { fetch: fetchMock }
    );

    expect(result.text).toBe('## Witness Statement\n\nThe witness confirms receipt.');
  });

  it('throws a useful error when Firecrawl fails', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-firecrawl-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: vi.fn().mockResolvedValue('upstream unavailable'),
    });

    await expect(
      extractWithFirecrawl(new Uint8Array([1]), 'broken.pdf', 'pdf', { fetch: fetchMock })
    ).rejects.toThrow('Firecrawl parse failed (502): upstream unavailable');
  });

  it('requires a Firecrawl API key', async () => {
    await expect(
      extractWithFirecrawl(new Uint8Array([1]), 'missing-key.pdf', 'pdf', {
        fetch: vi.fn(),
      })
    ).rejects.toThrow('FIRECRAWL_API_KEY environment variable is not set');
  });

  it.skipIf(!process.env.FIRECRAWL_API_KEY || !process.env.FIRECRAWL_SAMPLE_PATH)(
    '[integration] parses a real sample document when Firecrawl credentials and sample path are provided',
    async () => {
      const samplePath = path.resolve(process.env.FIRECRAWL_SAMPLE_PATH);
      const fileName = path.basename(samplePath);
      const fileType = fileName.split('.').pop();
      const bytes = fs.readFileSync(samplePath);

      const result = await extractWithFirecrawl(bytes, fileName, fileType);

      expect(result.success).toBe(true);
      expect(result.markdown.length).toBeGreaterThan(0);
    }
  );
});
