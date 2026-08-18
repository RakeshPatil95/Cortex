/**
 * Response Formatter - Formats search results into conversational responses
 * Creates structured responses with AI-generated suggested questions
 */

import { ChatOpenAI } from '@langchain/openai';
import { RESPONSE_MODEL } from '@/config/models';

// Initialize AI for response generation (conversational message + suggestions).
const suggestionLLM = new ChatOpenAI({
  modelName: RESPONSE_MODEL,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Get a case's parties as an array, whatever shape the search layer returned
 * @param {Object} case_ - Case result
 * @returns {Array} Array of party objects
 */
function getParties(case_) {
  if (Array.isArray(case_?.parties)) {
    return case_.parties;
  }
  if (typeof case_?.parties === 'string' && case_.parties.trim().length > 0) {
    return case_.parties.split(',').map(name => ({ name: name.trim() }));
  }
  return [];
}

/**
 * Format search results into conversational response
 * @param {Object} data - Search data and context
 * @returns {Object} Formatted response
 */
export async function formatResponse(data) {
  const { message, intent, caseResults, documentResults, history, perf } = data;
  const track = (name, fn) => (perf ? perf.step(name, fn) : fn());

  // Build conversation context for AI response generation
  const conversationContext = history && history.length > 0 ?
    `\n\nCONVERSATION CONTEXT:
${history.slice(-3).map((h, i) => `${h.role}: ${h.content}`).join('\n')}

Use this context to provide more relevant and conversational responses.` : '';

  try {
    // The conversational message and suggested questions are independent LLM
    // calls — run them concurrently instead of sequentially to halve latency.
    const [conversationalMessage, suggestedQuestions] = await Promise.all([
      track('format:conversational-message', () => generateConversationalMessage({
        message,
        intent,
        caseResults,
        documentResults,
        originalQuery: message,
        conversationContext
      })),
      track('format:suggested-questions', () => generateAISuggestedQuestions({
        message,
        intent,
        caseResults,
        documentResults,
        history,
        conversationContext
      }))
    ]);

    // Format results for display
    const formattedResults = {
      cases: formatCaseResults(caseResults),
      documents: formatDocumentResults(documentResults)
    };
    
    return {
      message: conversationalMessage,
      results: formattedResults,
      suggestedQuestions,
      intent: intent.type,
      confidence: intent.confidence,
      totalResults: {
        cases: caseResults.length,
        documents: documentResults.documents?.length || 0
      }
    };
    
  } catch (error) {
    console.error('Response formatting error:', error);
    return {
      message: "I found some results, but there was an issue formatting them properly.",
      results: {
        cases: caseResults || [],
        documents: documentResults.documents || []
      },
      suggestedQuestions: getSuggestedQuestions(),
      error: error.message
    };
  }
}

/**
 * Generate conversational message based on results using AI
 * @param {Object} data - Search data
 * @returns {Promise<string>} AI-generated conversational message
 */
async function generateConversationalMessage(data) {
  const { intent, caseResults, documentResults, originalQuery, conversationContext } = data;
  const caseCount = caseResults.length;
  const docCount = documentResults.documents?.length || 0;
  
  // Prepare data for AI - include ALL available fields from case results
  const caseData = caseResults.map(c => ({
    // Basic identification
    id: c.id,
    serialNumber: c.serialNumber,
    caseNumber: c.caseNumber,
    
    // Case classification
    caseType: c.caseType,
    caseCategory: c.caseCategory,
    caseSubType: c.caseSubType,
    currentStage: c.currentStage,
    
    // Case management
    status: c.status,
    priority: c.priority,
    assignedTo: c.assignedTo,
    publicProsecutorMemo: c.publicProsecutorMemo,
    
    // Timeline
    filedDate: c.filedDate,
    nextHearing: c.nextHearing,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    
    // User info
    createdById: c.createdById,
    
    // Related data counts
    partyCount: c.partyCount,
    documentCount: c.documentCount,
    
    // Related entities (if available) - CRITICAL: Include full party details with contact info
    parties: getParties(c).map(p => ({
      id: p.id,
      name: p.name,
      civilId: p.civilId,
      role: p.role,
      address: p.address,
      phone: p.phone,
      email: p.email,
      notes: p.notes,
      isActive: p.isActive
    })),
    documents: (c.documents || []).map(d => ({
      id: d.id,
      uniqueDocumentId: d.uniqueDocumentId,
      title: d.title,
      fileName: d.fileName,
      documentType: d.documentType,
      tags: d.tags,
      uploadedAt: d.uploadedAt
    }))
  }));
  
  // Prepare data for AI - include ALL available fields from document results
  const documentData = documentResults.documents?.map(d => ({
    // Basic identification
  
    uniqueDocumentId: d.uniqueDocumentId,
    caseId: d.caseId,
    
    // Document details
    title: d.title,
    fileName: d.fileName,
    originalName: d.originalName,
    description: d.description,
    
    // Document classification
    documentType: d.documentType,
    tags: d.tags || [],
    
    // Content
    text: d.text,
    excerpt: d.excerpt,
    
    // Metadata
    uploadedAt: d.uploadedAt,
    uploadedById: d.uploadedById,
    
    // Related case info (if available)
    relatedCaseId: d.relatedCaseId
  })) || [];
  
  const prompt = `
You are a legal case management assistant speaking directly with a lawyer. Generate a professional, conversational response based on the search results.

Lawyer's Query: "${originalQuery || 'Search query'}"${conversationContext || ''}

Search Results:
- Cases found: ${caseCount}
- Documents found: ${docCount}

Case Details:
${JSON.stringify(caseData, null, 2)}

Document Details:
${JSON.stringify(documentData, null, 2)}

Guidelines:
1. Write as if you're speaking directly to a lawyer in a professional conversation
2. Use conversational language - avoid technical column names like "serialNumber", "caseCategory", etc.

CASE FIELD MAPPING:
3. Instead of "serialNumber" say "case reference" or "case ID"
4. Instead of "caseNumber" say "alternative case number" or "case number"
5. Instead of "caseCategory" say "type of case" or "case type"
6. Instead of "caseSubType" say "case sub-type" or "specific case type"
7. Instead of "assignedTo" say "assigned lawyer" or "handling attorney"
8. Instead of "filedDate" say "filing date" or "when it was filed"
9. Instead of "nextHearing" say "next hearing" or "upcoming court date"
10. Instead of "currentStage" say "current stage" or "case stage"
11. Instead of "status" say "case status" or "current status"
12. Instead of "priority" say "priority level" or "case priority"
13. Instead of "publicProsecutorMemo" say "prosecutor memo" or "prosecutor notes"
14. Instead of "createdAt" say "created date" or "when created"
15. Instead of "updatedAt" say "last updated" or "last modified"

PARTY/CONTACT FIELD MAPPING (CRITICAL):
16. Instead of "role" say "party role" or "their role in the case" (defendant, plaintiff, witness, etc.)
17. Instead of "civilId" say "national ID" or "civil ID number"
18. Instead of "address" say "address" or "contact address" or "location"
19. Instead of "phone" say "phone number" or "contact number" or "mobile"
20. Instead of "email" say "email address" or "contact email"
21. Instead of "isActive" say "currently involved" or "active in the case"
22. ALWAYS include party contact details (address, phone, email) when asked about contact information
23. When user asks for "contact details" or "contact information", provide ALL available contact fields

DOCUMENT FIELD MAPPING:
24. Instead of "documentType" say "type of document" or "document category"
25. Instead of "fileName" say "file name" or "stored filename"
26. Instead of "originalName" say "original filename" or "original document name"
27. Instead of "fileSize" say "file size" or "document size"
28. Instead of "mimeType" say "file type" or "document format"
29. Instead of "uploadedAt" say "uploaded date" or "when uploaded"
30. Instead of "relevanceScore" say "relevance" or "match score"
31. Instead of "tags" say "document tags" or "categorization tags"

GENERAL GUIDELINES:
32. Be respectful and professional in tone
33. Keep it concise but informative (max 3-4 sentences)
34. Make it sound like a natural conversation between colleagues
35. Focus on the legal aspects and practical implications
36. For documents, mention the content summary from the text field if available
37. If no results, suggest alternative search strategies
38. Use phrases like "I found", "Based on your search", "Here's what I located"
39. For documents, mention they can be viewed by clicking on them
40. IMPORTANT: If nextHearing data is available, always mention the specific date and time
41. NEVER suggest contacting clerks, court staff, or external parties - just provide the information found
42. Focus on what's actually in the system, not what might be missing
43. Include relevant metadata like file sizes, upload dates, and relevance scores when helpful
44. Mention party counts and document counts when available

CONTACT INFORMATION QUERIES (MOST CRITICAL):
45. When user asks for "contact details", "contact information", "address", "phone", or "email", ALWAYS include ALL available contact fields from parties data
46. Present contact information clearly: name, role, address, phone number, email
47. If multiple parties exist, list all of them with their contact details
48. Prioritize active parties (isActive = true) but show inactive ones too if relevant
49. For contact queries, focus on the party data, not just the case metadata
50. Always check the parties array in case data for contact information

CRITICAL RULES: Do not mention the database schema in the response. write like an assistant that is familiar with the system and the data. and if there is no data don't say that if user has not asked for it, just respond the user query dont provide the extra information other than user question. dont include 0 or numbers or ids in the response.
Generate a professional, conversational response:`;

  try {
    const response = await suggestionLLM.invoke(prompt);
    return response.content.trim();
  } catch (error) {
    console.error('Error generating conversational message:', error);
    // Fallback to simple message
    if (caseCount === 0 && docCount === 0) {
      return "I looked through all your cases and documents but couldn't find anything that matches. Maybe try different words or check if you have any data in the system.";
    } else {
      return `I found ${caseCount} cases and ${docCount} documents for you.`;
    }
  }
}

/**
 * Format case results for display
 * @param {Array} caseResults - Raw case results
 * @returns {Array} Formatted case results
 */
function formatCaseResults(caseResults) {
  if (!Array.isArray(caseResults)) {
    return [];
  }
  
  return caseResults.map(case_ => ({
    id: case_.id,
    serialNumber: case_.serialNumber,
    caseNumber: case_.caseNumber,
    caseType: case_.caseType,
    caseCategory: case_.caseCategory,
    caseSubType: case_.caseSubType,
    currentStage: case_.currentStage,
    assignedTo: case_.assignedTo,
    publicProsecutorMemo: case_.publicProsecutorMemo,
    status: case_.status,
    priority: case_.priority,
    filedDate: case_.filedDate,
    nextHearing: case_.nextHearing,
    createdAt: case_.createdAt,
    updatedAt: case_.updatedAt,
    // CRITICAL: Include full party data with contact information
    parties: getParties(case_).map(p => ({
      id: p.id,
      name: p.name,
      civilId: p.civilId,
      role: p.role,
      address: p.address,
      phone: p.phone,
      email: p.email,
      notes: p.notes,
      isActive: p.isActive,
      // Add display-friendly fields
      roleDisplay: getRoleDisplay(p.role),
      isActiveDisplay: p.isActive ? 'Active' : 'Inactive'
    })),
    documents: case_.documents || [],
    documentCount: case_.documentCount || 0,
    partyCount: case_.partyCount || getParties(case_).length,
    relevanceScore: case_.relevanceScore,
    summary: case_.summary,
    // Add display-friendly fields
    statusDisplay: getStatusDisplay(case_.status),
    priorityDisplay: getPriorityDisplay(case_.priority),
    dateDisplay: formatDate(case_.filedDate),
    nextHearingDisplay: formatDate(case_.nextHearing),
    partyNames: getParties(case_).map(p => p.name).join(', ')
  }));
}

/**
 * Format document results for display
 * @param {Object} documentResults - Raw document results
 * @returns {Array} Formatted document results
 */
function formatDocumentResults(documentResults) {
  if (!documentResults || !Array.isArray(documentResults.documents)) {
    return [];
  }
  
  return documentResults.documents.map(doc => ({
    id: doc.id,
    documentId: doc.documentId,
    caseId: doc.caseId,
    title: doc.title,
    originalName: doc.originalName,
    documentType: doc.documentType,
    text: doc.text,
    chunkIndex: doc.chunkIndex,
    fileName: doc.fileName,
    fileType: doc.fileType,
    uploadedAt: doc.uploadedAt,
    relevanceScore: doc.relevanceScore,
    excerpt: doc.excerpt,
    // Add display-friendly fields
    typeDisplay: getDocumentTypeDisplay(doc.documentType),
    sizeDisplay: formatFileSize(doc.fileSize),
    dateDisplay: formatDate(doc.uploadedAt),
    highlightedExcerpt: highlightSearchTerms(doc.excerpt, doc.text)
  }));
}

/**
 * Generate AI-powered suggested questions based on results and context
 * @param {Object} data - Context data
 * @returns {Array} Array of AI-generated suggested questions
 */
async function generateAISuggestedQuestions(data) {
  const { message, intent, caseResults, documentResults, history, conversationContext } = data;
  
  try {
    // Prepare comprehensive context for AI based on database schema
    const contextInfo = {
      originalQuery: message,
      intent: intent.type,
      caseCount: caseResults?.length || 0,
      documentCount: documentResults?.documents?.length || 0,
      
      // Case Classification Data
      caseTypes: caseResults?.map(c => c.caseType).filter(Boolean) || [],
      caseCategories: caseResults?.map(c => c.caseCategory).filter(Boolean) || [],
      caseSubTypes: caseResults?.map(c => c.caseSubType).filter(Boolean) || [],
      
      // Case Management Data
      caseStatuses: caseResults?.map(c => c.status) || [],
      casePriorities: caseResults?.map(c => c.priority) || [],
      caseStages: caseResults?.map(c => c.currentStage).filter(Boolean) || [],
      
      // Assignment Data
      assignedLawyers: caseResults?.map(c => c.assignedTo).filter(Boolean) || [],
      
      // Timeline Data
      filingDates: caseResults?.map(c => c.filedDate).filter(Boolean) || [],
      nextHearings: caseResults?.map(c => c.nextHearing).filter(Boolean) || [],
      createdDates: caseResults?.map(c => c.createdAt).filter(Boolean) || [],
      updatedDates: caseResults?.map(c => c.updatedAt).filter(Boolean) || [],
      
      // Case Identification
      caseNumbers: caseResults?.map(c => c.serialNumber).filter(Boolean) || [],
      alternativeCaseNumbers: caseResults?.map(c => c.caseNumber).filter(Boolean) || [],
      
      // Case Details
      prosecutorMemos: caseResults?.map(c => c.publicProsecutorMemo).filter(Boolean) || [],
      partyCounts: caseResults?.map(c => c.partyCount) || [],
      documentCounts: caseResults?.map(c => c.documentCount) || [],
      
      // Document Data
      documentTypes: documentResults?.documents?.map(d => d.documentType).filter(Boolean) || [],
      documentTitles: documentResults?.documents?.map(d => d.title).filter(Boolean) || [],
      documentFileNames: documentResults?.documents?.map(d => d.fileName).filter(Boolean) || [],
    
      documentUploadDates: documentResults?.documents?.map(d => d.uploadedAt).filter(Boolean) || [],
      documentRelevanceScores: documentResults?.documents?.map(d => d.relevanceScore || d.score).filter(Boolean) || [],
      documentTags: documentResults?.documents?.flatMap(d => d.tags || []).filter(Boolean) || [],
      
      // Recent/Relevant Data for Context
      recentCaseNumbers: caseResults?.slice(0, 3).map(c => c.serialNumber) || [],
      topCaseCategories: [...new Set(caseResults?.map(c => c.caseCategory).filter(Boolean))].slice(0, 3) || [],
      topDocumentTypes: [...new Set(documentResults?.documents?.map(d => d.documentType).filter(Boolean))].slice(0, 3) || [],
      topAssignedLawyers: [...new Set(caseResults?.map(c => c.assignedTo).filter(Boolean))].slice(0, 3) || []
    };

    const prompt = `
You are helping a lawyer with their legal case management system. Generate 3 natural, conversational follow-up questions based on the database schema and search results.

DATABASE SCHEMA CONTEXT:
The system manages legal cases with these key fields:
- Case Identification: serialNumber (case reference), caseNumber (alternative ID)
- Case Classification: caseType (criminal/civil/family/commercial/administrative), caseCategory (Fraud/Contract/Property), caseSubType (specific subcategory)
- Case Management: status (active/pending/closed), priority (high/medium/low), currentStage (Investigation/Trial/Appeal)
- Assignment: assignedTo (lawyer name), createdById (user who created)
- Timeline: filedDate (when filed), nextHearing (next court date), createdAt (record creation)
- Parties: CaseParty table with name, role (defendant/plaintiff/witness/expert/lawyer), civilId, contact info
- Documents: CaseDocument table with title, documentType (Evidence/Contract/Correspondence), tags, file info

CURRENT SEARCH CONTEXT:
- Lawyer's Query: "${contextInfo.originalQuery}"
- Found ${contextInfo.caseCount} cases and ${contextInfo.documentCount} documents

CASE DATA FOUND:
- Case Types: ${contextInfo.caseTypes.join(', ') || 'None'}
- Case Categories: ${contextInfo.caseCategories.join(', ') || 'None'}
- Case Sub-Types: ${contextInfo.caseSubTypes.join(', ') || 'None'}
- Case Statuses: ${contextInfo.caseStatuses.join(', ') || 'None'}
- Case Priorities: ${contextInfo.casePriorities.join(', ') || 'None'}
- Case Stages: ${contextInfo.caseStages.join(', ') || 'None'}
- Assigned Lawyers: ${contextInfo.assignedLawyers.join(', ') || 'None'}
- Case Numbers: ${contextInfo.caseNumbers.join(', ') || 'None'}
- Alternative Case Numbers: ${contextInfo.alternativeCaseNumbers.join(', ') || 'None'}
- Party Counts: ${contextInfo.partyCounts.join(', ') || 'None'}
- Document Counts: ${contextInfo.documentCounts.join(', ') || 'None'}
- Prosecutor Memos: ${contextInfo.prosecutorMemos.length > 0 ? 'Available' : 'None'}

DOCUMENT DATA FOUND:
- Document Types: ${contextInfo.documentTypes.join(', ') || 'None'}
- Document Titles: ${contextInfo.documentTitles.slice(0, 3).join(', ') || 'None'}
- File Names: ${contextInfo.documentFileNames.slice(0, 3).join(', ') || 'None'}
- Upload Dates: ${contextInfo.documentUploadDates.slice(0, 3).join(', ') || 'None'}
- Relevance Scores: ${contextInfo.documentRelevanceScores.slice(0, 3).join(', ') || 'None'}
- Document Tags: ${contextInfo.documentTags.slice(0, 5).join(', ') || 'None'}

TIMELINE DATA:
- Filing Dates: ${contextInfo.filingDates.slice(0, 3).join(', ') || 'None'}
- Next Hearings: ${contextInfo.nextHearings.slice(0, 3).join(', ') || 'None'}
- Created Dates: ${contextInfo.createdDates.slice(0, 3).join(', ') || 'None'}
- Updated Dates: ${contextInfo.updatedDates.slice(0, 3).join(', ') || 'None'}

RECENT/RELEVANT DATA:
- Recent Case Numbers: ${contextInfo.recentCaseNumbers.join(', ') || 'None'}
- Top Categories: ${contextInfo.topCaseCategories.join(', ') || 'None'}
- Top Document Types: ${contextInfo.topDocumentTypes.join(', ') || 'None'}
- Top Assigned Lawyers: ${contextInfo.topAssignedLawyers.join(', ') || 'None'}${conversationContext || ''}

GUIDELINES:
1. Generate ONLY 3 questions that sound like natural conversation
2. Detect the language of the original query and respond in the same language
3. Make them sound like what a real lawyer would casually ask next
4. Use simple, direct language - avoid formal legal jargon
5. Make questions specific to what they just searched for
6. Focus on practical next steps they might want to take
7. Use "I" or "me" perspective - like the lawyer is asking for themselves
8. Keep them short and conversational
9. Use LEGAL FIELD NAMES from the schema:
   - "case reference" or "case ID" (serialNumber)
   - "case type" or "type of case" (caseType/caseCategory)
   - "assigned lawyer" or "handling attorney" (assignedTo)
   - "filing date" or "when filed" (filedDate)
   - "next hearing" or "court date" (nextHearing)
   - "case status" or "current status" (status)
   - "priority level" (priority)
   - "case stage" or "current stage" (currentStage)
   - "document type" (documentType)
   - "parties involved" (parties)
   - "defendant/plaintiff/witness" (party roles)
   - "evidence/contracts/correspondence" (document types)
10. Make them feel like natural follow-up questions

SUGGESTED QUESTION GENERATION PRINCIPLES:

SCHEMA-AWARE QUESTIONS:
- Generate questions based on actual database fields and relationships
- Use legal terminology that matches the system's domain
- Create questions that explore different aspects of the data

CONTEXTUAL RELEVANCE:
- Base questions on the current search results and context
- Consider the user's role (lawyer, legal professional)
- Generate follow-up questions that make sense for the current query

LANGUAGE DETECTION:
- Detect the language of the original query
- Generate questions in the same language
- Use appropriate legal terminology for each language

QUESTION TYPES:
- Case identification and reference questions
- Case classification and type questions
- Status, priority, and stage questions
- Assignment and management questions
- Timeline and date questions
- Party and relationship questions
- Document and evidence questions
- Comprehensive search questions

NATURAL CONVERSATION:
- Make questions sound like natural lawyer conversation
- Use "I" or "me" perspective
- Keep questions short and direct
- Avoid formal legal jargon
- Focus on practical next steps
- NEVER suggest contacting clerks, court staff, or external parties
- Focus on what can be found within the system

Return ONLY a JSON array of 3 questions in the same language as the original query, no other text:
["question1", "question2", "question3"]
`;

    const response = await suggestionLLM.invoke(prompt);
    
    // Extract JSON array from response
    const content = response.content.trim();
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]);
      return suggestions.slice(0, 3); // Ensure max 3 suggestions
    }
    
    throw new Error('No valid JSON array found in response');
    
  } catch (error) {
    console.error('AI suggestion generation error:', error);
    
    // Return empty suggestions when AI fails
    return [];
  }
}


/**
 * Get display text for party role
 * @param {string} role - Party role
 * @returns {string} Display text
 */
function getRoleDisplay(role) {
  const roleMap = {
    'defendant': 'Defendant',
    'plaintiff': 'Plaintiff',
    'co_defendant': 'Co-Defendant',
    'witness': 'Witness',
    'expert': 'Expert',
    'lawyer': 'Lawyer',
    'other': 'Other'
  };
  return roleMap[role] || role;
}

/**
 * Get display text for case status
 * @param {string} status - Case status
 * @returns {string} Display text
 */
function getStatusDisplay(status) {
  const statusMap = {
    'active': 'Active',
    'pending': 'Pending',
    'closed': 'Closed'
  };
  return statusMap[status] || status;
}

/**
 * Get display text for case priority
 * @param {string} priority - Case priority
 * @returns {string} Display text
 */
function getPriorityDisplay(priority) {
  const priorityMap = {
    'high': 'High',
    'medium': 'Medium',
    'low': 'Low'
  };
  return priorityMap[priority] || priority;
}

/**
 * Get display text for document type
 * @param {string} type - Document type
 * @returns {string} Display text
 */
function getDocumentTypeDisplay(type) {
  const typeMap = {
    'legal-document': 'Legal Document',
    'evidence': 'Evidence',
    'contract': 'Contract',
    'correspondence': 'Correspondence',
    'court-order': 'Court Order',
    'expert-report': 'Expert Report',
    'financial-record': 'Financial Record',
    'medical-record': 'Medical Record',
    'witness-statement': 'Witness Statement',
    'other': 'Other'
  };
  return typeMap[type] || type || 'Unknown';
}

/**
 * Format date for display
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date
 */
function formatDate(date) {
  if (!date) return 'Not specified';
  
  try {
    const dateObj = new Date(date);
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return 'Invalid date';
  }
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (!bytes) return 'Unknown size';
  
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Highlight search terms in text
 * @param {string} excerpt - Text excerpt
 * @param {string} fullText - Full text for context
 * @returns {string} Highlighted text
 */
function highlightSearchTerms(excerpt, fullText) {
  // Simple highlighting - in a real implementation, you'd want more sophisticated matching
  return excerpt;
}

/**
 * Get initial suggested questions based on database schema
 * @returns {Array} Array of 3 general suggested questions
 */
function getSuggestedQuestions() {
  return [
    "Show me my active cases",
    "Find high priority cases", 
    "What cases do I have assigned to me?"
  ];
}

export default {
  formatResponse
};
