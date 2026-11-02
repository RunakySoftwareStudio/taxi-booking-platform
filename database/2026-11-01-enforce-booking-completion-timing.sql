/* ============================================================
   VOYA TAXI - ENFORCE BOOKING COMPLETION TIMING

   Purpose:
   Prevent official booking completion before the scheduled
   journey end time.

   Requirements:
   - Use the timezone-aware pickup_at timestamp.
   - Include the estimated journey duration.
   - Reject bookings without a reliable pickup timestamp.
   - Preserve existing completion and assignment protections.

   Deployment:
   Replaces the previously deployed complete_booking() function.
   Does not modify historical booking records.
============================================================ */
/* ============================================================
   PROTECTED BOOKING COMPLETION

   Purpose:
   Mark an eligible assigned booking as completed and record
   its official completion timestamp and source atomically.

   Only trusted server operations may invoke this function.
============================================================ */

CREATE OR REPLACE FUNCTION public.complete_booking(
    p_booking_id UUID,
    p_completed_by TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_status public.booking_status;
    v_chauffeur_id UUID;
    v_vehicle_id UUID;
    /* Exact timezone-aware scheduled pickup timestamp. */
    v_pickup_at TIMESTAMPTZ;

    /* Estimated journey duration in minutes. */
    v_duration_minutes INTEGER;
BEGIN
    /* SECTION 1: Validate the requested completion source. */
    IF p_booking_id IS NULL OR
       p_completed_by IS NULL OR
       p_completed_by NOT IN ('admin', 'chauffeur', 'system') THEN
        RAISE EXCEPTION 'Invalid booking completion request.'
        USING ERRCODE = '22023';
    END IF;

    /* ============================================================
    SECTION 2: READ AND LOCK THE BOOKING

    Retrieve the current status, assigned chauffeur, vehicle,
    exact pickup timestamp and estimated journey duration.

    FOR UPDATE prevents concurrent booking changes while
    completion eligibility is being checked.
    ============================================================ */
    SELECT
        status,
        chauffeur_id,
        vehicle_id,
        pickup_at,
        estimated_duration_minutes
    INTO
        v_status,
        v_chauffeur_id,
        v_vehicle_id,
        v_pickup_at,
        v_duration_minutes
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking was not found.'
        USING ERRCODE = 'P0002';
    END IF;

    /* SECTION 3: Verify completion eligibility. */
    IF v_status NOT IN ('pending', 'accepted', 'confirmed') THEN
        RAISE EXCEPTION 'Booking cannot be completed from its current status.'
        USING ERRCODE = '22023';
    END IF;

    IF v_chauffeur_id IS NULL OR v_vehicle_id IS NULL THEN
        RAISE EXCEPTION 'Booking completion requires a chauffeur and vehicle.'
        USING ERRCODE = '22023';
    END IF;

    /* ============================================================
    SECTION 3A: VERIFY SCHEDULED JOURNEY END

    Manual completion requires a reliable pickup timestamp.
    The scheduled journey must have ended before completion.

    Historical bookings without pickup_at cannot be completed
    until their timestamp has been established reliably.
    ============================================================ */

    IF v_pickup_at IS NULL THEN
        RAISE EXCEPTION
            'Booking completion requires a valid pickup timestamp.'
        USING ERRCODE = '22023';
    END IF;

    IF v_duration_minutes IS NULL OR v_duration_minutes <= 0 THEN
        RAISE EXCEPTION
            'Booking completion requires a valid journey duration.'
        USING ERRCODE = '22023';
    END IF;

    IF NOW() < (
        v_pickup_at + make_interval(mins => v_duration_minutes)
    ) THEN
        RAISE EXCEPTION
            'The scheduled journey has not ended yet.'
        USING ERRCODE = '22023';
    END IF;

        /* SECTION 4: Record completion without modifying availability. */
        UPDATE public.bookings
        SET
            status = 'completed',
            completed_at = NOW(),
            completed_by = p_completed_by
        WHERE id = p_booking_id;

    END;
    $function$;

/* ============================================================
   SECURITY — PROTECTED BOOKING COMPLETION

   Only trusted server-side service-role operations may
   execute the booking completion function.
============================================================ */

REVOKE ALL ON FUNCTION public.complete_booking(
    UUID, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_booking(
    UUID, TEXT
) TO service_role;
