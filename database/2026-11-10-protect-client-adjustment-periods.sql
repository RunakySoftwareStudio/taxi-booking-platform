/* ============================================================
   VOYA TAXI — CLIENT ADJUSTMENT PERIOD PROTECTION

   Prevent overlapping effective periods for adjustments
   of the same type, including inactive definitions.

   Discounts and surcharges may overlap with each other.
============================================================ */

BEGIN;

/* SECTION 1: Enable PostgreSQL exclusion constraints. */
CREATE EXTENSION IF NOT EXISTS btree_gist;

/* SECTION 2: Prevent overlapping periods of the same type. */
ALTER TABLE public.client_adjustment_definitions
ADD CONSTRAINT client_adjustment_no_period_overlap
EXCLUDE USING gist (
    adjustment_type WITH =,
    daterange(effective_from, effective_until, '[]') WITH &&
);

/* SECTION 3: Explain the financial protection rule. */
COMMENT ON CONSTRAINT client_adjustment_no_period_overlap
ON public.client_adjustment_definitions IS
'Prevents overlapping effective periods within the same adjustment type, including inactive definitions. Discounts and surcharges may coexist.';

COMMIT;