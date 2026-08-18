import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/config/auth';
import { extractTextFromDocument } from '@/services/documentProcessor';
import { extractCaseFields, normalizeExtractedFields, backfillCivilIds } from '@/services/cases/fieldExtractor';

// POST /api/cases/extract
// Reads an uploaded document, extracts structured case fields + parties via LLM,
// and returns them to pre-fill the create form. Does NOT persist anything or run
// the ingestion pipeline (no chunks/embeddings) — extraction only.
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const language = formData.get('language') === 'ar' ? 'ar' : 'en';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Firecrawl handles PDF/DOC/DOCX; TXT is decoded locally. Images are out of
    // scope for extraction (OCR unreliable).
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({
        error: 'Unsupported file type. Only PDF, DOC, DOCX, and TXT files are supported for auto-fill.',
      }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    // Extract markdown only — no DB writes.
    const fileType = file.name.split('.').pop();
    const extracted = await extractTextFromDocument(file, fileType);
    const markdown = extracted?.markdown || extracted?.text || '';

    // Firecrawl can return near-empty markdown for scanned/handwritten docs.
    // Degrade gracefully so the user simply fills the form manually.
    if (!markdown || markdown.trim().length < 20) {
      return NextResponse.json({
        success: true,
        fields: {},
        parties: [],
        document: null,
        warnings: ['Could not read enough text from the document to auto-fill. Please enter the details manually.'],
      });
    }

    const raw = await extractCaseFields(markdown, { language });
    const { fields, parties, document } = normalizeExtractedFields(raw);
    // Deterministic fallback: recover a 12-digit civil ID the LLM may have missed
    // in Firecrawl's scrambled Arabic tables.
    const partiesWithIds = backfillCivilIds(parties, markdown);

    const warnings = [];
    if (!raw) {
      warnings.push('Auto-fill could not interpret the document. Please review and complete the form manually.');
    }

    return NextResponse.json({ success: true, fields, parties: partiesWithIds, document, warnings });
  } catch (error) {
    console.error('Case field extraction error:', error);
    return NextResponse.json(
      { error: 'Failed to extract case fields', details: error.message },
      { status: 500 },
    );
  }
}
