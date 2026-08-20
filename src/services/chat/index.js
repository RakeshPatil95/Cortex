/**
 * Chat Service - Main orchestrator for legal case chat search
 * Handles query analysis, routing, and response formatting
 */

import { analyzeQueryIntent } from './queryAnalyzer.js';
import { searchWithVector } from './vectorSearch.js';
import { formatCaseResults, formatResponse } from './responseFormatter.js';
import { ChatOpenAI } from '@langchain/openai';
import { PrismaClient } from '@/generated/prisma';
import { applyQueryTransforms } from '../retrieval/queryTransform.js';
import { createPerfTracker } from '../logger.js';
import { RESPONSE_MODEL } from '@/config/models';
import {
  filterDocumentsForCase,
  filterDocumentsForCases,
  resolveAssigneeCaseScope,
  resolveCaseScope,
  toChatCaseResult,
} from './caseScope.js';
import {
  analyzeExhaustiveCaseQuery,
  formatExhaustiveCaseMessage,
  resolveExhaustiveCaseQuery,
} from './exhaustiveCaseSearch.js';

const prisma = new PrismaClient();

// Initialize LangChain with OpenAI for complex clarification responses
const llm = new ChatOpenAI({
  modelName: RESPONSE_MODEL,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Get user's data context for generating contextual questions
 * @param {string} userId - User ID
 * @returns {Object} User's data context including cases, parties, documents
 */
async function getUserDataContext(userId) {
  try {
    // Get recent cases with basic info
    const recentCases = await prisma.legalCase.findMany({
      where: { createdById: userId },
      select: {
        id: true,
        serialNumber: true,
        caseNumber: true,
        caseType: true,
        caseCategory: true,
        caseSubType: true,
        status: true,
        priority: true,
        assignedTo: true,
        filedDate: true,
        nextHearing: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Get case types and categories
    const caseTypes = await prisma.legalCase.findMany({
      where: { createdById: userId },
      select: { caseType: true, caseCategory: true },
      distinct: ['caseType', 'caseCategory']
    });

    // Get recent parties
    const recentParties = await prisma.caseParty.findMany({
      where: { 
        case: { createdById: userId },
        isActive: true 
      },
      select: {
        name: true,
        role: true,
        case: {
          select: { caseNumber: true, caseType: true }
        }
      },
      take: 15
    });

    // Get recent documents
    const recentDocuments = await prisma.caseDocument.findMany({
      where: { 
        case: { createdById: userId }
      },
      select: {
        title: true,
        documentType: true,
        tags: true,
        case: {
          select: { caseNumber: true, caseType: true }
        }
      },
      orderBy: { uploadedAt: 'desc' },
      take: 10
    });

    // Get case statistics
    const stats = await prisma.legalCase.groupBy({
      by: ['status', 'priority'],
      where: { createdById: userId },
      _count: { status: true }
    });

    return {
      recentCases: recentCases.slice(0, 5), // Limit for context
      caseTypes: caseTypes.slice(0, 8),
      recentParties: recentParties.slice(0, 8),
      recentDocuments: recentDocuments.slice(0, 5),
      statistics: {
        totalCases: recentCases.length,
        statusBreakdown: stats.reduce((acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + item._count.status;
          return acc;
        }, {}),
        priorityBreakdown: stats.reduce((acc, item) => {
          acc[item.priority] = (acc[item.priority] || 0) + item._count.status;
          return acc;
        }, {})
      }
    };
    
  } catch (error) {
    console.error('Error getting user data context:', error);
    return {
      recentCases: [],
      caseTypes: [],
      recentParties: [],
      recentDocuments: [],
      statistics: { totalCases: 0 }
    };
  }
}

/**
 * Generate AI clarification response when query is unclear
 * @param {string} message - User's original message
 * @param {Object} intent - Query intent analysis
 * @param {string} userId - User ID for data context
 * @returns {Object} Clarification response with contextual suggested questions
 */
async function generateClarificationResponse(message, intent, userId) {
  try {
    // Get user's data context to generate relevant questions
    const dataContext = await getUserDataContext(userId);
    
    const clarificationPrompt = `You are a helpful legal case management assistant. The user's query "${message}" was not clear enough to search the database effectively.

USER'S DATA CONTEXT:
${JSON.stringify(dataContext, null, 2)}

QUERY INTENT ANALYSIS:
- Type: ${intent.type}
- Confidence: ${intent.confidence}
- Detected filters: ${JSON.stringify(intent.filters || {})}
- Detected entities: ${JSON.stringify(intent.entities || {})}

Your task:
1. Analyze the user's query and their actual data context
2. Generate 3-4 specific, contextual questions based on their real data
3. Use actual case numbers, case types, parties, or document names from their data when relevant
4. Make questions that would help them find what they're looking for based on their specific cases
5. Be conversational and helpful

Generate a response that:
- Acknowledges their query was unclear
- Asks 1-2 clarifying questions based on their actual data
- Provides 3-4 specific example questions using their real case data
- Be friendly and professional

Response format:
- Start with a brief acknowledgment
- Ask 1-2 clarifying questions
- Then provide 3-4 specific example questions based on their data

Generate a helpful response:`;

    const response = await llm.invoke(clarificationPrompt);
    
    // Extract suggested questions from the AI response
    const suggestedQuestions = extractSuggestedQuestions(response.content);
    
    return {
      message: response.content.trim(),
      results: {
        cases: [],
        documents: []
      },
      suggestedQuestions,
      needsClarification: true
    };
    
  } catch (error) {
    console.error('Clarification generation error:', error);
    
    // Fallback to basic clarification
    return {
      message: "I couldn't quite understand your question. Could you please rephrase it or provide more specific details?",
      results: {
        cases: [],
        documents: []
      },
      suggestedQuestions: [],
      needsClarification: true
    };
  }
}

/**
 * Extract suggested questions from AI response text
 * @param {string} responseText - AI response text
 * @returns {Array} Array of suggested questions
 */
function extractSuggestedQuestions(responseText) {
  // Try to extract questions from the response using multiple patterns
  const patterns = [
    /["']([^"']*\?["'])/g,  // Questions in quotes
    /(\d+\.\s*[^.!?]*\?)/g,  // Numbered questions
    /(^|\n)([A-Z][^.!?]*\?)/gm  // Questions starting with capital letter
  ];
  
  let questions = [];
  
  patterns.forEach(pattern => {
    const matches = responseText.match(pattern);
    if (matches) {
      questions = questions.concat(matches.map(q => 
        q.replace(/["']/g, '')
         .replace(/^\d+\.\s*/, '')
         .trim()
      ));
    }
  });
  
  // Remove duplicates and limit to 4 questions
  return [...new Set(questions)].slice(0, 4);
}

/**
 * Main chat service function
 * @param {string} message - User's query message
 * @param {string} userId - User ID for filtering results
 * @param {Array} history - Previous conversation history
 * @param {Object} filters - Additional search filters
 * @returns {Object} Formatted response with results and suggestions
 */
export async function processChatMessage(message, userId, history = [], filters = {}) {
  const perf = createPerfTracker('chat', { userId });
  let caseResults = [];
  let documentResults = { documents: [] };

  try {
    // Analyze query intent and get improved query
    const intent = await perf.step('intent-analysis', () => analyzeQueryIntent(message, history));
    const improvedQuery = intent.improvedQuery || message;
    const transformResult = await perf.step('query-transforms', () => applyQueryTransforms(improvedQuery, intent, { history }));
    intent.retrievalOptions = {
      enableRerank: transformResult.plan.useRerank,
      // Pass a flat intent snapshot (no back-reference to `intent`, to avoid a
      // circular structure) so the reranker can align result types.
      intent: { type: intent.type, parameters: intent.parameters },
    };

    console.log('Chat query prepared:', {
      originalLength: message.length,
      improvedLength: improvedQuery.length,
      retrievalLength: transformResult.retrievalQuery.length,
    });

    const caseScope = await perf.step('case-scope', () => resolveCaseScope({
      prisma,
      userId,
      filterCaseId: filters.caseId,
      texts: [message, improvedQuery, intent.contextualSearchTerms || []],
    }));
    const assigneeScope = caseScope.hasExplicitReference
      ? { assignee: null, cases: [] }
      : await perf.step('assignee-scope', () => resolveAssigneeCaseScope({
        prisma,
        userId,
        texts: [message, improvedQuery],
      }));
    const exhaustiveCaseQuery = analyzeExhaustiveCaseQuery(message);

    if (caseScope.case) {
      const scopedCaseId = caseScope.case.id;
      console.log('Specific case resolved; scoping document search:', {
        reference: caseScope.references[0],
        caseId: scopedCaseId,
      });

      caseResults = [toChatCaseResult(caseScope.case)];

      try {
        const vectorResults = await perf.step('vector-search', () => searchWithVector(
          transformResult.retrievalQuery,
          userId,
          intent,
          {
            ...filters,
            caseId: scopedCaseId,
            type: 'document',
          },
          perf
        ));
        const scopedDocuments = filterDocumentsForCase(
          vectorResults.documents,
          scopedCaseId
        );

        documentResults = {
          documents: scopedDocuments,
          searchStrategy: 'case_scoped',
          relatedCaseIds: [scopedCaseId],
          totalMatches: scopedDocuments.length,
        };
      } catch (error) {
        console.error('Case-scoped vector search error:', error);
        documentResults = {
          documents: [],
          searchStrategy: 'case_scoped',
          relatedCaseIds: [scopedCaseId],
        };
      }
    } else if (caseScope.hasExplicitReference && !caseScope.multipleReferences) {
      // An exact case was requested but is not owned by this user or does not
      // resolve uniquely. Do not fall back to global retrieval and expose
      // unrelated cases.
      console.log('Specific case reference did not resolve uniquely:', {
        reference: caseScope.references[0],
        ambiguous: caseScope.ambiguous,
      });
      documentResults = {
        documents: [],
        searchStrategy: 'case_scoped_not_found',
      };
    } else if (exhaustiveCaseQuery.isExhaustive) {
      const exhaustiveResult = await perf.step('exhaustive-case-search', () => (
        resolveExhaustiveCaseQuery({
          prisma,
          userId,
          query: message,
          intent,
          assignedTo: assigneeScope.assignee,
        })
      ));
      caseResults = exhaustiveResult.cases.map(toChatCaseResult);
      documentResults = {
        documents: [],
        searchStrategy: 'structured_exhaustive',
        totalMatches: exhaustiveResult.matchingCases,
      };

      return {
        message: formatExhaustiveCaseMessage(exhaustiveResult),
        results: {
          cases: formatCaseResults(caseResults),
          documents: [],
        },
        suggestedQuestions: [],
        intent: 'case',
        confidence: 1,
        totalResults: {
          cases: exhaustiveResult.matchingCases,
          documents: 0,
        },
        caseTotals: {
          total: exhaustiveResult.totalCases,
          matching: exhaustiveResult.matchingCases,
          byStatus: exhaustiveResult.statusBreakdown,
        },
      };
    } else if (assigneeScope.assignee) {
      const scopedCases = assigneeScope.cases.slice(0, 8);
      const scopedCaseIds = scopedCases.map(case_ => case_.id);
      caseResults = scopedCases.map(toChatCaseResult);

      console.log('Assignee query resolved; scoping document search:', {
        assignee: assigneeScope.assignee,
        cases: scopedCaseIds.length,
      });

      if (scopedCaseIds.length > 0) {
        try {
          const scopedSearchResults = await perf.step('assignee-document-search', () => Promise.all(
            scopedCaseIds.map(caseId => searchWithVector(
              transformResult.retrievalQuery,
              userId,
              intent,
              {
                ...filters,
                caseId,
                type: 'document',
              }
            ))
          ));
          const scopedDocuments = filterDocumentsForCases(
            scopedSearchResults.flatMap(result => result.documents || []),
            scopedCaseIds
          );

          documentResults = {
            documents: scopedDocuments,
            searchStrategy: 'assignee_case_scoped',
            relatedCaseIds: scopedCaseIds,
            totalMatches: scopedDocuments.length,
          };
        } catch (error) {
          console.error('Assignee-scoped vector search error:', error);
          documentResults = {
            documents: [],
            searchStrategy: 'assignee_case_scoped',
            relatedCaseIds: scopedCaseIds,
          };
        }
      } else {
        // A named assignee was requested but no owned case matched. Returning
        // global semantic documents here would reintroduce cross-case results.
        documentResults = {
          documents: [],
          searchStrategy: 'assignee_case_scoped_not_found',
        };
      }
    } else {
      try {
        const enhancedFilters = {
          ...filters,
          // Broad queries intentionally search both cases and documents.
          type: undefined
        };

        const vectorResults = await perf.step('vector-search', () => searchWithVector(transformResult.retrievalQuery, userId, intent, enhancedFilters, perf));
        console.log(`Vector search completed: ${vectorResults.documents?.length || 0} documents, ${vectorResults.cases?.length || 0} cases found`);

        caseResults = (vectorResults.cases || []).slice(0, 8);
        const relatedCaseIds = caseResults
          .map(case_ => case_.caseId || case_.id)
          .filter(Boolean);
        const relatedDocuments = relatedCaseIds.length > 0
          ? filterDocumentsForCases(vectorResults.documents, relatedCaseIds)
          : (vectorResults.documents || []).slice(0, 15);
        documentResults = {
          documents: relatedDocuments,
          searchStrategy: 'global_semantic',
          relatedCaseIds,
          totalMatches: relatedDocuments.length + caseResults.length
        };
      } catch (error) {
        console.error('Vector search error:', error);
        documentResults = { documents: [], searchStrategy: 'global_semantic' };
      }
    }

    // Ask for clarification when the query was too vague to match anything
    if (caseResults.length === 0 && documentResults.documents.length === 0 && intent.confidence < 0.4) {
      return await perf.step('clarification', () => generateClarificationResponse(message, intent, userId));
    }

    // Format response
    const response = await perf.step('format-response', () => formatResponse({
      message,
      intent,
      caseResults,
      documentResults,
      history,
      improvedQuery: transformResult.retrievalQuery,
      perf
    }));

    return response;

  } catch (error) {
    console.error('Chat service error:', error);
    return {
      message: "I'm sorry, I encountered an error processing your request. Please try again.",
      results: {
        cases: [],
        documents: []
      },
      suggestedQuestions: getInitialSuggestedQuestions(),
      error: error.message
    };
  } finally {
    perf.summary({
      cases: caseResults.length,
      documents: documentResults.documents?.length || 0
    });
  }
}

/**
 * Get initial suggested questions for new users
 * @returns {Array} Array of 3 specific suggested questions
 */
export function getInitialSuggestedQuestions() {
  return [
    "Find active cases of Mohammad",
    "Find high priority level cases of lawyer",
    "Find recently filed cases of client"
  ];
}

export default {
  processChatMessage,
  getInitialSuggestedQuestions
};
