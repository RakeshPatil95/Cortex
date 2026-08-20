-- Party roles for Kuwaiti criminal procedure.
--
-- Prosecution files name parties as المجني عليه (victim), وكيل النيابة (public
-- prosecutor), المستأنف / المستأنف ضده (appellant / respondent) and الموكِّل
-- (client). None had a matching PartyRole value, so every one of them was
-- stored as 'other', making them impossible to filter or query by role.
--
-- Values are appended: PostgreSQL cannot remove or reorder enum members, and
-- existing 'other' rows are left untouched (re-import or edit reclassifies them).

ALTER TYPE "PartyRole" ADD VALUE IF NOT EXISTS 'victim';
ALTER TYPE "PartyRole" ADD VALUE IF NOT EXISTS 'public_prosecutor';
ALTER TYPE "PartyRole" ADD VALUE IF NOT EXISTS 'appellant';
ALTER TYPE "PartyRole" ADD VALUE IF NOT EXISTS 'respondent';
ALTER TYPE "PartyRole" ADD VALUE IF NOT EXISTS 'client';
