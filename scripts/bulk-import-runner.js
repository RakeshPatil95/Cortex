/**
 * Bulk case importer.
 *
 * Imports a local folder of case documents into the portal, running the same
 * pipeline the UI does (Firecrawl parse -> LLM field extraction -> Supabase
 * upload -> legal_cases/case_parties/case_documents -> document_chunks ->
 * case_vectors), but in two reviewable phases and with the AI ingestion AWAITED
 * rather than fire-and-forget as in POST /api/cases.
 *
 * PHASE 1 — extract (default, no writes anywhere):
 *   node scripts/bulk-import.js --dir ./inbox
 * Parses each case document, extracts fields + parties, and writes one JSON per
 * case plus the cached markdown into the staging dir. Re-runnable; review and
 * hand-edit the JSON before committing.
 *
 * PHASE 2 — commit (writes):
 *   node scripts/bulk-import.js --commit
 * Reads the reviewed staging JSON and creates each case, uploads its files, and
 * ingests them for search. Resumable via the staging manifest; the cached
 * markdown is reused so Firecrawl is not billed twice per document.
 *
 * Folder layout — either is accepted:
 *   inbox/case-a.pdf, inbox/case-b.pdf          one case per file
 *   inbox/case-a/{petition.pdf, exhibit.docx}   one case per subfolder; the
 *                                               first file drives extraction,
 *                                               all files are ingested
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@/generated/prisma';
import {
  extractTextFromDocument,
  processDocument,
  storeCaseVector,
} from '@/services/documentProcessor.js';
import {
  extractCaseFields,
  normalizeExtractedFields,
  backfillCivilIds,
} from '@/services/cases/fieldExtractor.js';
import { createLogger } from '@/services/logger.js';
import { loadEnvFile } from './lib/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const logger = createLogger('bulk-import');

const SUPPORTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt'];

const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

// Matches the extract route's floor: below this, Firecrawl effectively returned
// nothing usable (scanned/handwritten) and the LLM call would only burn tokens.
const MIN_MARKDOWN_CHARS = 20;

const STORAGE_BUCKET = 'legal-documents';

// Firecrawl enforces a per-minute request cap that a 50-document batch blows
// through immediately (observed: ~10 req/min on the current plan, then 429 for
// every subsequent parse). Requests are spaced globally across lanes and 429s
// are retried with backoff rather than being recorded as failures.
const DEFAULT_RPM = 8;
const RATE_LIMIT_RETRIES = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRateLimited(error) {
  return /\b429\b|rate limit/i.test(error?.message || '');
}

// Transient network/server faults deserve the same retry as a rate limit: a
// single dropped connection should not strand a document in a 50-file batch.
function isTransient(error) {
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|\b(50[0234])\b/i
    .test(error?.message || '');
}

/**
 * Global spacing gate. Every Firecrawl-bound call awaits it, so `--concurrency`
 * controls parallelism of the local work while `--rpm` alone bounds the API rate.
 */
function createRateGate(rpm) {
  const minInterval = rpm > 0 ? Math.ceil(60000 / rpm) : 0;
  let chain = Promise.resolve();
  let lastStart = 0;

  return function gate() {
    chain = chain.then(async () => {
      if (!minInterval) return;
      const wait = lastStart + minInterval - Date.now();
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
    });
    return chain;
  };
}

/**
 * Parse one file, waiting out rate limits. Only the throttled/retried path
 * differs from calling extractTextFromDocument directly.
 */
async function extractWithRateLimit(file, fileType, { gate, label, onRetry }) {
  const needsApi = String(fileType || '').toLowerCase() !== 'txt';

  for (let attempt = 1; ; attempt += 1) {
    if (needsApi) await gate();

    try {
      return await extractTextFromDocument(file, fileType);
    } catch (error) {
      const limited = isRateLimited(error);
      if ((!limited && !isTransient(error)) || attempt > RATE_LIMIT_RETRIES) {
        throw error;
      }
      // Firecrawl states its own reset window ("please retry after 37s"); prefer
      // it over guessing, with a small cushion, and fall back to backoff.
      const stated = limited && /retry after (\d+)s/i.exec(error.message || '');
      // A network blip needs seconds, not a rate-limit window.
      const waitMs = stated
        ? Math.min(90000, (Number.parseInt(stated[1], 10) + 3) * 1000)
        : limited
          ? Math.min(60000, 20000 * attempt)
          : Math.min(15000, 3000 * attempt);
      onRetry?.({ label, attempt, waitMs, reason: limited ? 'rate limited' : 'transient network error' });
      await sleep(waitMs);
    }
  }
}

const USAGE = `
Bulk case importer

  Phase 1 (extract, no writes):
    node scripts/bulk-import.js --dir <folder> [options]

  Phase 2 (commit):
    node scripts/bulk-import.js --commit [options]

Options
  --dir <path>            Folder of case documents (required for phase 1)
  --staging <path>        Staging dir for extraction output
                          (default: .bulk-import)
  --commit                Run phase 2: create cases and ingest for search
  --plan                  With --commit: resolve serials/conflicts and print the
                          plan without writing anything
  --limit <n>             Process at most n cases still needing work, so the
                          same --limit can be repeated to work in batches
  --concurrency <n>       Parallel cases (default: 3)
  --rpm <n>               Max Firecrawl parses per minute; 429s are retried with
                          backoff regardless (default: 8, 0 disables throttling)
  --language <ar|en>      Language for extracted free text. Default ar: names and
                          memos are kept as written so Arabic searches match the
                          case and party rows, not just the document chunks
  --max-size-mb <n>       Per-file size cap (default: 10)
  --serial-prefix <s>     Prefix for generated serial numbers (default: IMP)
  --on-conflict <policy>  skip | suffix | fail, when serialNumber already
                          exists in the DB (default: skip)
  --owner-email <email>   Case owner (default: $ALLOWED_EMAIL)
  --owner-id <id>         Owner user id (default: 1, matching the credentials
                          provider in src/config/auth.js)
  --force                 Phase 1: re-extract cases already staged
  --help                  Show this message
`;

function parseArgs(argv) {
  const args = {
    dir: '',
    staging: '.bulk-import',
    commit: false,
    plan: false,
    limit: Infinity,
    concurrency: 3,
    rpm: DEFAULT_RPM,
    language: 'ar',
    maxSizeMb: 10,
    serialPrefix: 'IMP',
    onConflict: 'skip',
    ownerEmail: '',
    ownerId: '',
    force: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      return argv[index];
    };

    switch (arg) {
      case '--dir': args.dir = next() || ''; break;
      case '--staging': args.staging = next() || args.staging; break;
      case '--commit': args.commit = true; break;
      case '--plan': args.plan = true; break;
      case '--limit': args.limit = Number.parseInt(next() || '0', 10) || Infinity; break;
      case '--concurrency': args.concurrency = Math.max(1, Number.parseInt(next() || '3', 10) || 3); break;
      case '--rpm': args.rpm = Math.max(0, Number.parseFloat(next() || String(DEFAULT_RPM)) || DEFAULT_RPM); break;
      case '--language': args.language = next() === 'en' ? 'en' : 'ar'; break;
      case '--max-size-mb': args.maxSizeMb = Number.parseFloat(next() || '10') || 10; break;
      case '--serial-prefix': args.serialPrefix = next() || args.serialPrefix; break;
      case '--on-conflict': args.onConflict = next() || 'skip'; break;
      case '--owner-email': args.ownerEmail = next() || ''; break;
      case '--owner-id': args.ownerId = next() || ''; break;
      case '--force': args.force = true; break;
      case '--help':
      case '-h': args.help = true; break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  if (!['skip', 'suffix', 'fail'].includes(args.onConflict)) {
    throw new Error(`--on-conflict must be skip, suffix or fail (got "${args.onConflict}")`);
  }

  return args;
}

function extensionOf(fileName) {
  return path.extname(fileName).replace('.', '').toLowerCase();
}

function isSupportedFile(fileName) {
  return SUPPORTED_EXTENSIONS.includes(extensionOf(fileName));
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase() || 'case';
}

/** Read a local file into a File, the shape the document services expect. */
function readAsFile(absolutePath) {
  const buffer = fs.readFileSync(absolutePath);
  const name = path.basename(absolutePath);
  return new File([buffer], name, { type: MIME_BY_EXTENSION[extensionOf(name)] || 'application/octet-stream' });
}

function titleFromFileName(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  return base.replace(/[-_]+/g, ' ').trim() || fileName;
}

/**
 * Group a folder into case units. A subdirectory becomes one case containing all
 * its supported files; a loose file becomes a single-document case.
 */
function discoverCaseUnits(dir, maxBytes) {
  const absoluteDir = path.resolve(rootDir, dir);
  if (!fs.existsSync(absoluteDir)) {
    throw new Error(`--dir not found: ${absoluteDir}`);
  }

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const units = [];
  const rejected = [];

  // The first file drives field extraction, so order by size descending: the
  // substantive pleading is the richest text in the folder, and an alphabetically
  // earlier scrap (an exhibit note, a covering letter) would otherwise be used
  // to extract the whole case. Name is the tie-break so ordering stays stable.
  const byExtractionValue = (a, b) => b.size - a.size || a.fileName.localeCompare(b.fileName);

  const collectFiles = (unitDir, fileNames) => {
    const files = [];
    for (const fileName of fileNames) {
      const absolutePath = path.join(unitDir, fileName);
      if (!isSupportedFile(fileName)) {
        rejected.push({ file: absolutePath, reason: `unsupported extension .${extensionOf(fileName)}` });
        continue;
      }
      const { size } = fs.statSync(absolutePath);
      if (size > maxBytes) {
        rejected.push({ file: absolutePath, reason: `exceeds size cap (${(size / 1024 / 1024).toFixed(1)}MB)` });
        continue;
      }
      files.push({ absolutePath, fileName, size });
    }
    return files.sort(byExtractionValue);
  };

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const unitDir = path.join(absoluteDir, entry.name);
      const fileNames = fs.readdirSync(unitDir, { withFileTypes: true })
        .filter((child) => child.isFile())
        .map((child) => child.name)
        .sort((a, b) => a.localeCompare(b));
      const files = collectFiles(unitDir, fileNames);
      if (files.length > 0) {
        units.push({ slug: slugify(entry.name), sourceDir: unitDir, files });
      }
      continue;
    }

    if (entry.isFile()) {
      const files = collectFiles(absoluteDir, [entry.name]);
      if (files.length > 0) {
        units.push({
          slug: slugify(path.basename(entry.name, path.extname(entry.name))),
          sourceDir: absoluteDir,
          files,
        });
      }
    }
  }

  // Keep slugs unique so staging files never collide.
  const seen = new Map();
  for (const unit of units) {
    const count = (seen.get(unit.slug) || 0) + 1;
    seen.set(unit.slug, count);
    if (count > 1) {
      unit.slug = `${unit.slug}-${count}`;
    }
  }

  return { units, rejected };
}

/** Bounded-parallelism map. The worker owns its own error handling. */
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const lanes = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    },
  );

  await Promise.all(lanes);
  return results;
}

/** Repo-relative when inside the repo, absolute otherwise. */
function displayPath(target) {
  const relative = path.relative(rootDir, target);
  return relative.startsWith('..') ? target : relative;
}

/**
 * A unit counts as done only when its staged record exists AND recorded no
 * error. Used by both the batch selector and the per-unit guard, which must
 * agree or selected work gets silently skipped.
 */
function isAlreadyExtracted(casePath) {
  const staged = readJson(casePath);
  return Boolean(staged) && !staged.error;
}

function stagingPaths(staging) {
  const dir = path.resolve(rootDir, staging);
  return {
    dir,
    cases: path.join(dir, 'cases'),
    markdown: path.join(dir, 'markdown'),
    manifest: path.join(dir, '_manifest.json'),
    summary: path.join(dir, '_summary.json'),
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// Phase 1 — extract
// ---------------------------------------------------------------------------

async function extractUnit(unit, paths, args, context) {
  const casePath = path.join(paths.cases, `${unit.slug}.json`);

  if (!args.force && isAlreadyExtracted(casePath)) {
    return { slug: unit.slug, status: 'already-staged' };
  }

  const timer = logger.timer('extract case', { slug: unit.slug, files: unit.files.length });

  try {
    const primary = unit.files[0];
    const file = readAsFile(primary.absolutePath);
    const extracted = await extractWithRateLimit(file, extensionOf(primary.fileName), context);
    const markdown = extracted?.markdown || extracted?.text || '';
    const warnings = [];

    let fields = {};
    let parties = [];
    let document = null;

    if (markdown.trim().length < MIN_MARKDOWN_CHARS) {
      warnings.push('Could not read enough text from the document to auto-fill; fill this JSON in manually before committing.');
    } else {
      const raw = await extractCaseFields(markdown, { language: args.language });
      if (!raw) {
        warnings.push('Auto-fill could not interpret the document; review this JSON before committing.');
      }
      const normalized = normalizeExtractedFields(raw);
      fields = normalized.fields;
      document = normalized.document;
      parties = backfillCivilIds(normalized.parties, markdown);
    }

    const markdownPath = path.join(paths.markdown, `${unit.slug}.md`);
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, markdown);

    const readiness = {
      markdownChars: markdown.length,
      hasSerialNumber: Boolean(fields.serialNumber),
      hasCaseNumber: Boolean(fields.caseNumber),
      hasCaseCategory: Boolean(fields.caseCategory),
      // The create form requires this client-side; POST /api/cases does not, so
      // the importer only warns.
      hasPartyWithCivilId: parties.some((party) => party.name && party.civilId),
      parties: parties.length,
    };

    if (!readiness.hasPartyWithCivilId && parties.length > 0) {
      warnings.push('No party has a civil ID. The portal form requires one; the API does not, so this will import — add it here or in the portal afterwards.');
    }
    if (parties.length === 0 && readiness.markdownChars >= MIN_MARKDOWN_CHARS) {
      warnings.push('No parties were extracted. Add them to this JSON or in the portal afterwards.');
    }

    const record = {
      slug: unit.slug,
      extractedAt: new Date().toISOString(),
      source: {
        dir: unit.sourceDir,
        files: unit.files.map((entry) => ({
          fileName: entry.fileName,
          absolutePath: entry.absolutePath,
          size: entry.size,
          mimeType: MIME_BY_EXTENSION[extensionOf(entry.fileName)],
        })),
      },
      markdownPath: path.relative(paths.dir, markdownPath),
      fields,
      parties,
      document,
      readiness,
      warnings,
    };

    writeJson(casePath, record);
    timer.result({ markdownChars: markdown.length, parties: parties.length });

    return { slug: unit.slug, status: 'extracted', record };
  } catch (error) {
    timer.error(error, { slug: unit.slug });
    const record = {
      slug: unit.slug,
      extractedAt: new Date().toISOString(),
      source: {
        dir: unit.sourceDir,
        files: unit.files.map((entry) => ({
          fileName: entry.fileName,
          absolutePath: entry.absolutePath,
          size: entry.size,
          mimeType: MIME_BY_EXTENSION[extensionOf(entry.fileName)],
        })),
      },
      error: error.message,
      fields: {},
      parties: [],
      document: null,
      readiness: null,
      warnings: [`Extraction failed: ${error.message}`],
    };
    writeJson(casePath, record);
    return { slug: unit.slug, status: 'failed', error: error.message };
  }
}

async function runExtractPhase(args) {
  if (!args.dir) {
    throw new Error('Phase 1 needs --dir <folder>. Pass --commit to run phase 2 instead.');
  }

  const paths = stagingPaths(args.staging);
  const { units, rejected } = discoverCaseUnits(args.dir, args.maxSizeMb * 1024 * 1024);

  // --limit counts units that still need extracting, not units discovered, so
  // repeating `--limit 5` walks the folder in batches instead of re-picking the
  // same first five. Matches how the commit phase limits `pending`.
  // A staged record that recorded an error is NOT done — a rate-limited or
  // otherwise failed extraction must be retried by a plain re-run, without
  // --force re-billing the ones that already succeeded.
  const alreadyStaged = args.force
    ? []
    : units.filter((unit) => isAlreadyExtracted(path.join(paths.cases, `${unit.slug}.json`)));
  const stagedSlugs = new Set(alreadyStaged.map((unit) => unit.slug));
  const candidates = units.filter((unit) => !stagedSlugs.has(unit.slug));
  const selected = candidates.slice(0, args.limit === Infinity ? candidates.length : args.limit);

  console.log(`Discovered ${units.length} case unit(s) in ${path.resolve(rootDir, args.dir)}`);
  if (rejected.length > 0) {
    console.log(`Skipped ${rejected.length} file(s):`);
    for (const entry of rejected) {
      console.log(`  - ${displayPath(entry.file)} — ${entry.reason}`);
    }
  }
  if (alreadyStaged.length > 0) {
    console.log(`Already staged: ${alreadyStaged.length} (--force to re-extract).`);
  }
  if (selected.length < candidates.length) {
    console.log(`Extracting ${selected.length} of ${candidates.length} remaining (--limit).`);
  }
  if (selected.length === 0) {
    console.log('');
    console.log(candidates.length === 0
      ? 'Nothing left to extract. Next: node scripts/bulk-import.js --commit --plan'
      : 'Nothing selected — raise --limit to extract more.');
    return 0;
  }

  const gate = createRateGate(args.rpm);
  const onRetry = ({ label, attempt, waitMs, reason }) => {
    console.log(`  ${label}: ${reason} — retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${RATE_LIMIT_RETRIES})`);
  };

  if (args.rpm > 0) {
    console.log(`Throttling Firecrawl to ${args.rpm} parse(s)/min (--rpm).`);
  }
  console.log('');

  const results = await runPool(selected, args.concurrency, async (unit) => {
    const result = await extractUnit(unit, paths, args, { gate, onRetry, label: unit.slug });
    const label = result.status === 'extracted' ? 'ok'
      : result.status === 'already-staged' ? 'staged (use --force to redo)'
        : `FAILED — ${result.error}`;
    console.log(`  ${unit.slug}: ${label}`);
    return result;
  });

  const staged = fs.existsSync(paths.cases)
    ? fs.readdirSync(paths.cases).filter((name) => name.endsWith('.json'))
      .map((name) => readJson(path.join(paths.cases, name)))
      .filter(Boolean)
    : [];

  const needsAttention = staged.filter((record) => (record.warnings || []).length > 0 || record.error);
  const summary = {
    generatedAt: new Date().toISOString(),
    sourceDir: path.resolve(rootDir, args.dir),
    discovered: units.length,
    processed: results.filter((r) => r?.status === 'extracted').length,
    alreadyStaged: alreadyStaged.length,
    remaining: candidates.length - selected.length,
    failed: results.filter((r) => r?.status === 'failed').length,
    rejectedFiles: rejected,
    needsAttention: needsAttention.map((record) => ({
      slug: record.slug,
      serialNumber: record.fields?.serialNumber || null,
      warnings: record.warnings || [],
    })),
  };

  writeJson(paths.summary, summary);

  console.log('');
  console.log(`Extracted ${summary.processed}, already staged ${summary.alreadyStaged}, failed ${summary.failed}, remaining ${summary.remaining}.`);
  if (needsAttention.length > 0) {
    console.log('');
    console.log(`${needsAttention.length} case(s) need review before committing:`);
    for (const record of needsAttention) {
      console.log(`  - ${record.slug}`);
      for (const warning of record.warnings || []) {
        console.log(`      ${warning}`);
      }
    }
  }
  console.log('');
  console.log(`Staged JSON:  ${displayPath(paths.cases)}/`);
  console.log(`Summary:      ${displayPath(paths.summary)}`);
  console.log('Review/edit the JSON, then run: node scripts/bulk-import.js --commit');

  return summary.failed > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Phase 2 — commit
// ---------------------------------------------------------------------------

function createSupabaseAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to commit');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Mirrors the user upsert in POST /api/cases so imported cases are owned by the
 * same user the portal session resolves to. Read-only under --plan, which must
 * not write anything.
 */
async function resolveOwner(prisma, args, { readOnly = false } = {}) {
  const email = args.ownerEmail || process.env.ALLOWED_EMAIL;
  if (!email) {
    throw new Error('No owner email. Pass --owner-email or set ALLOWED_EMAIL.');
  }

  const id = args.ownerId || '1';

  if (readOnly) {
    const existing = await prisma.user.findUnique({ where: { email } });
    return existing || { id, email, name: 'Admin User', wouldBeCreated: true };
  }

  return prisma.user.upsert({
    where: { email },
    update: { id, name: 'Admin User' },
    create: { id, email, name: 'Admin User' },
  });
}

/**
 * Assign a final serialNumber to every record before any writes, so concurrent
 * lanes cannot race on uniqueness. Returns records annotated with
 * `resolvedSerial` and, when skipped, `skipReason`.
 */
async function resolveSerialNumbers(prisma, records, args, reservedSerials = []) {
  const proposed = records.map((record) => record.fields?.serialNumber || null).filter(Boolean);

  const existing = new Set(
    proposed.length > 0
      ? (await prisma.legalCase.findMany({
        where: { serialNumber: { in: proposed } },
        select: { serialNumber: true },
      })).map((row) => row.serialNumber)
      : [],
  );

  // Generated serials continue after the highest existing one for the prefix/year.
  const year = new Date().getFullYear();
  const generatedPrefix = `${args.serialPrefix}-${year}-`;
  const priorGenerated = await prisma.legalCase.findMany({
    where: { serialNumber: { startsWith: generatedPrefix } },
    select: { serialNumber: true },
  });
  let nextSequence = priorGenerated.reduce((max, row) => {
    const parsed = Number.parseInt(row.serialNumber.slice(generatedPrefix.length), 10);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);

  // Serials held by cases being resumed this run are already persisted, so they
  // are unavailable — don't rely on the `existing` lookup alone to catch them.
  const taken = new Set([...existing, ...reservedSerials.filter(Boolean)]);

  return records.map((record) => {
    const proposedSerial = record.fields?.serialNumber || null;

    if (!proposedSerial) {
      do {
        nextSequence += 1;
      } while (taken.has(`${generatedPrefix}${String(nextSequence).padStart(3, '0')}`));
      const generated = `${generatedPrefix}${String(nextSequence).padStart(3, '0')}`;
      taken.add(generated);
      return { ...record, resolvedSerial: generated, serialOrigin: 'generated' };
    }

    if (!taken.has(proposedSerial)) {
      taken.add(proposedSerial);
      return { ...record, resolvedSerial: proposedSerial, serialOrigin: 'document' };
    }

    // Distinguish a pre-existing case from two source documents that extracted
    // the same serial — with 50 documents the operator needs to know which.
    const clash = existing.has(proposedSerial)
      ? 'already exists in the database'
      : reservedSerials.includes(proposedSerial)
        ? 'belongs to a case being resumed in this run'
        : 'is claimed by an earlier document in this batch';

    if (args.onConflict === 'fail' || args.onConflict === 'skip') {
      return {
        ...record,
        resolvedSerial: proposedSerial,
        serialOrigin: 'conflict',
        skipReason: `serialNumber "${proposedSerial}" ${clash} (--on-conflict ${args.onConflict})`,
      };
    }

    let suffix = 2;
    while (taken.has(`${proposedSerial}-${suffix}`)) {
      suffix += 1;
    }
    const suffixed = `${proposedSerial}-${suffix}`;
    taken.add(suffixed);
    return { ...record, resolvedSerial: suffixed, serialOrigin: 'suffixed' };
  });
}

function buildDocumentRows(record, ownerId) {
  const serialSlug = slugify(record.resolvedSerial).toUpperCase();
  const suggested = record.document || {};

  return record.source.files.map((entry, index) => {
    const extension = extensionOf(entry.fileName);
    const uniqueDocumentId = `DOC-${serialSlug}-${index + 1}`;
    const fileName = `${uniqueDocumentId}.${extension}`;

    return {
      uniqueDocumentId,
      title: (index === 0 && suggested.title) || titleFromFileName(entry.fileName),
      fileName,
      originalName: entry.fileName,
      description: (index === 0 && suggested.description) || null,
      fileSize: entry.size,
      mimeType: entry.mimeType || MIME_BY_EXTENSION[extension] || 'application/octet-stream',
      filePath: `cases/${record.resolvedSerial}/documents/${fileName}`,
      documentType: (index === 0 && suggested.documentType) || null,
      tags: (index === 0 && Array.isArray(suggested.tags)) ? suggested.tags : [],
      uploadedById: ownerId,
      absolutePath: entry.absolutePath,
      isPrimary: index === 0,
    };
  });
}

/**
 * Create (or, when `record.resumeCaseId` is set, re-open) one case and ingest its
 * documents. Resume exists because the case row, its documents and the vector
 * writes are not one transaction: if ingestion failed on an earlier run the case
 * already exists, and re-creating it would collide on serialNumber.
 */
async function commitRecord(record, context) {
  const { prisma, supabase, owner, paths, args } = context;
  const rateContext = { gate: context.gate, onRetry: context.onRetry, label: record.slug };
  const resuming = Boolean(record.resumeCaseId);
  const timer = logger.timer(resuming ? 'resume case' : 'commit case', {
    slug: record.slug,
    serialNumber: record.resolvedSerial,
  });
  let caseId = record.resumeCaseId || null;

  try {
    const documentRows = buildDocumentRows(record, owner.id);
    const fields = record.fields || {};

    // Upload every file first: a storage failure should not leave a case row
    // pointing at a missing object. `upsert: true` keeps retries idempotent —
    // POST /api/cases uses `upsert: false` and silently skips on collision.
    for (const row of documentRows) {
      const buffer = fs.readFileSync(row.absolutePath);
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(row.filePath, buffer, {
          contentType: row.mimeType,
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        throw new Error(`Storage upload failed for ${row.originalName}: ${error.message}`);
      }
    }

    const caseSelect = {
      id: true,
      serialNumber: true,
      caseNumber: true,
      caseType: true,
      caseCategory: true,
      caseSubType: true,
      currentStage: true,
      assignedTo: true,
      publicProsecutorMemo: true,
      status: true,
      priority: true,
      createdById: true,
      filedDate: true,
      nextHearing: true,
      parties: true,
    };

    // On resume the case, parties and document rows are already persisted; only
    // the chunk/vector writes need redoing (both are idempotent upserts).
    const newCase = resuming
      ? await prisma.legalCase.findUniqueOrThrow({ where: { id: caseId }, select: caseSelect })
      : await prisma.legalCase.create({
      data: {
        serialNumber: record.resolvedSerial,
        // caseNumber is required; the form derives caseType from the category.
        caseNumber: fields.caseNumber || record.resolvedSerial,
        caseType: fields.caseCategory || 'Unknown',
        caseCategory: fields.caseCategory || null,
        caseSubType: fields.caseSubType || null,
        currentStage: fields.currentStage || null,
        assignedTo: fields.assignedTo || null,
        publicProsecutorMemo: fields.publicProsecutorMemo || null,
        status: fields.status || 'active',
        priority: fields.priority || 'medium',
        filedDate: fields.filedDate ? new Date(fields.filedDate) : new Date(),
        nextHearing: fields.nextHearing ? new Date(fields.nextHearing) : null,
        createdById: owner.id,
        parties: {
          create: (record.parties || [])
            .filter((party) => party.name)
            .map((party) => ({
              name: party.name,
              civilId: party.civilId || null,
              role: party.role || 'other',
              address: party.address || null,
              phone: party.phone || null,
              email: party.email || null,
              notes: party.notes || null,
              isActive: true,
            })),
        },
        documents: {
          create: documentRows.map(({ absolutePath, isPrimary, ...row }) => row),
        },
      },
      select: caseSelect,
    });

    caseId = newCase.id;

    // Awaited, unlike the fire-and-forget calls in POST /api/cases, so a failure
    // here is reported instead of silently leaving the case unsearchable.
    const cachedMarkdown = record.markdownPath
      ? path.join(paths.dir, record.markdownPath)
      : null;
    const extractedData = cachedMarkdown && fs.existsSync(cachedMarkdown)
      ? (() => {
        const markdown = fs.readFileSync(cachedMarkdown, 'utf8');
        return markdown.trim().length > 0
          ? { text: markdown, markdown, success: true, provider: 'cache' }
          : null;
      })()
      : null;

    const ingested = [];
    for (const row of documentRows) {
      const file = readAsFile(row.absolutePath);
      // Phase 1 only cached the primary file's markdown; anything else is parsed
      // here, through the same throttle/retry path so a big batch cannot trip the
      // per-minute cap. processDocument therefore never parses on its own.
      const documentExtraction = (row.isPrimary && extractedData)
        || await extractWithRateLimit(file, extensionOf(row.originalName), rateContext);

      const result = await processDocument(file, {
        documentId: row.uniqueDocumentId,
        caseId: newCase.id,
        documentTitle: row.title,
        documentType: row.documentType || 'unknown',
        filePath: row.filePath,
        fileName: row.fileName,
        originalName: row.originalName,
        userId: owner.id,
        userName: owner.name,
        userEmail: owner.email,
      }, { extractedData: documentExtraction });

      ingested.push({
        documentId: row.uniqueDocumentId,
        chunks: result.totalChunks,
        upserted: result.upsertedCount,
      });
    }

    await storeCaseVector(newCase);

    timer.result({ caseId: newCase.id, documents: ingested.length });

    return {
      slug: record.slug,
      status: 'imported',
      resumed: resuming,
      caseId: newCase.id,
      serialNumber: newCase.serialNumber,
      serialOrigin: record.serialOrigin,
      parties: newCase.parties.length,
      documents: ingested,
      at: new Date().toISOString(),
    };
  } catch (error) {
    timer.error(error, { slug: record.slug });
    return {
      slug: record.slug,
      status: 'failed',
      serialNumber: record.resolvedSerial,
      // Recorded so the next run resumes ingestion instead of colliding on the
      // serial number of the case this run already created.
      caseId,
      error: error.message,
      at: new Date().toISOString(),
    };
  }
}

async function runCommitPhase(args) {
  const paths = stagingPaths(args.staging);

  if (!fs.existsSync(paths.cases)) {
    throw new Error(`No staged cases at ${paths.cases}. Run phase 1 first: node scripts/bulk-import.js --dir <folder>`);
  }

  const manifest = readJson(paths.manifest, { entries: {} });
  const prisma = new PrismaClient();
  const staged = fs.readdirSync(paths.cases)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readJson(path.join(paths.cases, name)))
    .filter(Boolean);

  const skipped = [];
  const pending = [];
  const resumable = [];

  // The manifest records what a previous run did, but the database is the
  // authority: a case deleted in the portal (or a reset DB) leaves a manifest
  // entry claiming success for a row that no longer exists. Trusting it blindly
  // would skip that case forever, so every remembered caseId is verified first.
  const rememberedIds = Object.values(manifest.entries)
    .map((entry) => entry?.caseId)
    .filter(Boolean);
  const liveIds = new Set(
    rememberedIds.length > 0
      ? (await prisma.legalCase.findMany({
        where: { id: { in: rememberedIds } },
        select: { id: true },
      })).map((row) => row.id)
      : [],
  );
  const stale = [];

  for (const record of staged) {
    const prior = manifest.entries[record.slug];
    const priorIsLive = Boolean(prior?.caseId) && liveIds.has(prior.caseId);

    if (prior?.status === 'imported') {
      if (priorIsLive) {
        skipped.push({ slug: record.slug, reason: `already imported as ${prior.serialNumber}` });
        continue;
      }
      // Recorded as imported but gone from the database — import it again.
      stale.push({ slug: record.slug, serialNumber: prior.serialNumber });
      pending.push(record);
      continue;
    }
    // A previous run created the case but failed before finishing ingestion.
    // Keep its serial and case id, and redo only the idempotent vector writes —
    // but only if that case row is actually still there.
    if (prior?.status === 'failed' && prior.caseId) {
      if (priorIsLive) {
        resumable.push({
          ...record,
          resumeCaseId: prior.caseId,
          resolvedSerial: prior.serialNumber,
          serialOrigin: 'resumed',
        });
        continue;
      }
      stale.push({ slug: record.slug, serialNumber: prior.serialNumber });
      pending.push(record);
      continue;
    }
    if (record.error) {
      skipped.push({ slug: record.slug, reason: `extraction failed: ${record.error}` });
      continue;
    }
    if (!record.source?.files?.length) {
      skipped.push({ slug: record.slug, reason: 'no source files in staged JSON' });
      continue;
    }
    pending.push(record);
  }

  // --limit caps new cases; half-finished ones always get their retry.
  const selected = pending.slice(0, args.limit === Infinity ? pending.length : args.limit);

  if (stale.length > 0) {
    console.log(`${stale.length} manifest entr(ies) name a case that is no longer in the database — re-importing:`);
    for (const entry of stale) {
      console.log(`  - ${entry.slug} (was ${entry.serialNumber})`);
    }
    console.log('');
  }

  try {
    const owner = await resolveOwner(prisma, args, { readOnly: args.plan });
    const resolved = await resolveSerialNumbers(
      prisma,
      selected,
      args,
      resumable.map((record) => record.resolvedSerial),
    );

    const conflicted = resolved.filter((record) => record.skipReason);
    const importable = [...resumable, ...resolved.filter((record) => !record.skipReason)];

    console.log(`Staged: ${staged.length} | ready: ${importable.length}${resumable.length ? ` (${resumable.length} resuming)` : ''} | skipped: ${skipped.length + conflicted.length}`);
    console.log(`Owner: ${owner.email} (${owner.id})${owner.wouldBeCreated ? ' — would be created' : ''}`);
    console.log('');

    for (const entry of skipped) {
      console.log(`  - ${entry.slug}: skipped — ${entry.reason}`);
    }
    for (const record of conflicted) {
      console.log(`  - ${record.slug}: skipped — ${record.skipReason}`);
    }

    if (args.onConflict === 'fail' && conflicted.length > 0) {
      throw new Error(`${conflicted.length} serial number conflict(s) with --on-conflict fail`);
    }

    if (args.plan) {
      console.log('');
      console.log('Plan (--plan, nothing written):');
      for (const record of importable) {
        const docs = buildDocumentRows(record, owner.id);
        const action = record.resumeCaseId ? 'resume ingestion of' : 'create';
        console.log(`  ${record.slug} -> ${action} ${record.resolvedSerial} (${record.serialOrigin}), parties: ${(record.parties || []).length}, docs: ${docs.length}`);
      }
      return 0;
    }

    if (importable.length === 0) {
      console.log('');
      console.log('Nothing to import.');
      return 0;
    }

    const supabase = createSupabaseAdminClient();
    const context = {
      prisma,
      supabase,
      owner,
      paths,
      args,
      gate: createRateGate(args.rpm),
      onRetry: ({ label, attempt, waitMs, reason }) => {
        console.log(`  ${label}: ${reason} — retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${RATE_LIMIT_RETRIES})`);
      },
    };

    console.log('');
    const results = await runPool(importable, args.concurrency, async (record) => {
      const result = await commitRecord(record, context);
      console.log(result.status === 'imported'
        ? `  ${record.slug}: ${result.resumed ? 're-ingested' : 'imported'} ${result.serialNumber} (case ${result.caseId}, ${result.documents.length} doc(s), ${result.documents.reduce((sum, d) => sum + d.chunks, 0)} chunks)`
        : `  ${record.slug}: FAILED — ${result.error}`);

      // Persist after each case so an interrupted run stays resumable.
      manifest.entries[record.slug] = result;
      manifest.updatedAt = new Date().toISOString();
      writeJson(paths.manifest, manifest);

      return result;
    });

    const imported = results.filter((r) => r.status === 'imported').length;
    const failed = results.filter((r) => r.status === 'failed');

    console.log('');
    console.log(`Imported ${imported}, failed ${failed.length}, skipped ${skipped.length + conflicted.length}.`);
    console.log(`Manifest: ${displayPath(paths.manifest)}`);
    if (failed.length > 0) {
      console.log('');
      console.log('Failures (re-run the same command to retry these):');
      for (const result of failed) {
        console.log(`  - ${result.slug}: ${result.error}`);
      }
    }

    return failed.length > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function main() {
  loadEnvFile(path.join(rootDir, '.env'));

  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    console.log(USAGE);
    return;
  }

  const timer = logger.timer('run', { commit: args.commit, plan: args.plan });

  try {
    process.exitCode = args.commit
      ? await runCommitPhase(args)
      : await runExtractPhase(args);
    timer.result({ exitCode: process.exitCode || 0 });
  } catch (error) {
    timer.error(error);
    console.error('');
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
