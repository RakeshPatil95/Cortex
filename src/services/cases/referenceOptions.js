/**
 * Shared case reference options.
 *
 * Single source of truth for the constrained option lists used across the case
 * form (create mode), the `reference-data` API route (edit mode), and the
 * document field extractor. Keeping them here avoids the previous drift where
 * the create form and the API returned slightly different category/sub-type
 * lists.
 */

export const CASE_CATEGORIES = [
  { id: '1', name: 'Criminal', nameAr: 'جنائي', description: 'Criminal cases', isActive: true },
  { id: '2', name: 'Civil', nameAr: 'مدني', description: 'Civil cases', isActive: true },
  { id: '3', name: 'Family', nameAr: 'أحوال شخصية', description: 'Family law cases', isActive: true },
  { id: '4', name: 'Commercial', nameAr: 'تجاري', description: 'Commercial cases', isActive: true },
  { id: '5', name: 'Administrative', nameAr: 'إداري', description: 'Administrative cases', isActive: true },
];

// `categoryId` holds the category NAME (the form matches sub-types to the
// selected category by name, not a numeric id).
export const CASE_SUBTYPES = [
  { id: '1', name: 'Theft', nameAr: 'سرقة', categoryId: 'Criminal', description: 'Theft cases', isActive: true },
  { id: '2', name: 'Assault', nameAr: 'اعتداء', categoryId: 'Criminal', description: 'Assault cases', isActive: true },
  { id: '3', name: 'Fraud', nameAr: 'احتيال', categoryId: 'Criminal', description: 'Fraud cases', isActive: true },
  // Charges common in Kuwaiti prosecution files that previously had no valid
  // sub-type, so the extractor was forced to return null for them.
  { id: '11', name: 'Forgery', nameAr: 'تزوير', categoryId: 'Criminal', description: 'Forgery of official or commercial documents (التزوير في المحررات)', isActive: true },
  { id: '12', name: 'Public Order Offence', nameAr: 'الإخلال بالنظام العام', categoryId: 'Criminal', description: 'Breach of public order', isActive: true },
  { id: '13', name: 'Domicile Violation', nameAr: 'انتهاك حرمة المسكن', categoryId: 'Criminal', description: 'Violation of the sanctity of a dwelling', isActive: true },
  { id: '14', name: 'Abuse of Office', nameAr: 'إساءة استخدام الوظيفة', categoryId: 'Criminal', description: 'Misuse of public office or authority', isActive: true },
  { id: '15', name: 'Defamation', nameAr: 'التشهير والإضرار بالسمعة', categoryId: 'Criminal', description: 'Defamation and damage to reputation', isActive: true },
  { id: '16', name: 'Bounced Cheque', nameAr: 'إصدار شيك بدون رصيد', categoryId: 'Criminal', description: 'Issuing a cheque without sufficient funds', isActive: true },
  { id: '4', name: 'Contract Dispute', nameAr: 'نزاع عقدي', categoryId: 'Civil', description: 'Contract disputes', isActive: true },
  { id: '5', name: 'Property Dispute', nameAr: 'نزاع عقاري', categoryId: 'Civil', description: 'Property disputes', isActive: true },
  { id: '6', name: 'Divorce', nameAr: 'طلاق', categoryId: 'Family', description: 'Divorce cases', isActive: true },
  { id: '7', name: 'Custody', nameAr: 'حضانة', categoryId: 'Family', description: 'Child custody cases', isActive: true },
  { id: '8', name: 'Inheritance', nameAr: 'إرث', categoryId: 'Family', description: 'Inheritance cases', isActive: true },
  { id: '9', name: 'Partnership', nameAr: 'شراكة', categoryId: 'Commercial', description: 'Partnership disputes', isActive: true },
  { id: '10', name: 'Bankruptcy', nameAr: 'إفلاس', categoryId: 'Commercial', description: 'Bankruptcy cases', isActive: true },
];

export const CASE_STAGES = [
  { id: '1', name: 'Filed', nameAr: 'مرفوع', order: 1, isFinal: false },
  { id: '2', name: 'Under Review', nameAr: 'قيد المراجعة', order: 2, isFinal: false },
  { id: '3', name: 'In Progress', nameAr: 'قيد الإجراء', order: 3, isFinal: false },
  { id: '4', name: 'Hearing', nameAr: 'جلسة', order: 4, isFinal: false },
  { id: '5', name: 'Decided', nameAr: 'محكوم', order: 5, isFinal: true },
  { id: '6', name: 'Closed', nameAr: 'مغلق', order: 6, isFinal: true },
];

export const DOCUMENT_TAGS = [
  { id: '1', name: 'Confidential', nameAr: 'سري', color: '#ef4444' },
  { id: '2', name: 'Urgent', nameAr: 'عاجل', color: '#f59e0b' },
  { id: '3', name: 'Original', nameAr: 'أصلي', color: '#10b981' },
  { id: '4', name: 'Copy', nameAr: 'نسخة', color: '#3b82f6' },
  { id: '5', name: 'Draft', nameAr: 'مسودة', color: '#8b5cf6' },
  { id: '6', name: 'Final', nameAr: 'نهائي', color: '#059669' },
  { id: '7', name: 'Legal', nameAr: 'قانوني', color: '#dc2626' },
  { id: '8', name: 'Financial', nameAr: 'مالي', color: '#16a34a' },
  { id: '9', name: 'Medical', nameAr: 'طبي', color: '#7c3aed' },
  { id: '10', name: 'Technical', nameAr: 'تقني', color: '#0891b2' },
];

// Enum-typed columns (must match prisma/schema.prisma CaseStatus / CasePriority / PartyRole).
export const CASE_STATUSES = ['active', 'pending', 'closed'];
export const CASE_PRIORITIES = ['high', 'medium', 'low'];
// Order matters only for display. `victim`, `public_prosecutor`, `appellant`,
// `respondent` and `client` were added for Kuwaiti criminal procedure: the
// party headings in prosecution files (المجني عليه, وكيل النيابة, المستأنف,
// المستأنف ضده, الموكِّل) previously all collapsed into `other`.
export const PARTY_ROLES = [
  'defendant', 'plaintiff', 'co_defendant', 'victim', 'public_prosecutor',
  'appellant', 'respondent', 'client', 'witness', 'expert', 'lawyer', 'other',
];

/** Arabic labels for party roles, used to coach the extractor and for display. */
export const PARTY_ROLE_LABELS_AR = {
  defendant: 'المتهم',
  plaintiff: 'المدعي',
  co_defendant: 'المتهم الثاني',
  victim: 'المجني عليه',
  public_prosecutor: 'وكيل النيابة',
  appellant: 'المستأنف',
  respondent: 'المستأنف ضده',
  client: 'الموكِّل',
  witness: 'الشاهد',
  expert: 'الخبير',
  lawyer: 'المحامي / الوكيل',
  other: 'أخرى',
};

// Document types offered in the case form's document editor.
export const DOCUMENT_TYPES = [
  'legal-document', 'evidence', 'contract', 'correspondence', 'court-order',
  'expert-report', 'financial-record', 'medical-record', 'witness-statement', 'other',
];

/** Sub-type names that belong to a given category name (case-insensitive). */
export function getSubtypesForCategory(categoryName) {
  if (!categoryName) return [];
  const target = String(categoryName).toLowerCase();
  return CASE_SUBTYPES.filter((s) => s.categoryId.toLowerCase() === target).map((s) => s.name);
}

export default {
  PARTY_ROLE_LABELS_AR,
  CASE_CATEGORIES,
  CASE_SUBTYPES,
  CASE_STAGES,
  DOCUMENT_TAGS,
  CASE_STATUSES,
  CASE_PRIORITIES,
  PARTY_ROLES,
  DOCUMENT_TYPES,
  getSubtypesForCategory,
};
