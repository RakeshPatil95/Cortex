/**
 * Parse the small Markdown subset used by chat responses without injecting HTML.
 * React will continue to escape every text segment when it renders the result.
 */
export function parseBoldMarkdown(value) {
  const input = String(value ?? '');
  const segments = [];
  const boldPattern = /(\*{2,3})([\s\S]+?)\1/g;
  let cursor = 0;

  for (const match of input.matchAll(boldPattern)) {
    if (match.index > cursor) {
      segments.push({ text: input.slice(cursor, match.index), bold: false });
    }

    segments.push({ text: match[2], bold: true });
    cursor = match.index + match[0].length;
  }

  if (cursor < input.length) {
    segments.push({ text: input.slice(cursor), bold: false });
  }

  return segments;
}
