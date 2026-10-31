/* ============================================================
   VOYA TAXI - BOOKING PICKUP TIMEZONE
   Date: 2026-10-30

   Purpose:
   Store the geographic timezone and exact pickup timestamp.

   These fields will support:
   - Client cancellation deadlines.
   - Future automatic booking completion.
   - International booking time calculations.

   Both columns are initially nullable to preserve
   compatibility with existing bookings.
============================================================ */

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS pickup_timezone TEXT,
    ADD COLUMN IF NOT EXISTS pickup_at TIMESTAMPTZ;

/* Explain the purpose of each new column. */
COMMENT ON COLUMN public.bookings.pickup_timezone IS
'IANA timezone of the booking pickup location, resolved from geographic coordinates.';

COMMENT ON COLUMN public.bookings.pickup_at IS
'Exact scheduled pickup timestamp, calculated from the pickup local date, time and timezone.';