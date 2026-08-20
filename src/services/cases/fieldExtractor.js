/**
 * Case field extractor.
 *
 * Given the markdown of an uploaded legal document, ask the LLM to pull out the
 * structured case fields + parties so the create form can be pre-filled. The
 * LLM is instructed to return only allowed enum values, and `normalizeExtractedFields`
 * enforces that server-side (any out-of-list value is dropped to null) so a bad
 * model guess can never produce an invalid form value.
 *
 * Pattern mirrors src/services/chat/queryAnalyzer.js (raw OpenAI SDK + prompt-coaxed
 * JSON + regex extraction), which is the repo's convention for gpt-5.x JSON calls.
 */

import OpenAI from 'openai';
import { createLogger } from '../logger.js';
import {
  QUERY_UNDERSTANDING_MODEL,
} from '@/config/models';
import {
  CASE_CATEGORIES,
  CASE_SUBTYPES,
  CASE_STAGES,
  CASE_STATUSES,
  CASE_PRIORITIES,
  PARTY_ROLES,
  PARTY_ROLE_LABELS_AR,
  DOCUMENT_TYPES,
  DOCUMENT_TAGS,
  getSubtypesForCategory,
} from './referenceOptions.js';

const logger = createLogger('case-extract');

// Reasoning effort for extraction. 'medium' balances accuracy vs a reliable,
// non-empty JSON completion; 'high' was observed to return empty/truncated output.
const EXTRACTION_REASONING_EFFORT = 'medium';

// Kuwait civil ID is a 12-digit number.
const CIVIL_ID_PATTERN = /\b\d{12}\b/g;

// Cap the markdown we send to keep token usage/latency bounded on large files.
const MAX_MARKDOWN_CHARS = 24000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function buildPrompt(markdown, language = 'en') {
  const targetLanguage = language === 'ar' ? 'Arabic' : 'English';
  const categoryList = CASE_CATEGORIES.map((c) => c.name).join(', ');
  const subtypeLines = CASE_CATEGORIES
    .map((c) => {
      const subs = getSubtypesForCategory(c.name);
      return `  - ${c.name}: ${subs.length ? subs.join(', ') : '(no sub-types)'}`;
    })
    .join('\n');
  const stageList = CASE_STAGES.map((s) => s.name).join(', ');
  const documentTypeList = DOCUMENT_TYPES.join(', ');
  const documentTagList = DOCUMENT_TAGS.map((t) => t.name).join(', ');
  // Sub-types are listed with their Arabic names so an Arabic charge can be
  // matched without the model having to translate it first.
  const subtypeGlossary = CASE_SUBTYPES
    .filter((sub) => sub.nameAr)
    .map((sub) => `  - ${sub.nameAr} => ${sub.name}`)
    .join('\n');
  const roleGlossary = PARTY_ROLES
    .map((role) => `  - ${PARTY_ROLE_LABELS_AR[role] || role} => ${role}`)
    .join('\n');

  return `You are extracting structured data from a legal case document to pre-fill a case intake form.

Return ONLY a valid JSON object with EXACTLY these keys (use null when the document does not clearly state a value — never guess or invent):

{
  "serialNumber": string|null,          // internal/serial reference number (الرقم الآلي)
  "caseNumber": string|null,            // court case number (رقم القضية)
  "caseCategory": string|null,          // one of: ${categoryList}
  "caseSubType": string|null,           // must belong to the chosen category (see list below)
  "currentStage": string|null,          // one of: ${stageList}
  "status": string|null,                // one of: active, pending, closed
  "priority": string|null,              // one of: high, medium, low
  "assignedTo": string|null,            // assigned lawyer / advocate name
  "filedDate": string|null,             // YYYY-MM-DD
  "nextHearing": string|null,           // YYYY-MM-DD
  "publicProsecutorMemo": string|null,  // prosecutor memo / opinion text
  "parties": [                          // people/entities involved; [] if none found
    {
      "name": string,
      "civilId": string|null,           // national/civil ID number if present
      "role": string|null,              // one of: ${PARTY_ROLES.join(', ')}
      "address": string|null,
      "phone": string|null,
      "email": string|null,
      "notes": string|null
    }
  ],
  "document": {                         // metadata describing THIS uploaded document
    "title": string|null,               // concise human title (e.g. "Appeal brief — case 2024/31275")
    "documentType": string|null,        // one of: ${documentTypeList}
    "description": string|null,         // one short sentence summarizing the document
    "tags": string[]                    // zero or more of: ${documentTagList}
  }
}

Sub-types by category (caseSubType MUST be from the chosen category's list):
${subtypeLines}

Arabic charge => caseSubType (match the charge text, التهمة, against these):
${subtypeGlossary}

Arabic party heading => role (the heading above a party's details, e.g. "بيانات المتهم"):
${roleGlossary}

READING KUWAITI COURT DOCUMENTS

These documents are Kuwaiti (Arabic) prosecution and court files converted to
markdown. Their tables are right-to-left, so the CELL ORDER IS REVERSED: the
VALUE comes FIRST and its LABEL SECOND, like \`| 284915710205 | **الرقم المدني** |\`
— which means 284915710205 is the civil ID. Never read the first cell as a label.

Common field labels:
- الرقم الآلي / الرقم التسلسلي => serialNumber
- رقم القضية / القضية رقم => caseNumber
- التهمة / الجريمة => the charge, used to pick caseSubType
- المادة القانونية => the statute (put in notes, not a field of its own)
- اسم المحكمة => the court name
- وكيل النيابة => public prosecutor (a party, role public_prosecutor)
- المحامي / رقم قيد المحامي => the advocate; also the value for assignedTo
- الموكِّل / الوكيل => client / lawyer in a power of attorney (وكالة)

Document types and the date each one carries:
- محضر جلسة (hearing minutes) => documentType court-order; date label تاريخ الجلسة
- حكم / حكم محكمة (judgment) => documentType court-order; date label تاريخ إصدار الحكم
- صحيفة استئناف (appeal petition) => documentType legal-document; date label تاريخ تقديم الاستئناف
- وكالة (power of attorney) => documentType legal-document; date label تاريخ تحرير الوكالة
- قرار نيابة (prosecution decision) => documentType court-order; date label تاريخ القرار

CASE CATEGORY
- A document issued by النيابة العامة (the Public Prosecution) or by a criminal
  court (محكمة الجنح, محكمة الجنايات) is a Criminal case even when no charge is
  named — those bodies handle nothing else. Do not leave caseCategory null then.
- caseSubType is different: it needs a stated charge. Leave it null when the
  document names none, and never guess a sub-type from the court alone.

DATES
- Output YYYY-MM-DD. Kuwaiti documents usually write YYYY/MM/DD.
- If a date is Hijri (marked هـ or ه), convert it to the Gregorian calendar. If
  both calendars are shown, use the Gregorian one.
- filedDate: prefer an explicit filing date (تاريخ تقديم / تاريخ القيد / تاريخ الإيداع).
  If the document states no filing date, fall back to the DOCUMENT'S OWN date
  from the list above — every one of these document types carries exactly one.
  Only use null if the document truly has no date at all.
- nextHearing: only a FUTURE or explicitly adjourned-to hearing (الجلسة القادمة /
  أُجّلت إلى). A hearing that already took place is NOT nextHearing.

CONSISTENCY
Two documents of the same type, laid out the same way, must produce the same
fields. Do not fill a field for one hearing minute and leave it null for another
that presents the same information in the same place.

Rules:
- The document may be in Arabic or English. ALWAYS output the ENGLISH enum values above (map Arabic terms to the matching English option).
- Write ALL free-text values (party name, notes, address, assignedTo, publicProsecutorMemo, and the document title/description) in ${targetLanguage}. If the source uses another language, translate or transliterate names and places into ${targetLanguage}.
- The enum fields (caseCategory, caseSubType, currentStage, status, priority, party role, documentType), identifiers (serialNumber, caseNumber, civilId), and dates stay in their canonical form regardless of the target language.
- Civil ID (الرقم المدني) is a 12-digit number. It may appear in a table row or a mislabeled/scrambled cell — scan the ENTIRE document for any 12-digit number and attach it to the correct party's "civilId".
- Capture EVERY named party, including the victim (المجني عليه), the prosecutor (وكيل النيابة) and each advocate — not only the accused.
- Populate EVERY field for which the document provides information (name, civil ID, phone, email, address, dates, assignee, memo). Only use null when the value is genuinely absent — do not leave a field null if the information exists in the text.
- Do not fabricate identifiers, dates, or names. If unsure, use null.
- priority is an internal triage value that court documents do not state; leave it null unless the document explicitly marks the case urgent (عاجل/مستعجل).
- Return ONLY the JSON object, no prose, no markdown fences.

DOCUMENT:
${markdown}`;
}

/**
 * Call the LLM and return the raw parsed object (unvalidated), or null on failure.
 * @param {string} markdown
 * @param {object} [options] - { openai } override for testing
 * @returns {Promise<object|null>}
 */
export async function extractCaseFields(markdown, options = {}) {
  const client = options.openai || openai;
  const text = String(markdown || '').slice(0, MAX_MARKDOWN_CHARS);
  const timer = logger.timer('extract', { markdownChars: text.length });

  if (!text.trim()) {
    timer.result({ parsed: false, reason: 'empty-markdown' });
    return null;
  }

  try {
    const response = await client.chat.completions.create({
      model: QUERY_UNDERSTANDING_MODEL,
      reasoning_effort: EXTRACTION_REASONING_EFFORT,
      messages: [
        { role: 'system', content: 'You extract structured legal case data. Return only valid JSON.' },
        { role: 'user', content: buildPrompt(text, options.language) },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      timer.result({ parsed: false, reason: 'no-json' });
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    timer.result({ parsed: true, parties: Array.isArray(parsed.parties) ? parsed.parties.length : 0 });
    return parsed;
  } catch (error) {
    timer.error(error);
    return null;
  }
}

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Match a value against a list of allowed strings, case-insensitively; returns the canonical value or null. */
function matchOption(value, allowed) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  return allowed.find((option) => option.toLowerCase() === lower) || null;
}

/**
 * Match against reference items ({ name, nameAr }) by English name (case-insensitive)
 * or Arabic label (exact). The LLM is asked to output English, but this makes the
 * normalizer resilient if it echoes the document's Arabic term. Returns the canonical
 * English name or null.
 */
function matchReference(value, items) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  const found = items.find(
    (item) => item.name.toLowerCase() === lower || (item.nameAr && item.nameAr === cleaned),
  );
  return found ? found.name : null;
}

function normalizeDate(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return null;
  // Format from local parts (not toISOString) to avoid a UTC day-shift.
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDocument(raw) {
  const doc = raw && typeof raw === 'object' ? raw.document : null;
  if (!doc || typeof doc !== 'object') return null;

  const tagNames = DOCUMENT_TAGS.map((t) => t.name);
  const tags = Array.isArray(doc.tags)
    ? [...new Set(doc.tags.map((tag) => matchOption(tag, tagNames)).filter(Boolean))]
    : [];

  return {
    title: cleanString(doc.title),
    documentType: matchOption(doc.documentType, DOCUMENT_TYPES),
    description: cleanString(doc.description),
    tags,
  };
}

function normalizeParty(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanString(raw.name);
  if (!name) return null; // a party with no name is not usable
  const role = matchOption(raw.role, PARTY_ROLES) || 'other';
  return {
    name,
    civilId: cleanString(raw.civilId),
    role,
    address: cleanString(raw.address),
    phone: cleanString(raw.phone),
    email: cleanString(raw.email),
    notes: cleanString(raw.notes),
  };
}

/**
 * Validate/coerce the raw LLM output into safe form values. Pure (no network) so
 * it can be unit-tested directly. Any enum value outside the allow-list becomes null.
 * @param {object|null} raw
 * @returns {{ fields: object, parties: object[] }}
 */
export function normalizeExtractedFields(raw) {
  if (!raw || typeof raw !== 'object') {
    return { fields: {}, parties: [], document: null };
  }

  const caseCategory = matchReference(raw.caseCategory, CASE_CATEGORIES);

  // A sub-type is only valid if it belongs to the resolved category.
  let caseSubType = null;
  if (caseCategory) {
    const subtypeItems = CASE_SUBTYPES.filter((s) => s.categoryId === caseCategory);
    caseSubType = matchReference(raw.caseSubType, subtypeItems);
  }

  const fields = {
    serialNumber: cleanString(raw.serialNumber),
    caseNumber: cleanString(raw.caseNumber),
    caseCategory,
    caseSubType,
    currentStage: matchReference(raw.currentStage, CASE_STAGES),
    status: matchOption(raw.status, CASE_STATUSES),
    priority: matchOption(raw.priority, CASE_PRIORITIES),
    assignedTo: cleanString(raw.assignedTo),
    filedDate: normalizeDate(raw.filedDate),
    nextHearing: normalizeDate(raw.nextHearing),
    publicProsecutorMemo: cleanString(raw.publicProsecutorMemo),
  };

  const parties = Array.isArray(raw.parties)
    ? raw.parties.map(normalizeParty).filter(Boolean)
    : [];

  return { fields, parties, document: normalizeDocument(raw) };
}

/**
 * Deterministic safety net for civil IDs. Firecrawl frequently scrambles the
 * Arabic table cell holding the 12-digit civil ID so the LLM misses it. Any
 * 12-digit numbers in the raw text that aren't already assigned are attached to
 * the parties that lack a civilId, in document order (a natural-person party is
 * typically listed first; entities like the public prosecution have no civil ID
 * and simply get whatever is left over, i.e. nothing).
 * @param {object[]} parties
 * @param {string} markdown
 * @returns {object[]} parties with civilId backfilled
 */
export function backfillCivilIds(parties, markdown) {
  if (!Array.isArray(parties) || parties.length === 0) return parties || [];

  const found = [...new Set(String(markdown || '').match(CIVIL_ID_PATTERN) || [])];
  if (found.length === 0) return parties;

  const used = new Set(parties.map((p) => p.civilId).filter(Boolean));
  const available = found.filter((id) => !used.has(id));
  const missingIndexes = parties
    .map((p, index) => (p.civilId ? -1 : index))
    .filter((index) => index >= 0);

  if (available.length === 0 || missingIndexes.length === 0) return parties;

  // Assign available IDs to missing parties in order; extras (more parties than
  // IDs) stay null.
  const next = parties.map((p) => ({ ...p }));
  missingIndexes.forEach((partyIndex, i) => {
    if (available[i]) next[partyIndex].civilId = available[i];
  });
  return next;
}

export default {
  extractCaseFields,
  normalizeExtractedFields,
  backfillCivilIds,
};
