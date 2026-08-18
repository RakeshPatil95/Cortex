import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@/generated/prisma';
import { processDocument } from '@/services/documentProcessor.js';
import { createLogger } from '@/services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const logger = createLogger('reingest');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: 25,
    fixture: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--limit') {
      args.limit = Number.parseInt(argv[index + 1] || '25', 10);
      index += 1;
    } else if (arg === '--fixture') {
      args.fixture = argv[index + 1] || '';
      index += 1;
    }
  }

  return args;
}

function normalizeFixtureDocument(document) {
  return {
    id: document.id || document.uniqueDocumentId,
    uniqueDocumentId: document.uniqueDocumentId || document.id,
    caseId: document.caseId,
    title: document.title || document.originalName || document.fileName,
    documentType: document.documentType || 'unknown',
    filePath: document.filePath,
    fileName: document.fileName || document.originalName,
    originalName: document.originalName || document.fileName,
    mimeType: document.mimeType || 'application/pdf',
    uploadedById: document.uploadedById || document.userId,
    uploadedBy: document.uploadedBy || {
      id: document.uploadedById || document.userId,
      name: document.userName || 'Fixture User',
      email: document.userEmail || 'fixture@example.com',
    },
  };
}

async function loadDocumentsFromFixture(fixturePath, limit) {
  const absolutePath = path.resolve(rootDir, fixturePath);
  const documents = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  return documents.slice(0, limit).map(normalizeFixtureDocument);
}

async function loadDocumentsFromDatabase(limit) {
  const prisma = new PrismaClient();

  try {
    return await prisma.caseDocument.findMany({
      take: limit,
      orderBy: {
        uploadedAt: 'asc',
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

function createSupabaseAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase URL and service role key are required for live re-ingestion');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function processLiveDocument(supabase, document) {
  const { data, error } = await supabase.storage
    .from('legal-documents')
    .download(document.filePath);

  if (error) {
    throw new Error(`Failed to download ${document.filePath}: ${error.message}`);
  }

  const file = new File([data], document.originalName, { type: document.mimeType });

  return processDocument(file, {
    documentId: document.uniqueDocumentId,
    caseId: document.caseId,
    documentTitle: document.title,
    documentType: document.documentType || 'unknown',
    filePath: document.filePath,
    fileName: document.fileName,
    originalName: document.originalName,
    userId: document.uploadedById,
    userName: document.uploadedBy?.name,
    userEmail: document.uploadedBy?.email,
  });
}

async function main() {
  loadEnvFile(path.join(rootDir, '.env'));
  const args = parseArgs(process.argv.slice(2));
  const timer = logger.timer('run', {
    dryRun: args.dryRun,
    limit: args.limit,
    fixture: Boolean(args.fixture),
  });

  const documents = args.fixture
    ? await loadDocumentsFromFixture(args.fixture, args.limit)
    : await loadDocumentsFromDatabase(args.limit);

  const supabase = args.dryRun ? null : createSupabaseAdminClient();
  const results = {
    total: documents.length,
    processed: 0,
    skipped: 0,
    failed: 0,
  };

  for (const document of documents) {
    const docTimer = logger.timer('document', {
      documentId: document.uniqueDocumentId,
      caseId: document.caseId,
      mimeType: document.mimeType,
      dryRun: args.dryRun,
    });

    try {
      if (args.dryRun) {
        results.skipped += 1;
        docTimer.result({ action: 'dry-run' });
        continue;
      }

      await processLiveDocument(supabase, document);
      results.processed += 1;
      docTimer.result({ action: 'processed' });
    } catch (error) {
      results.failed += 1;
      docTimer.error(error);
    }
  }

  timer.result(results);
  console.log(JSON.stringify(results, null, 2));

  if (results.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  logger.error('run error', error);
  process.exitCode = 1;
});
