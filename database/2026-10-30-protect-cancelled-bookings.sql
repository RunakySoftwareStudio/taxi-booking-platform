/* ============================================================
   VOYA TAXI - PROTECT PERMANENTLY CANCELLED BOOKINGS

   Purpose:
   Prevent reactivation of permanently cancelled bookings,
   regardless of which application operation updates them.
============================================================ */

BEGIN;

/* Reject attempts to change a cancelled booking's status. */
CREATE OR REPLACE FUNCTION public.prevent_cancelled_booking_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.status = 'cancelled'
       AND NEW.status IS DISTINCT FROM OLD.status THEN

        RAISE EXCEPTION
            'A permanently cancelled booking cannot be reactivated.'
        USING ERRCODE = '22023';

    END IF;

    RETURN NEW;
END;
$$;

/* Enforce the rule on every booking status update. */
CREATE TRIGGER prevent_cancelled_booking_reactivation
BEFORE UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_cancelled_booking_reactivation();

COMMIT;