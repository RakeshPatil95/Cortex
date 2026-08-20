/**
 * Document Processing Service
 * Handles text extraction from various document formats and vector storage
 */

import OpenAI from 'openai';
import { extractWithFirecrawl } from './firecrawlProcessor.js';
import { createLogger } from './logger.js';
import { chunkMarkdown, selectStrategy } from './chunking/index.js';
import { hybridSearchPgvector } from './retrieval/hybridSearch.js';
import { rerankResults } from './retrieval/rerank.js';
import { expandDocumentWindows } from './retrieval/expandWindow.js';
import { PrismaClient } from '@/generated/prisma';

const documentLogger = createLogger('document');
const pgvectorLogger = createLogger('pgvector');
const prisma = new PrismaClient();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function vectorLiteral(values) {
  if (!Array.isArray(values) || values.length !== 512) {
    throw new Error(`Expected 512-dimensional embedding, received ${values?.length || 0}`);
  }

  return `[${values.map((value) => Number(value) || 0).join(',')}]`;
}

/**
 * Extract text from different document types
 */
export const extractTextFromDocument = async (file, fileType) => {
  const normalizedFileType = String(fileType || '').toLowerCase();
  const timer = documentLogger.timer('extract', {
    fileType: normalizedFileType,
    fileSize: file?.size || 0,
  });

  try {
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    let result;

    switch (normalizedFileType) {
      case 'pdf':
      case 'docx':
      case 'doc':
        result = await extractWithFirecrawl(uint8Array, file.name, normalizedFileType);
        break;
      
      case 'txt':
        result = await extractTextFromTXT(uint8Array);
        break;
      
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }

    timer.result({
      textChars: result?.text?.length || 0,
      provider: result?.provider || 'local',
    });

    return result;
  } catch (error) {
    timer.error(error, { fileType: normalizedFileType });
    throw new Error(`Failed to extract text: ${error.message}`);
  }
};

/**
 * Extract text from TXT files
 */
const extractTextFromTXT = async (uint8Array) => {
  try {
    const text = new TextDecoder('utf-8').decode(uint8Array);
    return {
      text: text,
      success: true
    };
  } catch (error) {
    console.error('TXT extraction error:', error);
    throw new Error(`TXT extraction failed: ${error.message}`);
  }
};

/**
 * Split text into chunks for better processing
 */
export const chunkText = (text, chunkSize = 1000, overlap = 200) => {
  return chunkMarkdown(text, {
    maxChars: chunkSize,
    overlap,
  });
};

/**
 * Generate embeddings using OpenAI
 */
export const generateEmbeddings = async (textChunks) => {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: textChunks.map(chunk => chunk.text),
      dimensions: 512,
    });

    return response.data.map((embedding, index) => ({
      ...textChunks[index],
      embedding: embedding.embedding,
      embeddingId: embedding.index
    }));
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw new Error(`Embedding generation failed: ${error.message}`);
  }
};

/**
 * Store document chunk embeddings in pgvector.
 */
export const storeChunks = async (embeddings, metadata) => {
  const timer = pgvectorLogger.timer('upsert document chunks', {
    documentId: metadata.documentId,
    caseId: metadata.caseId,
    chunks: embeddings?.length || 0,
  });

  try {
    if (!embeddings || embeddings.length === 0) {
      throw new Error('No embeddings provided for storage');
    }

    await prisma.$transaction(
      embeddings.map((item) => prisma.$executeRawUnsafe(
        `
          INSERT INTO "document_chunks"
            ("id", "documentId", "caseId", "userId", "chunkIndex", "text", "heading", "sectionPath", "startPosition", "endPosition", "embedding")
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11::vector)
          ON CONFLICT ("documentId", "chunkIndex")
          DO UPDATE SET
            "caseId" = EXCLUDED."caseId",
            "userId" = EXCLUDED."userId",
            "text" = EXCLUDED."text",
            "heading" = EXCLUDED."heading",
            "sectionPath" = EXCLUDED."sectionPath",
            "startPosition" = EXCLUDED."startPosition",
            "endPosition" = EXCLUDED."endPosition",
            "embedding" = EXCLUDED."embedding",
            "updatedAt" = CURRENT_TIMESTAMP
        `,
        `${metadata.documentId}-chunk-${item.chunkIndex}`,
        metadata.documentId,
        metadata.caseId,
        metadata.userId,
        item.chunkIndex,
        item.text,
        item.heading || null,
        item.sectionPath || [],
        item.start ?? null,
        item.end ?? null,
        vectorLiteral(item.embedding)
      ))
    );

    timer.result({
      upsertedCount: embeddings.length,
    });

    return {
      success: true,
      upsertedCount: embeddings.length,
      totalChunks: embeddings.length,
    };
  } catch (error) {
    timer.error(error, {
      documentId: metadata.documentId,
      caseId: metadata.caseId,
    });
    throw new Error(`pgvector document chunk storage failed: ${error.message}`);
  }
};

/**
 * Process document end-to-end
 *
 * `options.extractedData` lets a caller that has already parsed the file supply
 * the extraction result (`{ text, markdown }`) so the expensive Firecrawl parse
 * is not repeated. Used by the bulk importer, which parses once for field
 * extraction and reuses that markdown for ingestion.
 */
export const processDocument = async (file, metadata, options = {}) => {
  try {
    console.log(`Processing document: ${file.name}`);
    
    // Extract text
    const fileType = file.name.split('.').pop();
    const extractedData = options.extractedData
      || await extractTextFromDocument(file, fileType);
    
    if (!extractedData.text || extractedData.text.trim().length === 0) {
      throw new Error('No text content found in document');
    }

    console.log(`Extracted ${extractedData.text.length} characters from ${file.name}`);

    // Chunk the markdown using a per-document strategy router
    const chunkingStrategy = selectStrategy(fileType, extractedData.text);
    const chunks = chunkMarkdown(extractedData.text);
    console.log(`Created ${chunks.length} text chunks with ${chunkingStrategy.name} strategy`);

    if (chunks.length === 0) {
      throw new Error('No valid text chunks created');
    }

    // Generate embeddings
    const embeddings = await generateEmbeddings(chunks);

    // Store in pgvector
    const storageResult = await storeChunks(embeddings, {
      ...metadata,
      fileName: file.name,
      fileType: fileType,
      chunkingStrategy: chunkingStrategy.name,
      originalTextLength: extractedData.text.length,
      totalChunks: chunks.length,
      processedAt: new Date().toISOString()
    });


    return {
      success: true,
      documentId: metadata.documentId,
      fileName: file.name,
      fileType: fileType,
      textLength: extractedData.text.length,
      totalChunks: chunks.length,
      upsertedCount: storageResult.upsertedCount,
      extractedData
    };

  } catch (error) {
    console.error('Document processing failed:', error);
    throw error;
  }
};

/**
 * Search documents using semantic search
 */
export const searchDocuments = async (query, filters = {}, topK = 10, options = {}) => {
  const timer = pgvectorLogger.timer('search', {
    topK,
    hasCaseFilter: Boolean(filters.caseId),
    hasDocumentFilter: Boolean(filters.documentId),
    type: filters.type || 'all',
  });

  // Time a sub-step against the request's perf tracker when one was threaded in.
  const perf = options.perf;
  const track = (name, fn) => (perf ? perf.step(`search:${name}`, fn) : fn());

  try {
    const queryEmbedding = options.queryEmbedding
      ? [{ embedding: options.queryEmbedding }]
      : await track('embedding', () => generateEmbeddings([{ text: query }]));

    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error('Failed to generate query embedding');
    }

    const rerankEnabled = options.enableRerank ?? process.env.ENABLE_RERANK === '1';
    const retrievalLimit = rerankEnabled ? Math.max(topK, 30) : topK;
    const { chunkRows, caseRows, stats } = await track('hybrid-search', () => hybridSearchPgvector({
      prisma,
      query,
      queryVector: vectorLiteral(queryEmbedding[0].embedding),
      topK: retrievalLimit,
      userId: filters.userId || null,
      caseId: filters.caseId || null,
      documentId: filters.documentId || null,
      type: filters.type || 'all',
    }));

    const documentIds = [...new Set(chunkRows.map((row) => row.documentId).filter(Boolean))];
    const documents = documentIds.length > 0
      ? await track('hydrate-documents', () => prisma.caseDocument.findMany({
        where: {
          uniqueDocumentId: {
            in: documentIds,
          },
        },
        select: {
          uniqueDocumentId: true,
          title: true,
          fileName: true,
          originalName: true,
          description: true,
          documentType: true,
          filePath: true,
          tags: true,
          uploadedAt: true,
          uploadedById: true,
        },
      }))
      : [];
    const documentsById = new Map(documents.map((document) => [document.uniqueDocumentId, document]));

    const chunkResults = chunkRows.map((row) => {
      const document = documentsById.get(row.documentId) || {};

      return {
        id: row.id,
        score: Number(row.similarity || 0),
        metadata: {
          type: 'document',
          documentId: row.documentId,
          caseId: row.caseId,
          userId: row.userId,
          title: document.title || document.fileName || row.documentId,
          fileName: document.fileName || row.documentId,
          originalName: document.originalName || document.fileName || row.documentId,
          description: document.description || '',
          documentType: document.documentType || 'document',
          filePath: document.filePath || '',
          tags: document.tags || [],
          uploadedAt: document.uploadedAt?.toISOString?.() || document.uploadedAt,
          uploadedById: document.uploadedById,
          text: row.text || '',
          chunkIndex: row.chunkIndex,
          heading: row.heading,
          sectionPath: row.sectionPath || [],
        },
        text: row.text || '',
      };
    });

    const caseResults = caseRows.map((row) => ({
      id: row.id,
      score: Number(row.similarity || 0),
      metadata: {
        type: 'case',
        caseId: row.caseId,
        userId: row.userId,
        serialNumber: row.serialNumber,
        caseNumber: row.caseNumber,
        caseCategory: row.caseCategory,
        caseSubType: row.caseSubType,
        currentStage: row.currentStage,
        status: row.status,
        priority: row.priority,
        assignedTo: row.assignedTo,
        parties: row.parties,
        summary: row.summary,
      },
      text: row.summary || '',
    }));

    let results = [...chunkResults, ...caseResults]
      .sort((a, b) => b.score - a.score)
      .slice(0, retrievalLimit);

    results = await track('rerank', () => rerankResults(query, results, {
      topK,
      enabled: rerankEnabled,
      intent: options.intent,
      weights: options.rerankWeights,
    }));

    results = await track('expand-window', () => expandDocumentWindows(prisma, results, {
      windowSize: options.windowSize ?? 1,
    }));

    timer.result({
      chunks: chunkRows.length,
      cases: caseRows.length,
      vectorMatches: stats.vector,
      bm25Matches: stats.bm25,
      reranked: rerankEnabled,
      expandedWindows: options.windowSize === 0 ? false : true,
      totalResults: results.length,
    });

    return {
      success: true,
      results: results,
      totalResults: results.length
    };

  } catch (error) {
    timer.error(error);
    throw new Error(`Search failed: ${error.message}`);
  }
};

/**
 * Store case metadata as embeddings in pgvector
 */
export const storeCaseVector = async (caseData, options = {}) => {
  const timer = pgvectorLogger.timer('upsert case vector', {
    caseId: caseData.id,
  });

  try {
    // Generate case summary text
    const caseSummary = generateCaseSummary(caseData);
    
    // Generate embedding for the case summary
    const embeddings = options.embeddings || await generateEmbeddings([{ text: caseSummary }]);
    
    if (!embeddings || embeddings.length === 0) {
      throw new Error('No embeddings generated for case metadata');
    }
    
    const parties = caseData.parties?.map(p => `${p.name} (${p.role})`).join(', ') || '';

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "case_vectors"
          ("id", "caseId", "userId", "serialNumber", "caseNumber", "caseCategory", "caseSubType", "currentStage", "status", "priority", "assignedTo", "publicProsecutorMemo", "parties", "summary", "embedding")
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::vector)
        ON CONFLICT ("caseId")
        DO UPDATE SET
          "userId" = EXCLUDED."userId",
          "serialNumber" = EXCLUDED."serialNumber",
          "caseNumber" = EXCLUDED."caseNumber",
          "caseCategory" = EXCLUDED."caseCategory",
          "caseSubType" = EXCLUDED."caseSubType",
          "currentStage" = EXCLUDED."currentStage",
          "status" = EXCLUDED."status",
          "priority" = EXCLUDED."priority",
          "assignedTo" = EXCLUDED."assignedTo",
          "publicProsecutorMemo" = EXCLUDED."publicProsecutorMemo",
          "parties" = EXCLUDED."parties",
          "summary" = EXCLUDED."summary",
          "embedding" = EXCLUDED."embedding",
          "updatedAt" = CURRENT_TIMESTAMP
      `,
      `case-${caseData.id}`,
      caseData.id,
      caseData.createdById,
      caseData.serialNumber,
      caseData.caseNumber,
      caseData.caseCategory,
      caseData.caseSubType,
      caseData.currentStage,
      caseData.status,
      caseData.priority,
      caseData.assignedTo,
      caseData.publicProsecutorMemo || null,
      parties,
      caseSummary,
      vectorLiteral(embeddings[0].embedding)
    );

    timer.result({
      upsertedCount: 1,
    });
    
    return {
      success: true,
      caseId: caseData.id,
      serialNumber: caseData.serialNumber,
      upsertedCount: 1
    };

  } catch (error) {
    timer.error(error, { caseId: caseData.id });
    throw new Error(`Case metadata storage failed: ${error.message}`);
  }
};

/**
 * Generate case summary text for embedding
 */
const generateCaseSummary = (caseData) => {
  const parts = [];
  
  // Basic case info
  parts.push(`Case ${caseData.serialNumber} (${caseData.caseNumber})`);
  
  // Category and type
  if (caseData.caseCategory) {
    parts.push(`Category: ${caseData.caseCategory}`);
  }
  if (caseData.caseSubType) {
    parts.push(`Type: ${caseData.caseSubType}`);
  }
  
  // Status and stage
  parts.push(`Status: ${caseData.status}, Stage: ${caseData.currentStage || 'Not specified'}`);
  
  // Priority and assignment
  if (caseData.priority) {
    parts.push(`Priority: ${caseData.priority}`);
  }
  if (caseData.assignedTo) {
    parts.push(`Assigned to: ${caseData.assignedTo}`);
  }
  
  // Dates
  if (caseData.filedDate) {
    parts.push(`Filed: ${new Date(caseData.filedDate).toLocaleDateString()}`);
  }
  if (caseData.nextHearing) {
    parts.push(`Next hearing: ${new Date(caseData.nextHearing).toLocaleDateString()}`);
  }
  
  // Parties
  if (caseData.parties && caseData.parties.length > 0) {
    const partyNames = caseData.parties.map(p => `${p.name} (${p.role})`).join(', ');
    parts.push(`Parties: ${partyNames}`);
  }
  
  // Memo
  if (caseData.publicProsecutorMemo) {
    parts.push(`Memo: ${caseData.publicProsecutorMemo.substring(0, 200)}${caseData.publicProsecutorMemo.length > 200 ? '...' : ''}`);
  }
  
  return parts.join('. ');
};

/**
 * Delete case metadata from pgvector
 */
export const deleteCaseVector = async (caseId) => {
  const timer = pgvectorLogger.timer('delete case vector', { caseId });

  try {
    const deletedRows = await prisma.$executeRawUnsafe(
      'DELETE FROM "case_vectors" WHERE "caseId" = $1',
      caseId
    );

    timer.result({
      deletedCount: Number(deletedRows) || 0,
    });

    return {
      success: true,
      deletedCount: Number(deletedRows) || 0
    };

  } catch (error) {
    timer.error(error, { caseId });
    throw new Error(`Case metadata deletion failed: ${error.message}`);
  }
};

/**
 * Delete document chunks from pgvector
 */
export const deleteDocumentChunks = async (documentId) => {
  const timer = pgvectorLogger.timer('delete document chunks', { documentId });

  try {
    const deletedRows = await prisma.$executeRawUnsafe(
      'DELETE FROM "document_chunks" WHERE "documentId" = $1',
      documentId
    );

    timer.result({
      deletedCount: Number(deletedRows) || 0,
    });

    return {
      success: true,
      deletedCount: Number(deletedRows) || 0
    };

  } catch (error) {
    timer.error(error, { documentId });
    throw new Error(`Document deletion failed: ${error.message}`);
  }
};

export default {
  extractTextFromDocument,
  chunkText,
  generateEmbeddings,
  storeChunks,
  processDocument,
  searchDocuments,
  deleteDocumentChunks,
  storeCaseVector,
  deleteCaseVector,
};
