/* ============================================================
   VOYA TAXI — AUTOMATIC COMMISSION GENERATION

   Purpose:
   Automatically generate frozen chauffeur commissions
   when financially eligible bookings are completed.

   Record calculation failures for later financial review
   without reversing a valid booking completion.
============================================================ */

BEGIN;

/* SECTION 1: Track commission generation failures. */
CREATE TABLE public.chauffeur_commission_generation_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    booking_id UUID NOT NULL
        REFERENCES public.bookings(id) ON DELETE RESTRICT,

    error_code TEXT NOT NULL,
    error_message TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ NULL,

    CONSTRAINT chauffeur_commission_failure_unique_booking
        UNIQUE (booking_id),

    CONSTRAINT chauffeur_commission_failure_message_required
        CHECK (LENGTH(TRIM(error_message)) > 0)
);

/* Explain the purpose of the table. */
COMMENT ON TABLE public.chauffeur_commission_generation_failures IS
'Records failed automatic commission generation attempts for completed bookings requiring financial review.';

/* SECTION 2: Protect commission failure records. */
ALTER TABLE public.chauffeur_commission_generation_failures
ENABLE ROW LEVEL SECURITY;

/* Block direct access from ordinary application users. */
REVOKE ALL ON TABLE public.chauffeur_commission_generation_failures
FROM PUBLIC, anon, authenticated;

/* Allow the trusted server to create and read failure records. */
GRANT SELECT, INSERT, UPDATE
ON TABLE public.chauffeur_commission_generation_failures
TO service_role;

/* Preserve financial failure history against deletion. */
REVOKE DELETE, TRUNCATE
ON TABLE public.chauffeur_commission_generation_failures
FROM service_role;

/*
   SECTION 3 — AUTOMATIC COMMISSION PROCESSING

   Generate frozen commissions for completed bookings.
   Financial calculation failures will be recorded separately.
*/

CREATE OR REPLACE FUNCTION public.process_completed_booking_commission(
    p_booking_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_excluded BOOLEAN;
    v_commission_id UUID;
    v_error_code TEXT;
    v_error_message TEXT;
BEGIN
    /* SECTION 3A: Check whether the booking is financially excluded. */
    SELECT is_financially_excluded
    INTO v_excluded
    FROM public.bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found.'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_excluded THEN
        RETURN;
    END IF;

    /*
        SECTION 3B: Generate and freeze the commission.

        Reuse the existing protected calculation function.
        If generation fails, preserve booking completion.
    */
    BEGIN
        v_commission_id := public.generate_chauffeur_booking_commission(p_booking_id);

        /* Mark an earlier calculation failure as resolved. */
        UPDATE public.chauffeur_commission_generation_failures
        SET resolved_at = NOW()
        WHERE booking_id = p_booking_id
          AND resolved_at IS NULL;

    /* Record expected financial validation failures only. */
    EXCEPTION
        WHEN SQLSTATE '22023' OR SQLSTATE '23514' THEN
        GET STACKED DIAGNOSTICS
            v_error_code = RETURNED_SQLSTATE,
            v_error_message = MESSAGE_TEXT;

        /* Record the error for later financial review. */
        INSERT INTO public.chauffeur_commission_generation_failures (
            booking_id,
            error_code,
            error_message
        )
        VALUES (
            p_booking_id,
            v_error_code,
            v_error_message
        )
        ON CONFLICT (booking_id)
        DO UPDATE SET
            error_code = EXCLUDED.error_code,
            error_message = EXCLUDED.error_message,
            resolved_at = NULL;
    END;

END;
$function$;

/* SECTION 4: Restrict automatic commission processing to trusted operations. */
REVOKE ALL ON FUNCTION public.process_completed_booking_commission(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_completed_booking_commission(UUID)
TO service_role;

/*
   SECTION 5 — AUTOMATIC COMMISSION GENERATION ON COMPLETION

   Preserve the existing booking completion rules.
   Generate a frozen commission after successful completion.
*/
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

        UPDATE public.bookings
        SET
            status = 'completed',
            completed_at = NOW(),
            completed_by = p_completed_by
        WHERE id = p_booking_id;

        /* SECTION 5A: Automatically process the chauffeur commission. */
        PERFORM public.process_completed_booking_commission(p_booking_id);

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

/* Complete the automatic commission generation migration. */
COMMIT;
