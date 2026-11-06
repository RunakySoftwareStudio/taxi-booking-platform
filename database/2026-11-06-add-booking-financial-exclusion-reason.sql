/* ============================================================
   VOYA TAXI — BOOKING FINANCIAL EXCLUSION REASON

   Purpose:
   Store the administrator's explanation for excluding
   a booking from chauffeur commission invoicing.

   A reason is required whenever a booking is excluded.

   Historical compatibility:
   Existing excluded bookings are allowed to have a NULL
   reason temporarily until their reasons are recorded.
============================================================ */

/* Store the financial exclusion explanation. */
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS financial_exclusion_reason TEXT NULL;

/* Explain the field's purpose in PostgreSQL. */
COMMENT ON COLUMN public.bookings.financial_exclusion_reason IS
'Administrative explanation for excluding a booking from chauffeur commission invoicing, such as testing, complimentary journeys or waived service fees.';

/* A non-excluded booking must not retain an exclusion reason. */
ALTER TABLE public.bookings
ADD CONSTRAINT bookings_financial_exclusion_reason_consistent
CHECK (
    is_financially_excluded = TRUE
    OR financial_exclusion_reason IS NULL
);