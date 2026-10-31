/* ============================================================
   VOYA TAXI - ATOMIC BOOKING CREATION WITH TIMEZONE
   Date: 2026-10-30

   Purpose:
   - Extend booking creation with timezone information.
   - Preserve atomic journey quote acceptance.
   - Replace the obsolete 23-parameter function.
   - Apply restricted execution permissions.

   Execute only after the corresponding application changes
   are ready for deployment.
============================================================ */

BEGIN;
    CREATE OR REPLACE FUNCTION public.create_booking_with_accepted_journey_quote(
        p_client_id UUID,
        p_journey_quote_id UUID,
        p_booking_data_fingerprint TEXT,

        p_pickup_location TEXT,
        p_pickup_city TEXT,
        p_destination TEXT,
        p_destination_city TEXT,

        /* Pickup timezone and exact UTC timestamp.
        Calculated from the verified geographic pickup location. */
        p_pickup_date DATE,
        p_pickup_time TIME,
        p_pickup_timezone TEXT,
        p_pickup_at TIMESTAMPTZ,
        p_estimated_duration_minutes INTEGER,

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
        p_extra_large_luggage_required BOOLEAN
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
        -- declares a PostgreSQL variable that can hold one complete row from the journey_quotes table.
        -- Give this variable v_quote, the same structure as one complete row of this table, journey_quotes.
        v_quote public.journey_quotes%ROWTYPE;
        v_booking_id UUID;

        -- One timestamp will be used for the complete acceptance.
        -- This means used_at and accepted_at receive exactly the same database timestamp.
        v_accepted_at TIMESTAMPTZ;

    BEGIN

        /*
            STEP 1: LOCK THE JOURNEY QUOTE

            FOR UPDATE means:
            "I am working with this quote now. Another transaction must wait before changing it."
            This is important because two browser requests could theoretically arrive almost at the same moment.
        */
        SELECT *
        INTO v_quote
        FROM public.journey_quotes
        WHERE quote_id = p_journey_quote_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Journey quote does not exist.';
        END IF;

        /*
            Record the actual time after the quote lock has been acquired.
            clock_timestamp() gives the current real database time, including any time spent waiting for the lock.
        */
        v_accepted_at := clock_timestamp();

        /*
            A quote without a fingerprint belongs to the older
            temporary quote format and must not be accepted through
            this secure booking workflow.

            stored fingerprint missing?  â†’ reject
            incoming fingerprint missing? â†’ reject
            fingerprints different?       â†’ reject
            same valid fingerprint?       â†’ continue
        */
        IF v_quote.booking_data_fingerprint IS NULL
            OR LENGTH(TRIM(v_quote.booking_data_fingerprint)) = 0
        THEN
            RAISE EXCEPTION 'Journey quote does not contain a valid booking fingerprint.';
        END IF;

        IF p_booking_data_fingerprint IS NULL
            OR LENGTH(TRIM(p_booking_data_fingerprint)) = 0
        THEN
            RAISE EXCEPTION 'Booking fingerprint is required.';
        END IF;

        /*
            STEP 2: VERIFY THE FINGERPRINT
            The stored quote fingerprint must represent exactly the same pricing journey as the confirmed booking.
        */
        IF v_quote.booking_data_fingerprint
            IS DISTINCT FROM p_booking_data_fingerprint
        THEN
            RAISE EXCEPTION 'Journey quote does not match this booking.';
        END IF;


        /*
            STEP 3: VERIFY THE QUOTE LIFECYCLE
            Only an active, unused and unexpired quote can create a booking.
        */
        IF v_quote.status <> 'active' THEN
            RAISE EXCEPTION 'Journey quote is no longer active.';
        END IF;

        IF v_quote.expires_at <= v_accepted_at THEN
            RAISE EXCEPTION 'Journey quote has expired.';
        END IF;

        IF v_quote.used_at IS NOT NULL
            OR v_quote.accepted_at IS NOT NULL
        THEN
            RAISE EXCEPTION 'Journey quote has already been used.';
        END IF;

        /* ============================================================
        STEP 3A: VALIDATE BOOKING PICKUP TIMEZONE

        Purpose:
        - Require a valid IANA timezone.
        - Verify that pickup_at matches the local pickup date/time.
        - Reject inconsistent timestamps before creating the booking.

        The application separately checks ambiguous and nonexistent
        local times before calling this function.
        ============================================================ */

        IF p_pickup_timezone IS NULL
            OR NULLIF(BTRIM(p_pickup_timezone), '') IS NULL
            OR NOT EXISTS (
                SELECT 1
                FROM pg_timezone_names
                WHERE name = p_pickup_timezone
            )
        THEN
            RAISE EXCEPTION 'Invalid booking pickup timezone.'
            USING ERRCODE = '22023';
        END IF;

        IF p_pickup_at IS NULL
            OR (p_pickup_at AT TIME ZONE p_pickup_timezone)
                IS DISTINCT FROM (p_pickup_date + p_pickup_time)
        THEN
            RAISE EXCEPTION 'Booking pickup timestamp does not match its local date and time.'
            USING ERRCODE = '22023';
        END IF;

        /*
            STEP 4: CREATE THE BOOKING

            The booking is linked directly to the exact journey quote that the customer accepted.
            The booking starts as pending because no chauffeur or vehicle has been assigned yet.
        */
        INSERT INTO public.bookings (
            client_id,
            chauffeur_id,
            vehicle_id,
            journey_quote_id,

            pickup_location,
            pickup_city,
            destination,
            destination_city,
            /* Store the pickup's local date, time and exact UTC instant. */
            pickup_date,
            pickup_time,
            pickup_timezone,
            pickup_at,
            estimated_duration_minutes,

            passengers,
            luggage,
            trip_type,
            notes,
            status,
            has_pets,

            infant_seat_count_required,
            child_seat_count_required,
            booster_seat_count_required,
            isofix_required,

            wheelchair_requirement,
            wheelchair_passenger_count,
            mobility_aid_storage_required,
            extra_large_luggage_required
        )
        VALUES (
            p_client_id,
            NULL,
            NULL,
            p_journey_quote_id,

            p_pickup_location,
            p_pickup_city,
            p_destination,
            p_destination_city,
            /* Save the timezone information in the same atomic transaction. */
            p_pickup_date,
            p_pickup_time,
            p_pickup_timezone,
            p_pickup_at,
            p_estimated_duration_minutes,

            p_passengers,
            p_luggage,
            p_trip_type,
            p_notes,
            'pending',
            p_has_pets,

            p_infant_seat_count_required,
            p_child_seat_count_required,
            p_booster_seat_count_required,
            p_isofix_required,

            p_wheelchair_requirement,
            p_wheelchair_passenger_count,
            p_mobility_aid_storage_required,
            p_extra_large_luggage_required
        )
        RETURNING id INTO v_booking_id;

        /*
            STEP 5: ACCEPT THE LOCKED JOURNEY QUOTE

            The booking has now been created successfully.
            We permanently mark the quote as accepted and record exactly when it was accepted and used.
            The same timestamp is deliberately used for both fields.
        */
        UPDATE public.journey_quotes
        SET
            status = 'accepted',
            used_at = v_accepted_at,
            accepted_at = v_accepted_at
        WHERE quote_id = p_journey_quote_id;


        /*
            STEP 6: RETURN THE NEW BOOKING ID
            The API will receive this UUID after PostgreSQL has successfully completed the whole operation.
        */
        RETURN v_booking_id;

    END;
    $$;

    /*
        ================================================================
        ATOMIC QUOTE ACCEPTANCE

        lock quote
            â†“
        verify fingerprint
            â†“
        verify active / unexpired / unused
            â†“
        insert booking
            â†“
        store journey_quote_id on booking
            â†“
        update quote:
            status = accepted
            used_at = acceptance timestamp
            accepted_at = acceptance timestamp
            â†“
        return booking ID

        ================================================================
        SECURITY

        Public browser/database users must never call this financial
        function directly.

        Only the server-side service role may execute it.

        PUBLIC          -> no access
        anon            -> no access
        authenticated   -> no access
        service_role    -> EXECUTE
        ================================================================
    */
    REVOKE ALL -- explicitly remove permissions from Supabase's public, anon and authenticated roles.
    ON FUNCTION public.create_booking_with_accepted_journey_quote(
        UUID,
        UUID,
        TEXT,
        TEXT,
        TEXT,
        TEXT,
        TEXT,
        DATE,
        TIME,
        TEXT,        -- p_pickup_timezone
        TIMESTAMPTZ, -- p_pickup_at
        INTEGER,
        INTEGER,
        INTEGER,
        public.trip_type,
        TEXT,
        BOOLEAN,
        INTEGER,
        INTEGER,
        INTEGER,
        BOOLEAN,
        public.wheelchair_requirement_type,
        INTEGER,
        BOOLEAN,
        BOOLEAN
    )
    FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE
    ON FUNCTION public.create_booking_with_accepted_journey_quote(
        UUID,
        UUID,
        TEXT,
        TEXT,
        TEXT,
        TEXT,
        TEXT,
        DATE,
        TIME,
        TEXT,        -- p_pickup_timezone
        TIMESTAMPTZ, -- p_pickup_at
        INTEGER,
        INTEGER,
        INTEGER,
        public.trip_type,
        TEXT,
        BOOLEAN,
        INTEGER,
        INTEGER,
        INTEGER,
        BOOLEAN,
        public.wheelchair_requirement_type,
        INTEGER,
        BOOLEAN,
        BOOLEAN
    )
    TO service_role;
    /*================================================================
    END: ATOMIC BOOKING + JOURNEY QUOTE ACCEPTANCE
    ================================================================*/
    /* ============================================================
    MIGRATION COMPLETED

    The new 25-parameter booking creation function is installed.
    The old 23-parameter function remains temporarily available.

    Remove the old signature in a separate migration after
    verifying that all application callers use the new function.
    ============================================================ */

COMMIT;
