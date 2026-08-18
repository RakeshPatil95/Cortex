import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractWithFirecrawl } from '../src/services/firecrawlProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Minimal .env loader (same approach as reingest-runner.js)
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(rootDir, '.env'));
loadEnvFile(path.join(rootDir, '.env.local'));

async function main() {
  const inputPath = process.argv[2];
  const parsePDF = process.argv[3] || 'auto'; // fast | auto | ocr
  if (!inputPath) {
    console.error('Usage: npx tsx scripts/firecrawl-preview.js <path-to-file.pdf|docx|doc> [fast|auto|ocr]');
    process.exit(1);
  }

  const absPath = path.resolve(inputPath);
  const fileName = path.basename(absPath);
  const fileType = fileName.split('.').pop().toLowerCase();
  const bytes = new Uint8Array(fs.readFileSync(absPath));

  console.log(`\n[firecrawl-preview] sending ${fileName} (${fileType}, ${bytes.byteLength} bytes, parsePDF=${parsePDF})...\n`);

  const result = await extractWithFirecrawl(bytes, fileName, fileType, { parsePDF });

  // Save the raw markdown next to the source file so you can open it
  const outPath = absPath.replace(/\.[^.]+$/, '') + '.firecrawl.md';
  fs.writeFileSync(outPath, result.markdown, 'utf8');

  console.log('===== MARKDOWN START =====\n');
  console.log(result.markdown);
  console.log('\n===== MARKDOWN END =====');
  console.log(`\nprovider: ${result.provider}`);
  console.log(`markdown chars: ${result.markdown.length}`);
  console.log('metadata:', JSON.stringify(result.metadata, null, 2));
  console.log(`\nsaved to: ${outPath}`);
}

main().catch((error) => {
  console.error('[firecrawl-preview] failed:', error.message);
  process.exit(1);
});
