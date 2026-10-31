/* ============================================================
   VOYA TAXI - CENTRALIZED BOOKING CANCELLATION

   Purpose:
   Permanently cancel a booking, preserve cancellation history,
   remove chauffeur assignment and release reserved time.

   All operations run in one PostgreSQL transaction.
   Only service_role may execute this function.
============================================================ */

BEGIN;

/* ------------------------------------------------------------
   SECTION 1 - CREATE THE CANCELLATION FUNCTION
------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.cancel_booking(
    p_booking_id UUID,
    p_cancelled_by TEXT,
    p_cancelled_by_user_id UUID DEFAULT NULL,
    p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_booking RECORD;
    v_cancellation_id UUID;
    v_reason TEXT;
BEGIN

    /* --------------------------------------------------------
       SECTION 2 - VALIDATE REQUEST

       Only client and admin cancellation are supported here.
       System cancellations can be introduced separately.
    -------------------------------------------------------- */

    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'Booking ID is required.'
        USING ERRCODE = '22023';
    END IF;

    IF p_cancelled_by IS NULL
       OR p_cancelled_by NOT IN ('client', 'admin') THEN

        RAISE EXCEPTION 'Invalid cancellation actor.'
        USING ERRCODE = '22023';
    END IF;

    v_reason := NULLIF(BTRIM(p_cancellation_reason), '');

    IF p_cancelled_by = 'admin' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'Admin cancellation requires a reason.'
        USING ERRCODE = '22023';
    END IF;

    /* --------------------------------------------------------
       SECTION 3 - LOCK THE BOOKING

       Prevent concurrent changes to the same booking.
    -------------------------------------------------------- */

    SELECT
        id,
        status,
        chauffeur_id,
        pickup_at
    INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking was not found.'
        USING ERRCODE = 'P0002';
    END IF;

    /* --------------------------------------------------------
       SECTION 4 - VALIDATE CANCELLATION STATUS

       Completed, rejected and previously cancelled bookings
       cannot be cancelled again.
    -------------------------------------------------------- */

    IF v_booking.status IN ('cancelled', 'completed', 'rejected') THEN
        RAISE EXCEPTION
            'Booking cannot be cancelled in its current status.'
        USING ERRCODE = '22023';
    END IF;

    /* --------------------------------------------------------
       SECTION 5 - ENFORCE CLIENT CANCELLATION DEADLINE

       More than 24 hours must remain before pickup.

       Older bookings without pickup_at cannot be cancelled
       through this client operation until safely migrated.
    -------------------------------------------------------- */

    IF p_cancelled_by = 'client'
       AND (
           v_booking.pickup_at IS NULL
           OR v_booking.pickup_at <= NOW() + INTERVAL '24 hours'
       ) THEN

        RAISE EXCEPTION
            'Client cancellation requires more than 24 hours before pickup.'
        USING ERRCODE = '22023';
    END IF;

    /* --------------------------------------------------------
       SECTION 6 - LOCK THE CHAUFFEUR SCHEDULE

       Follow the existing scheduling lock order.
    -------------------------------------------------------- */

    PERFORM public.lock_chauffeur_schedule_pair(
        v_booking.chauffeur_id,
        NULL
    );

    /* --------------------------------------------------------
       SECTION 7 - RECORD CANCELLATION HISTORY

       Store the previous chauffeur before clearing assignment.
    -------------------------------------------------------- */

    INSERT INTO public.booking_cancellations (
        booking_id,
        cancelled_by,
        cancelled_by_user_id,
        previous_chauffeur_id,
        cancellation_reason
    )
    VALUES (
        p_booking_id,
        p_cancelled_by,
        p_cancelled_by_user_id,
        v_booking.chauffeur_id,
        v_reason
    )
    RETURNING id INTO v_cancellation_id;

    /* --------------------------------------------------------
       SECTION 8 - CANCEL AND UNASSIGN BOOKING
    -------------------------------------------------------- */

    UPDATE public.bookings
    SET
        status = 'cancelled',
        chauffeur_id = NULL,
        vehicle_id = NULL
    WHERE id = p_booking_id;

    /* --------------------------------------------------------
       SECTION 9 - RELEASE RESERVED CHAUFFEUR TIME

       Remove only busy intervals linked to this booking.
       Do not remove manual unavailable periods.
    -------------------------------------------------------- */

    DELETE FROM public.chauffeur_availability
    WHERE booking_id = p_booking_id;

    /* --------------------------------------------------------
       SECTION 10 - RETURN AUDIT RECORD ID
    -------------------------------------------------------- */

    RETURN v_cancellation_id;

END;
$function$;

/* ------------------------------------------------------------
   SECTION 11 - RESTRICT FUNCTION EXECUTION
------------------------------------------------------------ */

REVOKE ALL ON FUNCTION public.cancel_booking(
    UUID, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_booking(
    UUID, TEXT, UUID, TEXT
) TO service_role;

COMMIT;