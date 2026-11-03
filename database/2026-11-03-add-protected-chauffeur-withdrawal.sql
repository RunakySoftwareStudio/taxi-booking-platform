/*
    PROTECTED CHAUFFEUR BOOKING WITHDRAWAL

    Purpose:
    Allow an assigned chauffeur to withdraw before the
    scheduled journey end.

    The customer's booking is not cancelled.

    Security:
    Only service_role may execute this function.
    The application must authenticate the chauffeur and
    verify their identity before calling this RPC.
*/

CREATE OR REPLACE FUNCTION public.withdraw_chauffeur_booking(
    p_booking_id UUID,
    p_chauffeur_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_chauffeur_id UUID;
    v_status public.booking_status;
    v_pickup_at TIMESTAMPTZ;
    v_duration_minutes INTEGER;
BEGIN

    /* SECTION 1 — Lock and read the existing booking. */
    SELECT
        chauffeur_id,
        status,
        pickup_at,
        estimated_duration_minutes
    INTO
        v_chauffeur_id,
        v_status,
        v_pickup_at,
        v_duration_minutes
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking was not found.'
        USING ERRCODE = 'P0002';
    END IF;

    /* SECTION 2 — Verify the existing chauffeur assignment. */
    IF p_chauffeur_id IS NULL
       OR v_chauffeur_id IS DISTINCT FROM p_chauffeur_id THEN

        RAISE EXCEPTION
            'Booking is not assigned to this chauffeur.'
        USING ERRCODE = '22023';
    END IF;

    /* SECTION 3 — Protect terminal booking statuses. */
    IF v_status NOT IN ('pending', 'accepted', 'confirmed') THEN
        RAISE EXCEPTION
            'This booking is not eligible for chauffeur withdrawal.'
        USING ERRCODE = '22023';
    END IF;

    /* SECTION 4 — Require an exact pickup timestamp. */
    IF v_pickup_at IS NULL OR v_duration_minutes IS NULL THEN
        RAISE EXCEPTION
            'Chauffeur withdrawal requires a valid pickup timestamp.'
        USING ERRCODE = '22023';
    END IF;

    /*
        SECTION 5 — Enforce the withdrawal deadline.

        Withdrawal is permitted strictly before the
        scheduled journey end, never at or after it.
    */
    IF NOW() >= (
        v_pickup_at + make_interval(mins => v_duration_minutes)
    ) THEN

        RAISE EXCEPTION
            'The scheduled journey has ended. Withdrawal is no longer allowed.'
        USING ERRCODE = '22023';
    END IF;

    /*
        SECTION 6 — Release the assignment atomically.

        Reuse the protected assignment function to:
        - Unassign the chauffeur and vehicle.
        - Return the booking to pending.
        - Release the linked busy interval.
        - Preserve existing schedule-lock protections.

        Both function calls participate in one transaction.
    */
    PERFORM public.update_booking_admin_assignment(
        p_booking_id,
        NULL::UUID,
        NULL::UUID,
        'pending'::public.booking_status
    );

END;
$function$;

/* SECTION 7 — Restrict RPC execution to service_role. */
REVOKE ALL ON FUNCTION public.withdraw_chauffeur_booking(UUID, UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.withdraw_chauffeur_booking(UUID, UUID)
TO service_role;