/**
 * Vector Search Service - Handles semantic search using pgvector
 * Searches both document chunks and case metadata summaries
 */

import { searchDocuments } from '../documentProcessor.js';

/**
 * Case vectors store parties as a "Name (role), Name (role)" string.
 * Convert it back into the array-of-objects shape the response formatter expects.
 * @param {string|Array} parties - Parties string from case_vectors, or an array passed through
 * @returns {Array<{name: string, role: string|null}>}
 */
function parseParties(parties) {
  if (Array.isArray(parties)) {
    return parties;
  }
  if (typeof parties !== 'string' || parties.trim().length === 0) {
    return [];
  }
  return parties.split(',')
    .map(entry => {
      const trimmed = entry.trim();
      if (!trimmed) return null;
      const match = trimmed.match(/^(.+?)\s*\(([^)]*)\)$/);
      return match
        ? { name: match[1].trim(), role: match[2].trim() || null }
        : { name: trimmed, role: null };
    })
    .filter(Boolean);
}

/**
 * Search using vector similarity
 * @param {string} message - User's query message
 * @param {string} userId - User ID for filtering
 * @param {Object} intent - Query intent analysis
 * @param {Object} filters - Additional search filters
 * @returns {Object} Search results with cases and documents
 */
export async function searchWithVector(message, userId, intent, filters = {}, perf = null) {
  try {
    console.log('Vector search started:', {
      queryLength: message.length,
      userId,
      intentType: intent.type,
      filterKeys: Object.keys(filters),
    });
    
    // Build enhanced search query with contextual terms
    let enhancedQuery = message;
    if (intent.contextualSearchTerms && intent.contextualSearchTerms.length > 0) {
      const contextualTerms = intent.contextualSearchTerms.join(' ');
      enhancedQuery = `${message} ${contextualTerms}`;
      console.log('Enhanced query prepared:', { queryLength: enhancedQuery.length });
    }
    
    // Build search filters - ensure userId is properly formatted
    const searchFilters = {
      userId: userId,
      ...filters
    };
    
    // Skip type filter since existing vectors don't have type field
    // We'll filter results after getting them from pgvector
    // if (intent.type === 'case') {
    //   searchFilters.type = 'case';
    // } else if (intent.type === 'document') {
    //   searchFilters.type = 'document';
    // }
    
    console.log('Search filters:', searchFilters);
    
    // Perform vector search - use higher limit for global search
    const searchLimit = intent.type === 'hybrid' || !searchFilters.type ? 30 : 20;
    const searchResult = await searchDocuments(enhancedQuery, searchFilters, searchLimit, { ...(intent.retrievalOptions || {}), perf });
    
    console.log('Vector search result:', { 
      success: searchResult.success, 
      resultCount: searchResult.results?.length || 0 
    });
    
    if (!searchResult.success) {
      throw new Error('Vector search failed');
    }
    
    // Separate results by type
    const results = {
      cases: [],
      documents: []
    };
    
    console.log('Processing search results:', searchResult.results.length);
    
    searchResult.results.forEach((match, index) => {
      const metadata = match.metadata;
      console.log(`Processing match ${index + 1}:`, {
        id: match.id,
        score: match.score,
        availableFields: Object.keys(metadata),
        documentId: metadata.documentId,
        caseId: metadata.caseId,
        fileName: metadata.fileName,
        title: metadata.title,
        serialNumber: metadata.serialNumber
      });
      
      // Determine type based on available metadata
      const isDocument = metadata.documentId || metadata.fileName || metadata.title;
      const isCase = metadata.caseId && metadata.serialNumber && !isDocument;
      
      if (isCase) {
        console.log('Adding to cases:', match.id);
        results.cases.push({
          id: match.id,
          score: match.score,
          caseId: metadata.caseId,
          serialNumber: metadata.serialNumber,
          caseNumber: metadata.caseNumber,
          caseCategory: metadata.caseCategory,
          caseSubType: metadata.caseSubType,
          currentStage: metadata.currentStage,
          status: metadata.status,
          priority: metadata.priority,
          assignedTo: metadata.assignedTo,
          filedDate: metadata.filedDate,
          nextHearing: metadata.nextHearing,
          parties: parseParties(metadata.parties),
          publicProsecutorMemo: metadata.publicProsecutorMemo,
          summary: metadata.summary,
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt,
          relevanceScore: match.score
        });
      } else if (isDocument) {
        console.log('Adding to documents:', match.id);
        results.documents.push({
          id: match.id,
          score: match.score,
          documentId: metadata.documentId || match.id,
          caseId: metadata.caseId,
          title: metadata.title || metadata.fileName || 'Untitled Document',
          originalName: metadata.originalName || metadata.fileName || 'Untitled Document',
          documentType: metadata.documentType || 'document',
          text: metadata.text || '',
          chunkIndex: metadata.chunkIndex || 0,
          fileName: metadata.fileName || 'unknown',
          filePath: metadata.filePath || metadata.fileName || 'unknown', // Add filePath for document viewing
          fileType: metadata.fileType || 'unknown',
          uploadedAt: metadata.uploadedAt || new Date().toISOString(),
          relevanceScore: match.score,
          excerpt: extractRelevantExcerpt(metadata.text || '', message)
        });
      } else {
        console.log('Unknown type, skipping:', match.id);
      }
    });
    
    console.log('Final results:', {
      casesCount: results.cases.length,
      documentsCount: results.documents.length,
      totalProcessed: searchResult.results.length
    });
    
    // Deduplicate documents by documentId, keeping the most relevant chunk
    const documentMap = new Map();
    results.documents.forEach(doc => {
      const docId = doc.documentId;
      if (!documentMap.has(docId) || doc.relevanceScore > documentMap.get(docId).relevanceScore) {
        documentMap.set(docId, doc);
      }
    });
    results.documents = Array.from(documentMap.values());
    
    // Sort results by relevance score
    results.cases.sort((a, b) => b.relevanceScore - a.relevanceScore);
    results.documents.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    return results;
    
  } catch (error) {
    console.error('Vector search error:', error);
    throw new Error(`Vector search failed: ${error.message}`);
  }
}

/**
 * Extract relevant excerpt from document text
 * @param {string} text - Full document text
 * @param {string} query - Search query
 * @param {number} maxLength - Maximum excerpt length
 * @returns {string} Relevant excerpt
 */
function extractRelevantExcerpt(text, query, maxLength = 300) {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
  const textLower = text.toLowerCase();
  
  // Find the best position that contains the most query words
  let bestPosition = 0;
  let bestScore = 0;
  
  for (let i = 0; i <= text.length - maxLength; i += 50) {
    const excerpt = textLower.substring(i, i + maxLength);
    const score = queryWords.reduce((acc, word) => {
      return acc + (excerpt.includes(word) ? 1 : 0);
    }, 0);
    
    if (score > bestScore) {
      bestScore = score;
      bestPosition = i;
    }
  }
  
  // Extract excerpt and add ellipsis if needed
  let excerpt = text.substring(bestPosition, bestPosition + maxLength);
  
  if (bestPosition > 0) {
    excerpt = '...' + excerpt;
  }
  
  if (bestPosition + maxLength < text.length) {
    excerpt = excerpt + '...';
  }
  
  return excerpt;
}

/**
 * Search for similar cases based on a reference case
 * @param {string} caseId - Reference case ID
 * @param {string} userId - User ID for filtering
 * @param {number} limit - Maximum number of results
 * @returns {Array} Array of similar cases
 */
export async function findSimilarCases(caseId, userId, limit = 5) {
  try {
    // First get the reference case
    const referenceCase = await searchDocuments(`case ${caseId}`, { userId, type: 'case' }, 1);
    
    if (!referenceCase.success || referenceCase.results.length === 0) {
      return [];
    }
    
    const caseSummary = referenceCase.results[0].metadata.summary;
    
    // Search for similar cases using the case summary
    const similarResults = await searchDocuments(caseSummary, { userId, type: 'case' }, limit + 1);
    
    if (!similarResults.success) {
      return [];
    }
    
    // Filter out the reference case itself
    return similarResults.results
      .filter(result => result.metadata.caseId !== caseId)
      .slice(0, limit)
      .map(match => ({
        id: match.id,
        score: match.score,
        caseId: match.metadata.caseId,
        serialNumber: match.metadata.serialNumber,
        caseNumber: match.metadata.caseNumber,
        caseCategory: match.metadata.caseCategory,
        caseSubType: match.metadata.caseSubType,
        currentStage: match.metadata.currentStage,
        status: match.metadata.status,
        priority: match.metadata.priority,
        assignedTo: match.metadata.assignedTo,
        summary: match.metadata.summary,
        relevanceScore: match.score
      }));
    
  } catch (error) {
    console.error('Similar cases search error:', error);
    return [];
  }
}

/**
 * Search for documents within a specific case
 * @param {string} caseId - Case ID
 * @param {string} query - Search query
 * @param {string} userId - User ID for filtering
 * @returns {Array} Array of matching documents
 */
export async function searchCaseDocuments(caseId, query, userId, intent = {}) {
  try {
    // Build enhanced query with contextual terms
    let enhancedQuery = query;
    if (intent.contextualSearchTerms && intent.contextualSearchTerms.length > 0) {
      const contextualTerms = intent.contextualSearchTerms.join(' ');
      enhancedQuery = `${query} ${contextualTerms}`;
    }
    
    const searchResult = await searchDocuments(enhancedQuery, {
      userId: userId,
      caseId: caseId
      // Skip type filter since existing vectors don't have type field
    }, 50, intent.retrievalOptions || {});
    
    if (!searchResult.success) {
      return [];
    }
    
    return searchResult.results.map(match => ({
      id: match.id,
      score: match.score,
      documentId: match.metadata.documentId,
      caseId: match.metadata.caseId,
      title: match.metadata.title || match.metadata.fileName,
      originalName: match.metadata.originalName || match.metadata.fileName,
      documentType: match.metadata.documentType,
      text: match.metadata.text,
      chunkIndex: match.metadata.chunkIndex,
      fileName: match.metadata.fileName,
      fileType: match.metadata.fileType,
      uploadedAt: match.metadata.uploadedAt,
      relevanceScore: match.score,
      excerpt: extractRelevantExcerpt(match.metadata.text, query)
    }));
    
  } catch (error) {
    console.error('Case documents search error:', error);
    return [];
  }
}

export default {
  searchWithVector,
  findSimilarCases,
  searchCaseDocuments
};
