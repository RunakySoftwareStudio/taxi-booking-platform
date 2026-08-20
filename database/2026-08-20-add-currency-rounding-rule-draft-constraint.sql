/*
 * VOYA TAXI - CURRENCY ROUNDING-RULE DRAFT CONSTRAINT
 *
 * Purpose:
 * Allows at most one unfinished draft for each
 * country/currency rounding-rule family.
 *
 * Example:
 *
 * BE + EUR
 *
 * 0 drafts -> allowed
 * 1 draft  -> allowed
 * 2 drafts -> rejected
 */

CREATE UNIQUE INDEX IF NOT EXISTS
    currency_rounding_rules_one_draft_per_family_idx
ON public.currency_rounding_rules (
    country_code,
    currency_code
)
WHERE status = 'draft';