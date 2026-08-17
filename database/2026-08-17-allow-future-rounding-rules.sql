/* ============================================================
   FUTURE ROUNDING RULE LIFECYCLE

   Purpose:
   Allows more than one approved active rounding rule for the
   same country and currency, provided their effective periods
   do not overlap.

   Example:

   €0.01 nearest
   [2026-01-01 ---------------- 2027-01-01)

   €0.05 nearest
                               [2027-01-01 ---------------- ...)

   The end boundary is exclusive, so only one rule applies at
   the exact change moment.
============================================================ */


/* ------------------------------------------------------------
   Remove the old rule that allowed only one active rounding row.
------------------------------------------------------------ */

DROP INDEX IF EXISTS public.currency_rounding_rules_one_active_rule_idx;


/* ------------------------------------------------------------
   Prevent overlapping active rounding periods.

   btree_gist is already enabled in this database.

   effective_until = NULL means the rule continues indefinitely.
------------------------------------------------------------ */

ALTER TABLE public.currency_rounding_rules
ADD CONSTRAINT currency_rounding_rules_active_periods_do_not_overlap
EXCLUDE USING gist (
    country_code WITH =,
    currency_code WITH =,
    tstzrange(
        effective_from,
        COALESCE(effective_until, 'infinity'::timestamptz),
        '[)'
    ) WITH &&
)
WHERE (status = 'active');