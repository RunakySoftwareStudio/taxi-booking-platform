/* ============================================================
   VOYA TAXI — REQUIRED FINANCIAL EXCLUSION REASON

   Purpose:
   Ensure every financially excluded booking has a
   meaningful explanation recorded by the administrator.

   An included booking must not retain an exclusion reason.
============================================================ */

/* Replace the temporary consistency constraint. */
ALTER TABLE public.bookings
DROP CONSTRAINT bookings_financial_exclusion_reason_consistent;

/* Require a reason only when financial exclusion is enabled. */
ALTER TABLE public.bookings
ADD CONSTRAINT bookings_financial_exclusion_reason_consistent
CHECK (
    (
        is_financially_excluded = TRUE
        AND financial_exclusion_reason IS NOT NULL
        AND LENGTH(TRIM(financial_exclusion_reason)) > 0
    )
    OR
    (
        is_financially_excluded = FALSE
        AND financial_exclusion_reason IS NULL
    )
);