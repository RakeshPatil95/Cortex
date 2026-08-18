import { createLogger } from '../logger.js';

const logger = createLogger('chunking');

function isHeading(line) {
  return /^(#{1,6})\s+(.+?)\s*$/.exec(line);
}

function isTableLine(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

function updateHeadingPath(stack, level, title) {
  const nextStack = stack.slice(0, level - 1);
  nextStack[level - 1] = title.trim();
  return nextStack;
}

function splitIntoSections(markdown) {
  const lines = normalizeWhitespace(markdown).split('\n');
  const sections = [];
  let headingStack = [];
  let current = {
    heading: '',
    sectionPath: [],
    lines: [],
  };

  function flush() {
    const text = current.lines.join('\n').trim();
    if (!text) {
      return;
    }

    sections.push({
      heading: current.heading,
      sectionPath: current.sectionPath,
      text,
    });
  }

  for (const line of lines) {
    const headingMatch = isHeading(line);

    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      headingStack = updateHeadingPath(headingStack, level, title);
      current = {
        heading: title,
        sectionPath: headingStack.filter(Boolean),
        lines: [],
      };
      continue;
    }

    current.lines.push(line);
  }

  flush();
  return sections.length > 0 ? sections : [{
    heading: '',
    sectionPath: [],
    text: normalizeWhitespace(markdown),
  }];
}

function splitIntoBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let current = [];
  let inTable = false;

  function flush() {
    const blockText = current.join('\n').trim();
    if (blockText) {
      blocks.push({
        text: blockText,
        isTable: current.some(isTableLine),
      });
    }
    current = [];
    inTable = false;
  }

  for (const line of lines) {
    const tableLine = isTableLine(line);

    if (!line.trim() && !inTable) {
      flush();
      continue;
    }

    if (inTable && !tableLine && line.trim()) {
      flush();
    }

    current.push(line);
    inTable = tableLine;
  }

  flush();
  return blocks;
}

function splitOversizedBlock(block, maxChars) {
  if (block.text.length <= maxChars || block.isTable) {
    return [block];
  }

  const parts = [];
  const lines = block.text.split('\n');
  let current = [];

  function flush() {
    const text = current.join('\n').trim();
    if (text) {
      parts.push({ text, isTable: false });
    }
    current = [];
  }

  for (const line of lines) {
    const next = [...current, line].join('\n');
    if (next.length > maxChars && current.length > 0) {
      flush();
    }

    if (line.length > maxChars) {
      for (let index = 0; index < line.length; index += maxChars) {
        parts.push({
          text: line.slice(index, index + maxChars).trim(),
          isTable: false,
        });
      }
    } else {
      current.push(line);
    }
  }

  flush();
  return parts;
}

function withHeadingPath(section, text) {
  if (!section.sectionPath || section.sectionPath.length === 0) {
    return text;
  }

  return `${section.sectionPath.map((heading) => `# ${heading}`).join('\n')}\n\n${text}`.trim();
}

function buildChunksForSection(section, options) {
  const maxChars = options.maxChars || 1000;
  const blocks = splitIntoBlocks(section.text)
    .flatMap((block) => splitOversizedBlock(block, maxChars));
  const chunks = [];
  let currentBlocks = [];
  let currentLength = 0;

  function flush() {
    if (currentBlocks.length === 0) {
      return;
    }

    const text = currentBlocks.map((block) => block.text).join('\n\n').trim();
    chunks.push({
      rawText: text,
      text: withHeadingPath(section, text),
      heading: section.heading,
      sectionPath: section.sectionPath,
      tablesKept: currentBlocks.filter((block) => block.isTable).length,
    });
    currentBlocks = [];
    currentLength = 0;
  }

  for (const block of blocks) {
    const separatorLength = currentBlocks.length > 0 ? 2 : 0;
    const nextLength = currentLength + separatorLength + block.text.length;

    if (nextLength > maxChars && currentBlocks.length > 0) {
      flush();
    }

    currentBlocks.push(block);
    currentLength = currentLength + separatorLength + block.text.length;
  }

  flush();
  return chunks;
}

export function chunkMarkdown(markdown, options = {}) {
  const timer = logger.timer('heading-adaptive', {
    chars: markdown?.length || 0,
    maxChars: options.maxChars || 1000,
  });

  try {
    const sections = splitIntoSections(markdown);
    let cursor = 0;
    let tableCount = 0;

    const chunks = sections.flatMap((section) => buildChunksForSection(section, options))
      .map((chunk, index) => {
        const start = cursor;
        cursor += chunk.rawText.length;
        tableCount += chunk.tablesKept;

        return {
          text: chunk.text,
          start,
          end: cursor,
          chunkIndex: index,
          heading: chunk.heading,
          sectionPath: chunk.sectionPath,
        };
      });

    timer.result({
      chunks: chunks.length,
      avgChars: chunks.length > 0
        ? Math.round(chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / chunks.length)
        : 0,
      tablesKept: tableCount,
    });

    return chunks;
  } catch (error) {
    timer.error(error);
    throw error;
  }
}

export function selectStrategy(fileType, markdown = '') {
  const normalizedType = String(fileType || '').toLowerCase();
  const normalizedMarkdown = String(markdown || '').toLowerCase();

  if (['csv', 'xls', 'xlsx'].includes(normalizedType)) {
    return {
      name: 'row-aware',
      chunker: 'heading-adaptive',
      reason: 'spreadsheet-like file type',
    };
  }

  if (
    normalizedType === 'pdf'
    && (
      normalizedMarkdown.includes('<!-- scanned -->')
      || normalizedMarkdown.includes('ocr required')
      || normalizedMarkdown.length < 80
    )
  ) {
    return {
      name: 'ocr-parse',
      chunker: 'heading-adaptive',
      reason: 'scanned or very sparse PDF markdown',
    };
  }

  return {
    name: 'heading-adaptive',
    chunker: 'heading-adaptive',
    reason: 'default markdown document strategy',
  };
}

export default {
  chunkMarkdown,
  selectStrategy,
};
