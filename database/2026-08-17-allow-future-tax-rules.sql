/* ============================================================
   FUTURE TAX RULE LIFECYCLE

   Purpose:
   Allows more than one approved active tax rule for the same
   country and service category, provided their effective periods
   do not overlap.

   Example:

   9%   [2026-01-01 ---------------- 2027-01-01)
   10%                           [2027-01-01 ---------------- ...)

   The end boundary is exclusive, so only one rule applies at
   the exact change moment.
============================================================ */


/* ------------------------------------------------------------
   Remove the old rule that allowed only one active tax row.
------------------------------------------------------------ */

DROP INDEX IF EXISTS public.tax_rules_one_active_rule_idx;


/* ------------------------------------------------------------
   Prevent overlapping active tax periods.

   btree_gist is already enabled in this database.

   effective_until = NULL means the rule continues indefinitely.
   The important part is:'[)'
    which means:
        [  start is included
        )  end is excluded
    So:
        old VAT ends    2027-01-01 00:00
        new VAT starts  2027-01-01 00:00
    is allowed because the two periods touch but do not overlap.

    OALESCE(effective_until, 'infinity'::timestamptz)
        means a NULL end date is treated as continuing forever.
------------------------------------------------------------ */

ALTER TABLE public.tax_rules
ADD CONSTRAINT tax_rules_active_periods_do_not_overlap
EXCLUDE USING gist (
    country_code WITH =,
    service_category WITH =,
    tstzrange(
        effective_from,
        COALESCE(effective_until, 'infinity'::timestamptz),
        '[)'
    ) WITH &&
)
WHERE (status = 'active');