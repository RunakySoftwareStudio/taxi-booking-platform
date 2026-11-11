/* ============================================================
   VOYA TAXI — ALLOW OVERLAPPING CHAUFFEUR ADJUSTMENTS

   Different chauffeur adjustment definitions may share
   effective dates. Duplicate overlapping assignments of
   the same definition to one chauffeur will be prevented
   separately by the assignment table.
============================================================ */

BEGIN;

-- Remove the global overlap restriction on definitions.
ALTER TABLE public.chauffeur_adjustment_definitions
    DROP CONSTRAINT IF EXISTS chauffeur_adjustment_no_period_overlap;

COMMIT;