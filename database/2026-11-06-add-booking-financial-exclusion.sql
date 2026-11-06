/* ============================================================
   VOYA TAXI — BOOKING FINANCIAL EXCLUSION

   Purpose:
   Prevent test bookings and explicitly excluded bookings
   from generating chauffeur commissions or invoice items.

   FALSE: Eligible for financial processing, provided
          all other commission conditions are satisfied.
   TRUE:  Excluded from financial processing.

   This field does not affect operational booking status.
============================================================ */

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS is_financially_excluded
    BOOLEAN NOT NULL DEFAULT FALSE;

/* Document the business purpose in PostgreSQL. */
COMMENT ON COLUMN public.bookings.is_financially_excluded IS
'When TRUE, prevents the booking from generating chauffeur commissions or invoice items.
Intended for test bookings and other explicitly excluded reservations.
Does not affect booking status or operational workflows.';