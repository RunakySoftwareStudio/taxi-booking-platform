/* ============================================================
   VOYA TAXI - REQUIRE BOOKING CANCELLATION AUDIT

   Purpose:
   1. Prevent permanently cancelled bookings from reactivation.
   2. Require an audit record before changing status to cancelled.
============================================================ */

BEGIN;

/* Extend the existing booking cancellation protection function. */
CREATE OR REPLACE FUNCTION public.prevent_cancelled_booking_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN

    /* --------------------------------------------------------
       RULE 1 - PERMANENT CANCELLATION CANNOT BE REVERSED
    -------------------------------------------------------- */

    IF OLD.status = 'cancelled'
       AND NEW.status IS DISTINCT FROM OLD.status THEN

        RAISE EXCEPTION
            'A permanently cancelled booking cannot be reactivated.'
        USING ERRCODE = '22023';
    END IF;

    /* --------------------------------------------------------
       RULE 2 - EVERY NEW CANCELLATION REQUIRES AN AUDIT RECORD
    -------------------------------------------------------- */

    IF OLD.status IS DISTINCT FROM 'cancelled'
       AND NEW.status = 'cancelled'
       AND NOT EXISTS (
           SELECT 1
           FROM public.booking_cancellations
           WHERE booking_id = NEW.id
       ) THEN

        RAISE EXCEPTION
            'Booking cancellation requires an audit record.'
        USING ERRCODE = '22023';
    END IF;

    RETURN NEW;

END;
$function$;

COMMIT;