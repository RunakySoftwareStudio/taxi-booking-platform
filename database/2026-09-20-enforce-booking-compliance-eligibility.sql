/* ============================================================
   ENFORCE CHAUFFEUR COMPLIANCE DURING BOOKING ASSIGNMENT

   Updates the existing booking assignment RPC.

   Prevents new assignments and booking activation when the
   selected chauffeur does not meet compliance requirements.

   Preserves the existing booking and availability logic.
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

    /* ============================================================
    NEW CHAUFFEUR ASSIGNMENT - COMPLIANCE ELIGIBILITY

    Checks compliance when a chauffeur is assigned for the first
    time or replaces the previously assigned chauffeur.

    The chauffeur must have verified compliance and both required
    documents must be valid today and on the booking pickup date.

    Existing assignments are preserved during unrelated edits.
    Cancellation and rejection remain possible.
    ============================================================ */

    IF p_chauffeur_id IS NOT NULL
    AND p_status NOT IN ('cancelled', 'rejected')
    AND v_existing_chauffeur_id IS DISTINCT FROM p_chauffeur_id
    AND NOT public.is_chauffeur_compliance_eligible(p_chauffeur_id, v_pickup_date)
    THEN
        RAISE EXCEPTION
            'Chauffeur compliance is not valid for this booking pickup date.'
        USING ERRCODE = '22023';
    END IF;

    /* ============================================================
    BOOKING ACTIVATION - CHAUFFEUR COMPLIANCE

    Rechecks compliance when an existing booking becomes active,
    even if its chauffeur and pickup date have not changed.

    Covers pending, cancelled, rejected and completed bookings
    transitioning to accepted or confirmed.

    Unrelated edits and completion of existing journeys remain
    possible without triggering this check.

    ============================================================ */

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
    IF p_status IN ('accepted', 'confirmed', 'completed')
       AND v_end_at::DATE <> v_pickup_date THEN

        RAISE EXCEPTION
            'The calculated busy period crosses midnight.'
        USING ERRCODE = '22023';
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
       Pending, rejected and cancelled bookings do not create  a busy period.
    ----------------------------------------------------------- */
    IF p_status IN ('accepted', 'confirmed', 'completed') THEN

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
   ENFORCE COMPLIANCE WHEN THE BOOKING PICKUP DATE CHANGES

   Updates the existing Admin booking details RPC.

   Checks the assigned chauffeur's compliance when an Admin
   changes the pickup date of an active booking.

   Preserves unrelated administrative edits and existing
   booking management functionality.
============================================================ */
CREATE OR REPLACE FUNCTION public.update_booking_admin_details(
    p_booking_id UUID,
    p_client_name TEXT,
    p_client_email TEXT,
    p_client_phone TEXT,
    p_pickup_location TEXT,
    p_destination TEXT,
    p_pickup_date DATE,
    p_pickup_time TIME WITHOUT TIME ZONE,
    p_passengers INTEGER,
    p_luggage INTEGER,
    p_trip_type public.trip_type,
    p_notes TEXT,
    p_has_pets BOOLEAN,
    p_infant_seat_count_required INTEGER,
    p_child_seat_count_required INTEGER,
    p_booster_seat_count_required INTEGER,
    p_isofix_required BOOLEAN,
    p_wheelchair_requirement public.wheelchair_requirement_type,
    p_wheelchair_passenger_count INTEGER,
    p_mobility_aid_storage_required BOOLEAN,
    p_extra_large_luggage_required BOOLEAN,
    p_chauffeur_id UUID,
    p_vehicle_id UUID,
    p_status public.booking_status
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    /* ========================================================
       Stores the client ID belonging to the selected booking.

       v_ means that this is a local function variable.
    ======================================================== */
    v_client_id UUID;
    /* Stores the original assignment and pickup date before Admin edits the booking. */
    v_existing_chauffeur_id UUID;
    v_existing_pickup_date DATE;
BEGIN
    /* ========================================================
       SECTION 1: FIND AND LOCK THE BOOKING

       The booking contains the client_id that tells us which
       client record must be updated.

       INTO stores client_id inside v_client_id.

       FOR UPDATE locks the booking until this complete database
       transaction finishes. This prevents two admin changes from
       editing the same booking simultaneously.
    ======================================================== */

    /* Read and lock the existing booking before changing its assignment or pickup date. */
    SELECT client_id, chauffeur_id, pickup_date
    INTO v_client_id, v_existing_chauffeur_id, v_existing_pickup_date
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    /* ========================================================
       SECTION 2: CHECK THAT THE BOOKING EXISTS

       FOUND is a special PostgreSQL value.

       TRUE:
           the previous SELECT found a row.

       FALSE:
           the booking ID did not exist.

       RAISE EXCEPTION stops the function.
    ======================================================== */
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking was not found.'
        USING ERRCODE = 'P0002';
    END IF;

    /* ============================================================
    PICKUP DATE CHANGE - CHAUFFEUR COMPLIANCE

    When Admin changes the pickup date of an existing booking,
    the assigned chauffeur must remain eligible on the new date.

    New chauffeur assignments are checked separately by
    update_booking_admin_assignment.

    Unrelated edits, cancellation, rejection and completion
    remain possible without triggering this check.

    p_pickup_date IS DISTINCT FROM v_existing_pickup_date:
        PostgreSQL uses this to determine whether the requested pickup date differs from the original date.
    ============================================================ */

    IF p_chauffeur_id IS NOT NULL
    AND p_chauffeur_id = v_existing_chauffeur_id
    AND p_pickup_date IS DISTINCT FROM v_existing_pickup_date
    AND p_status IN ('pending', 'accepted', 'confirmed')
    AND NOT public.is_chauffeur_compliance_eligible(p_chauffeur_id, p_pickup_date)
    THEN
        RAISE EXCEPTION
            'Chauffeur compliance is not valid for this booking pickup date.'
        USING ERRCODE = '22023';
    END IF;

    /* ========================================================
       SECTION 3: UPDATE THE CLIENT

       The client_id stored in v_client_id identifies the client
       belonging to this booking.

       This preserves the current project behaviour: editing the
       client information updates the existing client record.
    ======================================================== */
    UPDATE public.clients
    SET
        name = p_client_name,
        email = p_client_email,
        phone = p_client_phone
    WHERE id = v_client_id;


    /* ========================================================
       SECTION 4: UPDATE THE BOOKING DETAILS

       This section updates trip information such as:

       - pickup and destination;
       - date and time;
       - passengers and luggage;
       - trip type;
       - notes;
       - pet information.

       Status, chauffeur_id and vehicle_id are not updated here.

       They are handled by update_booking_admin_assignment()
       because that function also manages the busy period.
    ======================================================== */
    UPDATE public.bookings
    SET
        pickup_location = p_pickup_location,
        destination = p_destination,
        pickup_date = p_pickup_date,
        pickup_time = p_pickup_time,
        passengers = p_passengers,
        luggage = p_luggage,
        trip_type = p_trip_type,
        notes = p_notes,
        has_pets = p_has_pets,
        infant_seat_count_required = p_infant_seat_count_required,
        child_seat_count_required = p_child_seat_count_required,
        booster_seat_count_required = p_booster_seat_count_required,
        isofix_required = p_isofix_required,
        wheelchair_requirement = p_wheelchair_requirement,
        wheelchair_passenger_count = p_wheelchair_passenger_count,
        mobility_aid_storage_required = p_mobility_aid_storage_required,
        extra_large_luggage_required = p_extra_large_luggage_required
    WHERE id = p_booking_id;


    /* ========================================================
       SECTION 5: UPDATE ASSIGNMENT AND BUSY PERIOD

       PERFORM calls a PostgreSQL function when we do not need
       a returned value.

       update_booking_admin_assignment() will:

       - remove the booking's previous busy period;
       - update chauffeur_id, vehicle_id and booking status;
       - calculate the busy-period end time;
       - create a new busy period for active statuses;
       - reject overlapping chauffeur bookings.

       Because this call runs inside the current function, it is
       part of the same transaction.
    ======================================================== */
    PERFORM public.update_booking_admin_assignment(
        p_booking_id,
        p_chauffeur_id,
        p_vehicle_id,
        p_status
    );


    /* ========================================================
       END OF FUNCTION

       RETURNS VOID means that no data object is returned.

       Successful completion means that the client, booking and
       chauffeur availability were all updated correctly.
    ======================================================== */
END;
$$;
