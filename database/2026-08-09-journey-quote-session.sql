/*
================================================================
JOURNEY QUOTE BOOKING SESSION

Purpose:
Connects temporary journey quotes that belong to the same
unfinished public booking attempt.

This allows the server to safely identify which old quote
may be voided when the customer:
- changes the journey;
- requests a replacement quote;
- cancels the unfinished booking.

The value is not a customer ID and is not globally unique
across all booking history by business meaning. It is simply
a UUID identifying one temporary booking session.
================================================================
*/

ALTER TABLE public.journey_quotes
ADD COLUMN IF NOT EXISTS booking_session_id UUID;

/*
    Older development quotes remain NULL.

    New public quotes will receive a booking session ID from
    the current booking form workflow.
*/
CREATE INDEX IF NOT EXISTS journey_quotes_booking_session_id_idx
ON public.journey_quotes (booking_session_id);