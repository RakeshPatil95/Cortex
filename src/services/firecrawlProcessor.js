import { createLogger } from './logger.js';

const FIRECRAWL_PARSE_URL = 'https://api.firecrawl.dev/v2/parse';
const logger = createLogger('firecrawl');

function getMarkdownFromResponse(body) {
  return body?.data?.markdown
    || body?.markdown
    || body?.data?.documents?.[0]?.markdown
    || body?.documents?.[0]?.markdown
    || body?.data?.content
    || body?.content
    || '';
}

function getFileSize(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes.byteLength;
  }

  if (bytes instanceof ArrayBuffer) {
    return bytes.byteLength;
  }

  return bytes?.length || 0;
}

function getMimeType(fileType) {
  const normalized = String(fileType || '').toLowerCase();

  if (normalized === 'pdf') {
    return 'application/pdf';
  }

  if (normalized === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  if (normalized === 'doc') {
    return 'application/msword';
  }

  return 'application/octet-stream';
}

export async function extractWithFirecrawl(bytes, fileName, fileType, opts = {}) {
  const apiKey = opts.apiKey || process.env.FIRECRAWL_API_KEY;
  const parseUrl = opts.parseUrl || FIRECRAWL_PARSE_URL;
  const fetchImpl = opts.fetch || fetch;
  const fileSize = getFileSize(bytes);
  const timer = logger.timer('parse', {
    fileType,
    fileSize,
  });

  if (!apiKey) {
    const error = new Error('FIRECRAWL_API_KEY environment variable is not set');
    timer.error(error, { fileType, fileSize });
    throw error;
  }

  try {
    const formData = new FormData();
    const blob = new Blob([bytes], { type: getMimeType(fileType) });

    formData.append('file', blob, fileName);
    formData.append('formats', JSON.stringify(['markdown']));
    formData.append('parsePDF', opts.parsePDF || 'auto');

    const response = await fetchImpl(parseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(`Firecrawl parse failed (${response.status}): ${responseText || response.statusText}`);
    }

    const body = await response.json();
    const markdown = getMarkdownFromResponse(body);

    if (!markdown || markdown.trim().length === 0) {
      throw new Error('Firecrawl returned no markdown content');
    }

    timer.result({
      markdownChars: markdown.length,
    });

    return {
      text: markdown,
      markdown,
      success: true,
      provider: 'firecrawl',
      metadata: body?.data?.metadata || body?.metadata || null,
    };
  } catch (error) {
    timer.error(error, { fileType, fileSize });
    throw error;
  }
}

export default {
  extractWithFirecrawl,
};
