/* ============================================================
   VOYA TAXI - PROTECTED BOOKING COMPLETION

   Purpose:
   Complete eligible bookings and record:
   - Official completion timestamp.
   - Trusted completion source (admin/chauffeur/system).

   Requirements:
   - Preserve booking assignment and availability rules.
   - Prevent unauthorized completion and reopening.
   - Update status and completion metadata atomically.

   Deployment:
   Prepare and test before applying to Supabase.
   Do not update historical bookings.
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
BEGIN
    /* SECTION 1: Validate the requested completion source. */
    IF p_booking_id IS NULL OR
       p_completed_by IS NULL OR
       p_completed_by NOT IN ('admin', 'chauffeur', 'system') THEN
        RAISE EXCEPTION 'Invalid booking completion request.'
        USING ERRCODE = '22023';
    END IF;

    /* SECTION 2: Lock the booking to prevent concurrent updates. */
    SELECT status, chauffeur_id, vehicle_id
    INTO v_status, v_chauffeur_id, v_vehicle_id
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

/* ============================================================
   VOYA TAXI - PROTECT BOOKING COMPLETION METADATA

   Purpose:
   Ensure completed bookings have reliable completion metadata.
   Prevent ordinary updates from reopening completed bookings
   or changing previously recorded completion information.
============================================================ */

CREATE OR REPLACE FUNCTION public.protect_booking_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    /* SECTION 1: Protect already completed bookings. */
    IF OLD.status = 'completed' THEN

        /* Prevent completed bookings from being reopened. */
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'A completed booking cannot be reopened.'
            USING ERRCODE = '22023';
        END IF;

        /* Preserve the official completion timestamp and source. */
        IF NEW.completed_at IS DISTINCT FROM OLD.completed_at
           OR NEW.completed_by IS DISTINCT FROM OLD.completed_by THEN
            RAISE EXCEPTION 'Booking completion metadata cannot be changed.'
            USING ERRCODE = '22023';
        END IF;

        /* Preserve the historical chauffeur and vehicle assignment. */
        IF NEW.chauffeur_id IS DISTINCT FROM OLD.chauffeur_id
           OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN

            RAISE EXCEPTION
                'A completed booking assignment cannot be changed.'
            USING ERRCODE = '22023';

        END IF;

    END IF;

    /* SECTION 2: Validate new completion transitions. */
    IF OLD.status IS DISTINCT FROM 'completed'
       AND NEW.status = 'completed' THEN

        IF OLD.status NOT IN ('pending', 'accepted', 'confirmed') THEN
            RAISE EXCEPTION 'Invalid booking completion transition.'
            USING ERRCODE = '22023';
        END IF;

        IF NEW.chauffeur_id IS NULL OR NEW.vehicle_id IS NULL THEN
            RAISE EXCEPTION 'Booking completion requires a chauffeur and vehicle.'
            USING ERRCODE = '22023';
        END IF;

        IF NEW.completed_at IS NULL OR NEW.completed_by IS NULL THEN
            RAISE EXCEPTION 'Booking completion metadata is required.'
            USING ERRCODE = '22023';
        END IF;

    END IF;

    /* SECTION 3: Prevent completion metadata on active bookings. */
    IF NEW.status <> 'completed'
       AND (
           NEW.completed_at IS NOT NULL
           OR NEW.completed_by IS NOT NULL
       ) THEN

        RAISE EXCEPTION
            'Completion metadata is only allowed for completed bookings.'
        USING ERRCODE = '22023';

    END IF;

    RETURN NEW;
END;
$function$;

/* Run the completion guard before each booking update. */
CREATE TRIGGER protect_booking_completion
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.protect_booking_completion();
/*==============================================================
    End PROTECTED BOOKING COMPLETION
================================================================*/