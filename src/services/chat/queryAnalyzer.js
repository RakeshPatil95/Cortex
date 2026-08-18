/**
 * Query Analyzer - Determines search intent and strategy
 * Analyzes user queries to determine whether to use SQL, vector search, or both
 */

import OpenAI from 'openai';
import { QUERY_UNDERSTANDING_MODEL, QUERY_UNDERSTANDING_REASONING_EFFORT } from '@/config/models';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Analyze query intent to determine search strategy
 * @param {string} message - User's query message
 * @param {Array} history - Previous conversation history
 * @returns {Object} Intent analysis with type and parameters
 */
export async function analyzeQueryIntent(message, history = []) {
  try {
    // Build conversation context for better understanding
    const conversationContext = history.length > 0 ? 
      `\n\nCONVERSATION CONTEXT (${history.length} previous messages):
${history.slice(-5).map((h, i) => `${i + 1}. ${h.role}: ${h.content}`).join('\n')}

IMPORTANT: Use this context to understand:
- Follow-up questions (e.g., "show me more details" refers to previous results)
- References to previous cases/documents mentioned
- Context switching (e.g., user asking about different case after discussing another)
- Pronouns and references (e.g., "this case", "those documents", "the fraud case")
- Implicit search terms based on conversation flow` : '';

    const prompt = `
You are a legal case management system query analyzer that handles both English and Arabic content. Analyze the user's query and determine the best search strategy.

DATABASE SCHEMA KNOWLEDGE:
The system manages legal cases with the following structure:

LEGAL_CASES Table (Main Cases):
- id: Primary key
- serialNumber: Unique case identifier (e.g., "CASE-2024-001", "CR-2024-123")
- caseNumber: Alternative case number format
- caseType: Type of case (criminal, civil, family, commercial, administrative)
- caseCategory: Main category (e.g., "Fraud", "Contract Dispute", "Property")
- caseSubType: Sub-category (e.g., "Identity Theft", "Breach of Contract")
- currentStage: Current legal stage (e.g., "Investigation", "Trial", "Appeal")
- assignedTo: Assigned lawyer/judge name
- publicProsecutorMemo: Official prosecutor notes
- status: CaseStatus enum (active, pending, closed)
- priority: CasePriority enum (high, medium, low)
- filedDate: When case was filed
- nextHearing: Next scheduled hearing date
- createdAt: Record creation date
- updatedAt: Last modification date
- createdById: User who created the case

CASE_PARTIES Table (People involved):
- id: Primary key
- caseId: Links to legal_cases.id
- name: Full name of party
- civilId: National ID number
- role: PartyRole enum (defendant, plaintiff, co_defendant, witness, expert, lawyer, other)
- address: Full address
- phone: Contact number
- email: Email address
- notes: Additional notes
- isActive: Whether party is currently involved
- createdAt: Record creation date
- updatedAt: Last modification date

CASE_DOCUMENTS Table (Files and documents):
- id: Primary key
- uniqueDocumentId: Unique document identifier
- caseId: Links to legal_cases.id
- title: Document title
- fileName: Stored filename
- originalName: Original filename
- description: Document description
- fileSize: File size in bytes
- mimeType: File type (e.g., "application/pdf", "image/jpeg")
- filePath: Storage path
- documentType: Type of document (e.g., "Evidence", "Contract", "Correspondence", "Court Order")
- tags: Text array of tags for categorization
- uploadedAt: Upload timestamp
- uploadedById: User who uploaded

SEARCH CAPABILITIES:
- SQL Search: For structured data (case metadata, parties, document metadata)
- Vector Search: For document content and semantic similarity
- Hybrid Search: Combines both for comprehensive results

CURRENT QUERY: "${message}"${conversationContext}

Analyze the query and generate an improved, more specific question that combines schema understanding, context, and user intent. Then return ONLY a JSON object with this exact structure:
{
  "type": "case|document|hybrid",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation considering conversation context",
  "parameters": {
    "timeRange": "recent|month|year|specific|none",
    "caseType": "criminal|civil|family|commercial|administrative|any",
    "priority": "high|medium|low|any",
    "status": "active|pending|closed|any",
    "hasParties": true|false,
    "hasDocuments": true|false,
    "needsExactMatch": true|false
  },
  "contextualSearchTerms": ["extracted", "search", "terms", "from", "context"],
  "improvedQuery": "enhanced user question with schema context, legal terminology clarification, and conversation context for better AI understanding"
}

QUERY TYPE GUIDELINES:

CASE QUERIES (Use SQL search on legal_cases table):
- Case identification: "CASE-2024-001", "case 123", "show case details"
- Case metadata: status, priority, type, category, stage, assigned lawyer
- Case dates: filed date, next hearing, creation date, recent cases
- Case management: "active cases", "high priority", "pending cases", "closed cases"
- Case assignments: "cases assigned to John", "my cases", "unassigned cases"
- Case stages: "investigation cases", "trial cases", "appeal cases"
- Case types: "criminal cases", "civil cases", "family cases", "commercial cases"
- Case categories: "fraud cases", "contract disputes", "property cases"
- Party information: "cases with defendant John", "plaintiff cases", "witness cases"
- Time-based: "cases from last month", "recent cases", "cases filed today"
- Arabic: "أظهر لي القضايا", "ابحث عن رقم القضية", "القضايا النشطة"

DOCUMENT QUERIES (Use vector search on document content):
- Document content: "contracts mentioning fraud", "evidence about theft"
- Document types: "find contracts", "search for evidence", "court orders"
- Document text: "documents containing 'breach of contract'"
- Document metadata: "PDF files", "recently uploaded", "large documents"
- Document search: "find documents about fraud", "search for correspondence"
- Arabic: "ابحث عن العقود", "مستندات الاحتيال", "البحث في المستندات"

HYBRID QUERIES (Use both SQL and vector search):
- Complex searches: "fraud cases with contract evidence"
- Case + document: "criminal cases and their documents"
- Party + content: "cases involving John with fraud documents"
- Status + content: "active cases with evidence about theft"
- Type + content: "civil cases with contract disputes"
- Arabic: "القضايا الجنائية مع المستندات", "قضايا الاحتيال مع الأدلة"

FIELD-SPECIFIC UNDERSTANDING:
- serialNumber/caseNumber: Exact case identifiers (CASE-2024-001, CR-123)
- caseType: criminal, civil, family, commercial, administrative
- caseCategory: Fraud, Contract Dispute, Property, etc.
- status: active, pending, closed
- priority: high, medium, low
- currentStage: Investigation, Trial, Appeal, etc.
- role (parties): defendant, plaintiff, witness, expert, lawyer
- documentType: Evidence, Contract, Correspondence, Court Order
- tags: Array of categorization tags

CONTEXT AWARENESS:
- If user says "show me more details" or "tell me more about this", they're referring to previous results
- If user mentions "the fraud case" or "that contract", extract the specific terms from context
- If user switches topics, recognize the new search intent
- Extract implicit search terms from conversation flow
- Consider pronouns and references to previous cases/documents

FOLLOW-UP CONTEXT EXTRACTION (MOST CRITICAL):
- When user asks "contact details", "address", "phone", "email" without specific case ID, extract from previous messages:
  - Case IDs: "CASE-2024-001", "case 123", "CASE-001"
  - Person names: "Mohammad Al-Hassan", "John Doe", "Smith"
  - Case references: "that case", "the fraud case", "this case"
  - Party roles: "defendant", "plaintiff", "witness" from previous context
- For follow-up questions, prioritize extracting case ID or person name from conversation history
- If no specific case ID found, search by person name mentioned in previous messages
- Always include extracted terms in contextualSearchTerms array

CASE ID DETECTION (CRITICAL):
- If query contains specific case IDs (CASE-2024-001, case 123, CASE-001), set needsExactMatch: true
- Extract case ID patterns: "CASE-YYYY-XXX", "case 123", "CASE001", "show details for X"
- Also detect: "case reference CASE-2024-001", "reference CASE-2024-001", "case CASE-2024-001"
- For "show me more details for CASE-2024-001", prioritize exact case ID search
- For "pull docket for case reference CASE-2024-001", prioritize exact case ID search
- Case ID queries should be type: "case" with high confidence
- Queries about "docket", "scheduling", "continuance orders", "next hearing" with case ID are case queries

FOLLOW-UP QUESTION DETECTION (MOST CRITICAL):
- If user says "that person", "this case", "the defendant", "the plaintiff", "contact details", "address", "phone", "email" without mentioning specific case ID
- Look for case IDs, case numbers, or person names from conversation history
- Extract case references from previous messages in the conversation
- For follow-up questions about contact info, parties, or case details, search for the case ID from context
- Examples:
  - Previous: "give me case details about: Mohammad Al-Hassan" 
  - Follow-up: "what is the contact details of that person" -> Search for cases with party name "Mohammad Al-Hassan"
  - Previous: "show me CASE-2024-001"
  - Follow-up: "what is the address of defendant" -> Search for case "CASE-2024-001" with party role "defendant"

LEGAL TERMINOLOGY UNDERSTANDING (CRITICAL):
- "docket" = case file, case record, case details, case information, complete case data
- "scheduling orders" = court orders, hearing schedules, next hearing information, court documents
- "continuance orders" = postponement orders, rescheduling orders, hearing changes, court orders
- "next hearing" = nextHearing field, upcoming court date, scheduled hearing, court appearance
- "case reference" = serialNumber, caseNumber, case ID, case identifier
- "pull" = show, find, get, retrieve, display, fetch, bring up
- "confirm" = verify, check, show details about, validate, ensure
- "court orders" = legal documents, official documents, court documents, judicial orders
- "hearing schedule" = nextHearing, court dates, scheduled hearings, calendar
- "case file" = complete case information, case details, case record, full case data
- "any" = all, all available, everything, whatever is available
- "orders" = court orders, legal documents, official documents, judicial decisions

QUERY ANALYSIS PRINCIPLES:

CASE ID DETECTION:
- Detect any case ID patterns (CASE-YYYY-XXX, case numbers, references)
- Set needsExactMatch: true for specific case ID queries
- Extract case ID from various formats and contexts

LEGAL TERMINOLOGY MAPPING:
- Map legal terms to database fields dynamically
- Understand context and intent from legal terminology
- Extract relevant search parameters from legal language

QUERY TYPE DETERMINATION:
- "case": Queries about case metadata, status, parties, assignments
- "document": Queries about document content, types, evidence
- "hybrid": Complex queries needing both case and document data

CONTEXT AWARENESS:
- Use conversation history to understand references
- Extract implicit search terms from context
- Handle follow-up questions and topic switches

PARAMETER EXTRACTION:
- Extract time ranges, case types, priorities, statuses from natural language
- Map legal terminology to database fields
- Determine search scope and filters dynamically

IMPROVED QUERY GENERATION:
- Generate a better, more specific question based on schema understanding
- Add relevant database field context and relationships
- Include conversation context and previous message references
- Map legal terminology to specific database fields
- Clarify ambiguous terms and pronouns from conversation
- Add specific search parameters and criteria
- Make the query more actionable for AI processing
- Preserve original user intent while adding schema context
- Include related table relationships and field references
- Specify exact search scope and filters
- Use natural language, not technical SQL terms
- Focus on what the user actually wants to find

FOLLOW-UP QUERY ENHANCEMENT (MOST CRITICAL):
- For follow-up questions like "contact details", "address", "phone", "email":
  - Extract case ID or person name from conversation history
  - Enhance query with specific case reference or person name from previous messages
  - Example: "what is the contact details of that person" + context "Mohammad Al-Hassan" = "Retrieve contact details (address, phone, email) for Mohammad Al-Hassan from case parties table"
  - Example: "what is the address of defendant" + context "CASE-2024-001" = "Find defendant contact information for case CASE-2024-001"
- Always include extracted case ID or person name in the improved query
- Make follow-up queries specific and actionable for database search
`;

    const response = await openai.chat.completions.create({
      model: QUERY_UNDERSTANDING_MODEL,
      reasoning_effort: QUERY_UNDERSTANDING_REASONING_EFFORT,
      messages: [
        {
          role: 'system',
          content: 'You are a legal case management query analyzer. Return only valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.choices[0].message.content.trim();
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in response');
    }
    
    const intent = JSON.parse(jsonMatch[0]);
    
    // Always use hybrid search - validate and set defaults
    return {
      type: 'hybrid', // Always use hybrid search
      confidence: intent.confidence || 0.5,
      reasoning: intent.reasoning || 'Hybrid search enabled for comprehensive results',
      parameters: {
        timeRange: intent.parameters?.timeRange || 'none',
        caseType: intent.parameters?.caseType || 'any',
        priority: intent.parameters?.priority || 'any',
        status: intent.parameters?.status || 'any',
        hasParties: intent.parameters?.hasParties || false,
        hasDocuments: intent.parameters?.hasDocuments || false,
        needsExactMatch: intent.parameters?.needsExactMatch || false
      },
      contextualSearchTerms: intent.contextualSearchTerms || [],
      improvedQuery: intent.improvedQuery || message
    };
    
  } catch (error) {
    console.error('Query analysis error:', error);
    
    // Return basic intent when AI analysis fails
    return {
      type: 'hybrid',
      confidence: 0.5,
      reasoning: 'AI analysis failed - using basic hybrid search',
      parameters: {
        timeRange: 'none',
        caseType: 'any',
        priority: 'any',
        status: 'any',
        hasParties: false,
        hasDocuments: false,
        needsExactMatch: false
      },
      contextualSearchTerms: [],
      improvedQuery: message
    };
  }
}


export default {
  analyzeQueryIntent
};
