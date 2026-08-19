/*
 * VOYA TAXI - TAX-RULE DRAFT CONSTRAINT
 *
 * Purpose:
 * Allows only one draft tax rule for each financial tax family.
 *
 * A tax family is identified by:
 * - country_code;
 * - service_category.
 *
 * Multiple approved/active tax rules may still exist for different
 * effective periods. This constraint applies only to draft rows.
 *
 * Example:
 *
 * BE + passenger_transport
 *     active 6%     -> allowed
 *     future 7%     -> allowed when effective periods do not overlap
 *     draft         -> maximum one
 */

CREATE UNIQUE INDEX IF NOT EXISTS
    tax_rules_one_draft_version_idx
ON public.tax_rules (
    country_code,
    service_category
)
WHERE status = 'draft';