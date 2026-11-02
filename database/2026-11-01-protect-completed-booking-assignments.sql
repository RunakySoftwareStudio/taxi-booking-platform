/* ============================================================
   VOYA TAXI - PROTECT COMPLETED BOOKING ASSIGNMENTS

   Purpose:
   Prevent the existing assignment RPC from modifying
   completed bookings or recreating historical busy periods.

   Preserve all existing assignment, compliance and
   chauffeur availability validations.

   Apply after booking completion metadata and protection.
============================================================ */
CREATE OR REPLACE FUNCTION public.update_booking_admin_assignment(
    p_booking_id UUID,
    p_chauffeur_id UUID,
    p_vehicle_id UUID,
    p_status public.booking_status
)
/*-------------------------------
    RETURNS VOID
    it does not return booking data. We mainly inspect whether an error occurred:
    const { error } = await supabaseAdmin.rpc(...);
    When successful:error = null
--------------------------------*/
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    /* -----------------------------------------------------------
       LOCAL VARIABLES
       These variables temporarily store information belonging
       to the selected booking.
       v_ means "variable".
       They exist only while this function is running.
    -----------------------------------------------------------*/

    /* Stores the chauffeur assigned before the booking is updated.
    Used to distinguish a new assignment from an existing one. */
    v_existing_chauffeur_id UUID;
    /* Stores the booking status before the requested update.
    Used to detect when an existing booking becomes active. */
    v_existing_status public.booking_status;
    -- Stores the booking pickup date.
    v_pickup_date DATE;
    -- Stores the booking pickup time.
    v_pickup_time TIME WITHOUT TIME ZONE;
    -- Stores the Mapbox-calculated journey duration.
    v_duration_minutes INTEGER;
    -- Stores the calculated complete end date and time.
    v_end_at TIMESTAMP WITHOUT TIME ZONE;

BEGIN
    /* -----------------------------------------------------------
       SECTION 1: READ AND LOCK THE BOOKING
       SELECT reads the booking information from public.bookings.
       INTO places the selected database values inside the local
       variables declared above.
       FOR UPDATE locks this booking row until the transaction  finishes.
       This prevents two admin actions from changing the same  booking simultaneously.
    ----------------------------------------------------------- */

    /* Read and lock the existing booking, including its current status.
    The original status allows us to detect booking reactivation. */
    SELECT
        chauffeur_id,
        status,
        pickup_date,
        pickup_time,
        estimated_duration_minutes
    INTO
        v_existing_chauffeur_id,
        v_existing_status,
        v_pickup_date,
        v_pickup_time,
        v_duration_minutes
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    /* -----------------------------------------------------------
       SECTION 2: CHECK THAT THE BOOKING EXISTS
       FOUND is a special PostgreSQL variable.
       FOUND is TRUE when the previous SELECT found a booking.
       FOUND is FALSE when no booking matched p_booking_id.
       RAISE EXCEPTION stops the function immediately.
       P0002 means that requested data was not found.
    ----------------------------------------------------------- */
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking was not found.'
        USING ERRCODE = 'P0002';
    END IF;

    /* -----------------------------------------------------------
    PROTECT COMPLETED BOOKINGS

    Completed bookings preserve their historical assignment
    and linked chauffeur busy interval.

    Ordinary assignment updates must not recreate or modify
    their availability history.
    ----------------------------------------------------------- */
    IF v_existing_status = 'completed' THEN
        RAISE EXCEPTION
            'A completed booking cannot be modified through the assignment operation.'
        USING ERRCODE = '22023';
    END IF;

    /* -----------------------------------------------------------
    CHAUFFEUR SCHEDULE LOCK - BOOKING ASSIGNMENT

    Coordinates booking changes involving the previous and
    newly assigned chauffeur.

    Locks both schedules in consistent UUID order to reduce
    the risk of concurrent assignment conflicts.

    The locks remain active until the transaction finishes.
    ----------------------------------------------------------- */
    PERFORM public.lock_chauffeur_schedule_pair(
        v_existing_chauffeur_id,
        p_chauffeur_id
    );

    /* -----------------------------------------------------------
       SECTION 3: REQUIRE A CHAUFFEUR FOR ACTIVE BOOKINGS
       An accepted, confirmed or completed booking must have an  assigned chauffeur.
       IN checks whether p_status matches one of the listed booking statuses.
       IS NULL checks whether no chauffeur was supplied.
       Both conditions must be TRUE before the exception occurs:
       active booking status  AND no assigned chauffeur
    ----------------------------------------------------------- */
    IF p_status IN ('accepted', 'confirmed', 'completed')
        AND (p_chauffeur_id IS NULL OR p_vehicle_id IS NULL) THEN
        RAISE EXCEPTION
            'An accepted, confirmed or completed booking requires a chauffeur and vehicle.'
        USING ERRCODE = '22023';
    END IF;

    /* The selected vehicle must belong to the selected chauffeur. */
    IF p_vehicle_id IS NOT NULL
    AND (
        p_chauffeur_id IS NULL
        OR NOT EXISTS (
            SELECT 1
            FROM public.vehicles
            WHERE id = p_vehicle_id
                AND chauffeur_id = p_chauffeur_id
        )
    ) THEN
        RAISE EXCEPTION 'The selected vehicle does not belong to the chauffeur.'
        USING ERRCODE = '22023';
    END IF;

    /* -----------------------------------------------------------
    NEW CHAUFFEUR ASSIGNMENT - COMPLIANCE ELIGIBILITY

    Checks compliance when a chauffeur is assigned for the first
    time or replaces the previously assigned chauffeur.

    The chauffeur must have verified compliance and both required
    documents must be valid today and on the booking pickup date.

    Existing assignments are preserved during unrelated edits.
    Cancellation and rejection remain possible.
    ----------------------------------------------------------- */

    IF p_chauffeur_id IS NOT NULL
    AND p_status NOT IN ('cancelled', 'rejected')
    AND v_existing_chauffeur_id IS DISTINCT FROM p_chauffeur_id
    AND NOT public.is_chauffeur_compliance_eligible(p_chauffeur_id, v_pickup_date)
    THEN
        RAISE EXCEPTION
            'Chauffeur compliance is not valid for this booking pickup date.'
        USING ERRCODE = '22023';
    END IF;

    /* -----------------------------------------------------------
    BOOKING ACTIVATION - CHAUFFEUR COMPLIANCE

    Rechecks compliance when an existing booking becomes active,
    even if its chauffeur and pickup date have not changed.

    Covers pending, cancelled, rejected and completed bookings
    transitioning to accepted or confirmed.

    Unrelated edits and completion of existing journeys remain
    possible without triggering this check.

    ----------------------------------------------------------- */

    IF p_chauffeur_id IS NOT NULL
    AND p_status IN ('accepted', 'confirmed')
    AND v_existing_status NOT IN ('accepted', 'confirmed')
    AND NOT public.is_chauffeur_compliance_eligible(p_chauffeur_id, v_pickup_date)
    THEN
        RAISE EXCEPTION
            'Chauffeur compliance is not valid for this booking pickup date.'
        USING ERRCODE = '22023';
    END IF;

    /* -----------------------------------------------------------
       SECTION 4: CALCULATE THE JOURNEY END TIME

       First PostgreSQL combines:
           pickup date + pickup time
       Example:
           2026-07-20 + 14:00  becomes  2026-07-20 14:00
       make_interval creates a time interval from the calculated journey duration.
       Example:
           duration = 51 minutes
           2026-07-20 14:00 + 51 minutes
           becomes
           2026-07-20 14:51
    ----------------------------------------------------------- */
    v_end_at :=
        v_pickup_date
        + v_pickup_time
        + make_interval(mins => v_duration_minutes);

    /* -----------------------------------------------------------
       SECTION 5: PREVENT AN OVERNIGHT BUSY PERIOD
       The current chauffeur_availability table stores:
           one available_date
           one start_time
           one end_time
       It cannot yet correctly represent a period such as:  2026-07-20 23:30  until    2026-07-21 00:30
       v_end_at::DATE extracts only the date from the calculated  end timestamp.
       When the end date differs from the pickup date, the journey crosses midnight.
       For now, the function stops instead of saving incorrect  availability information.
    ----------------------------------------------------------- */
    /* Prevent overnight intervals for every assigned, reserving booking. */
    IF p_chauffeur_id IS NOT NULL
    AND p_status NOT IN ('cancelled', 'rejected')
    AND v_end_at::DATE <> v_pickup_date THEN

        RAISE EXCEPTION
            'The calculated busy period crosses midnight.'
        USING ERRCODE = '22023';
    END IF;

    /* -----------------------------------------------------------
    CHAUFFEUR UNAVAILABILITY CHECK - BOOKING ASSIGNMENT

    Prevents new assignments and booking reactivations from
    overlapping offline or holiday periods.

    Existing assignments and booking completions are preserved.
    Manual busy overlaps remain protected by the existing
    PostgreSQL exclusion constraint.
    ----------------------------------------------------------- */
    /* Check availability whenever a new reservation is created or reactivated. */
    IF p_chauffeur_id IS NOT NULL
    AND p_status NOT IN ('cancelled', 'rejected')
    AND (
        v_existing_chauffeur_id IS DISTINCT FROM p_chauffeur_id
        OR v_existing_status IN ('cancelled', 'rejected')
    )
    AND EXISTS (
        SELECT 1
        FROM public.chauffeur_availability AS a
        WHERE a.chauffeur_id = p_chauffeur_id
            AND a.available_date = v_pickup_date
            AND a.booking_id IS NULL
            AND a.status IN ('offline', 'holiday')
            AND a.start_time < v_end_at::TIME
            AND a.end_time > v_pickup_time
    )
    THEN
        RAISE EXCEPTION
            'Chauffeur is unavailable during this booking.'
        USING ERRCODE = '23P01';
    END IF;

    /* -----------------------------------------------------------
       SECTION 6: REMOVE THE OLD LINKED BUSY PERIOD
       A booking may already have a busy-period record.
       This can happen when:
       - the admin changes the chauffeur
       - the booking status changes
       - the assignment is saved again

       The booking_id column links the availability record to
       its booking.
       Removing the old record prevents duplicate busy periods.
       Important:
       Because this function runs inside one transaction, the
       deleted record is automatically restored when a later
       command fails.
    ----------------------------------------------------------- */
    DELETE FROM public.chauffeur_availability
    WHERE booking_id = p_booking_id;

    /* -----------------------------------------------------------
       SECTION 7: UPDATE THE BOOKING
       This changes two columns in public.bookings:
       chauffeur_id:
           the selected chauffeur, or NULL when unassigned
       status:
           the selected booking status
       WHERE ensures that only the requested booking is updated.
    ----------------------------------------------------------- */
    UPDATE public.bookings
    SET
        chauffeur_id = p_chauffeur_id,
        vehicle_id = p_vehicle_id,
        status = p_status
    WHERE id = p_booking_id;

    /* -----------------------------------------------------------
       SECTION 8: CREATE A NEW BUSY PERIOD
       Only active booking statuses create a busy period:
       - accepted
       - confirmed
       - completed
       Assigned pending, accepted, confirmed and completed bookings
        create a busy period. Cancelled and rejected bookings do not.
    ----------------------------------------------------------- */
        /* Every assigned, non-cancelled booking reserves chauffeur time. */
        IF p_chauffeur_id IS NOT NULL
            AND p_status NOT IN ('cancelled', 'rejected') THEN

        /* -----------------------------------------------------------
           INSERT creates a new chauffeur_availability record.
           chauffeur_id:
               chauffeur assigned to the booking
           available_date:
               booking pickup date
           start_time:
               booking pickup time
           end_time:
               calculated journey end time
           status:
               busy
           booking_id:
               links this availability record to the booking
        ----------------------------------------------------------- */
        INSERT INTO public.chauffeur_availability (
            chauffeur_id,
            available_date,
            start_time,
            end_time,
            status,
            booking_id
        )
        VALUES (
            p_chauffeur_id,
            v_pickup_date,
            v_pickup_time,

            -- ::TIME removes the date and keeps only the time.
            v_end_at::TIME,

            'busy',
            p_booking_id
        );

    END IF;

    /* -----------------------------------------------------------
       END OF FUNCTION
       No RETURN value is required because the function uses:
           RETURNS VOID
       Successful completion means that both the booking and its
       linked busy period were updated correctly.
    ----------------------------------------------------------- */
END;
$$;

/* ============================================================
   SECURITY - ADMIN BOOKING ASSIGNMENT

   Only the trusted service_role may execute this function.
============================================================ */

REVOKE ALL ON FUNCTION public.update_booking_admin_assignment(
    UUID, UUID, UUID, public.booking_status
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_booking_admin_assignment(
    UUID, UUID, UUID, public.booking_status
) TO service_role;
