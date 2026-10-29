/* ============================================================
   VOYA TAXI - ATOMIC DATABASE MIGRATION

   Ensures that all database changes are applied together.
   If any statement fails, the transaction is rolled back.
============================================================ */
BEGIN;
/* ============================================================
   VOYA TAXI — CHAUFFEUR SCHEDULE TRANSACTION LOCK

   Purpose:
   Coordinates database transactions that modify a chauffeur's
   bookings or unavailable periods.

   Operations for the same chauffeur use the same lock.
   Operations for different chauffeurs can proceed independently.

   The lock is automatically released when the database transaction finishes.

   IMPORTANT:
   Every scheduling write must acquire this lock before
   performing conflict-sensitive reads or row modifications.

   Note:
   pg_advisory_xact_lock() makes a second transaction wait when another transaction is already modifying the same chauffeur's schedule.
   For example, if Admin is assigning a booking while the chauffeur is registering vacation,
   the operations must be coordinated so both cannot independently conclude that the period is free.
============================================================ */

CREATE OR REPLACE FUNCTION public.lock_chauffeur_schedule(
    p_chauffeur_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_chauffeur_id IS NULL THEN
        RAISE EXCEPTION 'Chauffeur ID is required for schedule locking.'
        USING ERRCODE = '22023';
    END IF;

    /* Use a separate advisory-lock namespace for chauffeur schedules. */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'chauffeur_schedule|' || p_chauffeur_id::TEXT,
            0
        )
    );
END;
$$;

/* Only the trusted server role may call this helper through the API. */
REVOKE ALL ON FUNCTION public.lock_chauffeur_schedule(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lock_chauffeur_schedule(UUID)
TO service_role;

/* ============================================================
   VOYA TAXI - LOCK TWO CHAUFFEUR SCHEDULES

   Purpose:
   Coordinates reassignment of a booking between chauffeurs.

   Locks chauffeur schedules in a consistent UUID order,
   regardless of which chauffeur is the previous assignment.

   NULL values represent an unassigned booking and are skipped.
============================================================ */

CREATE OR REPLACE FUNCTION public.lock_chauffeur_schedule_pair(
    p_previous_chauffeur_id UUID,
    p_new_chauffeur_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    /* No locks are needed when both chauffeurs are NULL. */
    IF p_previous_chauffeur_id IS NULL
       AND p_new_chauffeur_id IS NULL THEN
        RETURN;
    END IF;

    /* Avoid acquiring the same lock twice. */
    IF p_previous_chauffeur_id IS NULL
       OR p_previous_chauffeur_id = p_new_chauffeur_id THEN

        PERFORM public.lock_chauffeur_schedule(p_new_chauffeur_id);

    ELSIF p_new_chauffeur_id IS NULL THEN

        PERFORM public.lock_chauffeur_schedule(p_previous_chauffeur_id);

    /* Always acquire the smaller UUID first. */
    ELSIF p_previous_chauffeur_id < p_new_chauffeur_id THEN

        PERFORM public.lock_chauffeur_schedule(p_previous_chauffeur_id);
        PERFORM public.lock_chauffeur_schedule(p_new_chauffeur_id);

    ELSE

        PERFORM public.lock_chauffeur_schedule(p_new_chauffeur_id);
        PERFORM public.lock_chauffeur_schedule(p_previous_chauffeur_id);

    END IF;
END;
$$;

/* Restrict direct execution to the trusted server role. */
REVOKE ALL ON FUNCTION public.lock_chauffeur_schedule_pair(UUID, UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lock_chauffeur_schedule_pair(UUID, UUID)
TO service_role;
/* ============================================================
   VOYA TAXI — VALIDATE CHAUFFEUR SCHEDULE CONFLICTS

   Purpose:
   Prevents conflicts between booking-generated busy periods
   and manually registered unavailable periods.

   Rules:
   - A manual busy, offline or holiday period must not
     overlap an existing booking-generated busy period.
   - A booking-generated busy period must not overlap a
     manually registered busy, offline or holiday period.
   - Manual offline and holiday periods may overlap.
   - An available period does not block bookings.

   The existing exclusion constraint continues to prevent
   overlapping busy periods.
============================================================ */

CREATE OR REPLACE FUNCTION public.validate_chauffeur_schedule_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    /* ========================================================
       SECTION 1: MANUALLY REGISTERED UNAVAILABILITY

       Reject a manual blocking period if an existing
       booking-generated busy period overlaps its time range.
    ======================================================== */
    IF NEW.booking_id IS NULL
       AND NEW.status IN ('busy', 'offline', 'holiday')
       AND EXISTS (
           SELECT 1
           FROM public.chauffeur_availability AS a
           WHERE a.chauffeur_id = NEW.chauffeur_id
             AND a.available_date = NEW.available_date
             AND a.booking_id IS NOT NULL
             AND a.status = 'busy'
             AND a.id IS DISTINCT FROM NEW.id
             AND a.start_time < NEW.end_time
             AND a.end_time > NEW.start_time
       )
    THEN
        RAISE EXCEPTION
            'This unavailable period overlaps an existing booking.'
        USING ERRCODE = '23P01';
    END IF;

    /* ========================================================
       SECTION 2: BOOKING-GENERATED BUSY PERIOD

       Reject a booking's busy period if it overlaps manual
       busy, offline or holiday periods for the chauffeur.
    ======================================================== */
    IF NEW.booking_id IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM public.chauffeur_availability AS a
           WHERE a.chauffeur_id = NEW.chauffeur_id
             AND a.available_date = NEW.available_date
             AND a.booking_id IS NULL
             AND a.status IN ('busy', 'offline', 'holiday')
             AND a.id IS DISTINCT FROM NEW.id
             AND a.start_time < NEW.end_time
             AND a.end_time > NEW.start_time
       )
    THEN
        RAISE EXCEPTION
            'Booking conflicts with chauffeur unavailability.'
        USING ERRCODE = '23P01';
    END IF;

    /* Allow PostgreSQL to continue inserting or updating. */
    RETURN NEW;
END;
$$;

/* ============================================================
   VOYA TAXI — CHAUFFEUR SCHEDULE VALIDATION TRIGGER

   Purpose:
   Automatically checks scheduling conflicts whenever an
   availability record is inserted or updated.

   Covers:
   - Admin availability Add/Edit
   - Chauffeur availability Add/Edit
   - Booking-generated busy periods

   The existing updated_at trigger and busy overlap
   constraint remain unchanged.
============================================================ */

CREATE TRIGGER validate_chauffeur_schedule_before_write
BEFORE INSERT OR UPDATE
ON public.chauffeur_availability
FOR EACH ROW
EXECUTE FUNCTION public.validate_chauffeur_schedule_conflict();

/* ============================================================
   VOYA TAXI - CHAUFFEUR ADD AVAILABILITY

   Purpose:
   Allows an authenticated chauffeur to register a manually
   managed availability period.

   Security:
   - Uses auth.uid() to identify the caller.
   - Verifies chauffeur ownership in user_profiles.
   - Does not accept a user ID from the browser.

   Scheduling:
   - Acquires the chauffeur schedule transaction lock.
   - Uses the availability validation trigger to reject
     periods overlapping existing bookings.
   - Leaves booking_id NULL for manually created periods.
============================================================ */

CREATE OR REPLACE FUNCTION public.chauffeur_add_availability(
    p_chauffeur_id UUID,
    p_available_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_status public.availability_status,
    p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_availability_id UUID;
BEGIN
    /* SECTION 1: Verify the authenticated chauffeur. */
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.user_profiles AS profile
        WHERE profile.user_id = auth.uid()
          AND profile.role = 'chauffeur'
          AND profile.chauffeur_id = p_chauffeur_id
    ) THEN
        RAISE EXCEPTION 'Chauffeur authorization failed.'
        USING ERRCODE = '42501';
    END IF;

    /* SECTION 2: Validate the submitted availability details. */
    IF p_available_date IS NULL
       OR p_start_time IS NULL
       OR p_end_time IS NULL
       OR p_start_time >= p_end_time
       OR p_status IS NULL
    THEN
        RAISE EXCEPTION 'Invalid availability details.'
        USING ERRCODE = '22023';
    END IF;

    /* SECTION 3: Coordinate scheduling operations.
       This lock is held until the current transaction finishes. */
    PERFORM public.lock_chauffeur_schedule(p_chauffeur_id);

    /* SECTION 4: Insert the manual availability period.
       The database trigger checks booking conflicts automatically. */
    INSERT INTO public.chauffeur_availability (
        chauffeur_id,
        available_date,
        start_time,
        end_time,
        status,
        notes
    )
    VALUES (
        p_chauffeur_id,
        p_available_date,
        p_start_time,
        p_end_time,
        p_status,
        NULLIF(btrim(p_notes), '')
    )
    RETURNING id INTO v_availability_id;

    RETURN v_availability_id;
END;
$$;

/* Only authenticated users may call this RPC.
   Ownership is independently checked inside the function. */
REVOKE ALL ON FUNCTION public.chauffeur_add_availability(
    UUID, DATE, TIME, TIME, public.availability_status, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chauffeur_add_availability(
    UUID, DATE, TIME, TIME, public.availability_status, TEXT
) TO authenticated;

/* ============================================================
   VOYA TAXI - CHAUFFEUR UPDATE AVAILABILITY

   Purpose:
   Allows an authenticated chauffeur to edit an existing
   manually registered availability period.

   Security:
   - Uses auth.uid() to identify the logged-in user.
   - Verifies ownership through user_profiles.
   - Prevents editing booking-generated busy periods.

   Scheduling:
   - Acquires the chauffeur schedule lock before changing
     the availability record.
   - Relies on the validation trigger to reject periods
     overlapping existing bookings.
============================================================ */

CREATE OR REPLACE FUNCTION public.chauffeur_update_availability(
    p_chauffeur_id UUID,
    p_availability_id UUID,
    p_available_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_status public.availability_status,
    p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated_id UUID;
BEGIN
    /* SECTION 1: Verify the authenticated chauffeur owns
       the selected chauffeur account. */
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.user_profiles AS profile
        WHERE profile.user_id = auth.uid()
          AND profile.role = 'chauffeur'
          AND profile.chauffeur_id = p_chauffeur_id
    ) THEN
        RAISE EXCEPTION 'Chauffeur authorization failed.'
        USING ERRCODE = '42501';
    END IF;

    /* SECTION 2: Validate the submitted availability details. */
    IF p_availability_id IS NULL
       OR p_available_date IS NULL
       OR p_start_time IS NULL
       OR p_end_time IS NULL
       OR p_start_time >= p_end_time
       OR p_status IS NULL
    THEN
        RAISE EXCEPTION 'Invalid availability details.'
        USING ERRCODE = '22023';
    END IF;

    /* SECTION 3: Lock this chauffeur's schedule before
       updating an availability record. */
    PERFORM public.lock_chauffeur_schedule(p_chauffeur_id);

    /* SECTION 4: Update only a manually created period.
       booking_id IS NULL protects booking-generated periods.

       The database trigger rejects conflicts with bookings. */
    UPDATE public.chauffeur_availability AS availability
    SET
        available_date = p_available_date,
        start_time = p_start_time,
        end_time = p_end_time,
        status = p_status,
        notes = NULLIF(btrim(p_notes), '')
    WHERE availability.id = p_availability_id
      AND availability.chauffeur_id = p_chauffeur_id
      AND availability.booking_id IS NULL
    RETURNING availability.id INTO v_updated_id;

    /* SECTION 5: Report a missing or protected record. */
    IF v_updated_id IS NULL THEN
        RAISE EXCEPTION
            'Manual availability record was not found or is protected.'
        USING ERRCODE = 'P0002';
    END IF;

    RETURN v_updated_id;
END;
$$;

/* Restrict execution to authenticated users.
   The RPC also checks account ownership internally. */
REVOKE ALL ON FUNCTION public.chauffeur_update_availability(
    UUID, UUID, DATE, TIME, TIME, public.availability_status, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chauffeur_update_availability(
    UUID, UUID, DATE, TIME, TIME, public.availability_status, TEXT
) TO authenticated;

/* ============================================================
   VOYA TAXI - CHAUFFEUR DELETE AVAILABILITY

   Purpose:
   Allows an authenticated chauffeur to delete only their own
   manually created availability records.

   Security:
   - Verifies the authenticated user through auth.uid().
   - Confirms chauffeur ownership through user_profiles.
   - Protects booking-generated busy periods.

   Concurrency:
   - Acquires the chauffeur schedule lock before deletion.
============================================================ */

CREATE OR REPLACE FUNCTION public.chauffeur_delete_availability(
    p_chauffeur_id UUID,
    p_availability_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_deleted_id UUID;
BEGIN
    /* SECTION 1: Verify authenticated chauffeur ownership. */
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.user_profiles AS profile
        WHERE profile.user_id = auth.uid()
          AND profile.role = 'chauffeur'
          AND profile.chauffeur_id = p_chauffeur_id
    ) THEN
        RAISE EXCEPTION 'Chauffeur authorization failed.'
        USING ERRCODE = '42501';
    END IF;

    /* SECTION 2: Validate required identifiers. */
    IF p_chauffeur_id IS NULL OR p_availability_id IS NULL THEN
        RAISE EXCEPTION 'Chauffeur ID and availability ID are required.'
        USING ERRCODE = '22023';
    END IF;

    /* SECTION 3: Lock the chauffeur schedule. */
    PERFORM public.lock_chauffeur_schedule(p_chauffeur_id);

    /* SECTION 4: Delete only manually created availability. */
    DELETE FROM public.chauffeur_availability AS availability
    WHERE availability.id = p_availability_id
      AND availability.chauffeur_id = p_chauffeur_id
      AND availability.booking_id IS NULL
    RETURNING availability.id INTO v_deleted_id;

    /* SECTION 5: Reject missing or protected records. */
    IF v_deleted_id IS NULL THEN
        RAISE EXCEPTION
            'Manual availability record was not found or is protected.'
        USING ERRCODE = 'P0002';
    END IF;

    RETURN v_deleted_id;
END;
$$;

/* ============================================================
   SECURITY - CHAUFFEUR DELETE AVAILABILITY

   Browser roles cannot directly delete availability records.
   Only authenticated chauffeurs may execute this protected RPC.
============================================================ */

REVOKE ALL ON FUNCTION public.chauffeur_delete_availability(
    UUID, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chauffeur_delete_availability(
    UUID, UUID
) TO authenticated;

/* ============================================================
   End - CHAUFFEUR DELETE AVAILABILITY
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

    /* ============================================================
    CHAUFFEUR SCHEDULE LOCK - BOOKING ASSIGNMENT

    Coordinates booking changes involving the previous and
    newly assigned chauffeur.

    Locks both schedules in consistent UUID order to reduce
    the risk of concurrent assignment conflicts.

    The locks remain active until the transaction finishes.
    ============================================================ */
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
    /* Prevent overnight intervals for every assigned, reserving booking. */
    IF p_chauffeur_id IS NOT NULL
        AND p_status NOT IN ('cancelled', 'rejected')
        AND v_end_at::DATE <> v_pickup_date THEN

        RAISE EXCEPTION
            'The calculated busy period crosses midnight.'
        USING ERRCODE = '22023';
    END IF;

    /* ============================================================
    CHAUFFEUR UNAVAILABILITY CHECK - BOOKING ASSIGNMENT

    Prevents new assignments and booking reactivations from
    overlapping offline or holiday periods.

    Existing assignments and booking completions are preserved.
    Manual busy overlaps remain protected by the existing
    PostgreSQL exclusion constraint.
    ============================================================ */
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
    IF p_chauffeur_id IS NOT NULL  AND p_status NOT IN ('cancelled', 'rejected') THEN
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
/*===============================================================
    End public.update_booking_admin_assignment
=================================================================*/

/* ============================================================
   SECURITY - ADMIN BOOKING ASSIGNMENT

   Only the trusted service_role may execute this function.
   Prevents direct booking-assignment changes by browser roles.
============================================================ */

REVOKE ALL
ON FUNCTION public.update_booking_admin_assignment(
    UUID, UUID, UUID, public.booking_status
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.update_booking_admin_assignment(
    UUID, UUID, UUID, public.booking_status
)
TO service_role;
/*===============================================================
    End SECURITY - ADMIN BOOKING ASSIGNMENT
=================================================================*/


CREATE OR REPLACE FUNCTION public.admin_add_chauffeur_availability(
    p_chauffeur_id uuid,
    p_admin_user_id uuid,
    p_available_date date,
    p_start_time time,
    p_end_time time,
    p_status public.availability_status,
    p_notes text,
    p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_availability_id uuid;
    v_new_values jsonb;
BEGIN
    -- Verify that the supplied user is currently an administrator.
    IF NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE user_id = p_admin_user_id
          AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Administrator authorization failed.';
    END IF;

    -- Require an explanation for the administrative change.
    IF NULLIF(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'An administrator reason is required.';
    END IF;

    -- Validate the date, time interval and availability status.
    IF p_available_date IS NULL
       OR p_start_time IS NULL
       OR p_end_time IS NULL
       OR p_start_time >= p_end_time
       OR p_status IS NULL
    THEN
        RAISE EXCEPTION 'Invalid availability details.';
    END IF;

    -- Confirm that the target chauffeur exists.
    IF NOT EXISTS (
        SELECT 1
        FROM public.chauffeurs
        WHERE id = p_chauffeur_id
    ) THEN
        RAISE EXCEPTION 'Chauffeur not found.';
    END IF;

    /* ============================================================
    CHAUFFEUR SCHEDULE LOCK

    Prevents simultaneous scheduling operations for the same
    chauffeur from passing their conflict checks independently.

    The transaction-level lock is released automatically when
    the complete Admin Add operation finishes.
    ============================================================ */
    PERFORM public.lock_chauffeur_schedule(p_chauffeur_id);

    -- Create a manually managed availability period.
    -- booking_id remains NULL.
    INSERT INTO public.chauffeur_availability (
        chauffeur_id,
        available_date,
        start_time,
        end_time,
        status,
        notes
    )
    VALUES (
        p_chauffeur_id,
        p_available_date,
        p_start_time,
        p_end_time,
        p_status,
        NULLIF(btrim(p_notes), '')
    )
    RETURNING id INTO v_availability_id;

    -- Capture the complete new record for audit history.
    SELECT to_jsonb(a)
    INTO v_new_values
    FROM public.chauffeur_availability AS a
    WHERE a.id = v_availability_id;

    -- Record the administrative intervention.
    INSERT INTO public.chauffeur_availability_audit (
        chauffeur_id,
        availability_id,
        action,
        changed_by_user_id,
        reason,
        old_values,
        new_values
    )
    VALUES (
        p_chauffeur_id,
        v_availability_id,
        'created',
        p_admin_user_id,
        btrim(p_reason),
        NULL,
        v_new_values
    );

    RETURN v_availability_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_chauffeur_availability(
    p_chauffeur_id uuid,
    p_availability_id uuid,
    p_admin_user_id uuid,
    p_available_date date,
    p_start_time time,
    p_end_time time,
    p_status public.availability_status,
    p_notes text,
    p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_old_values jsonb;
    v_new_values jsonb;
BEGIN
    -- Verify the administrator's role.
    IF NOT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = p_admin_user_id AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Administrator authorization failed.';
    END IF;

    -- Require a reason for the correction.
    IF NULLIF(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'An administrator reason is required.';
    END IF;

    -- Validate the submitted availability values.
    IF p_available_date IS NULL
       OR p_start_time IS NULL
       OR p_end_time IS NULL
       OR p_start_time >= p_end_time
       OR p_status IS NULL THEN
        RAISE EXCEPTION 'Invalid availability details.';
    END IF;

    /* ============================================================
    CHAUFFEUR SCHEDULE LOCK - ADMIN EDIT

    Coordinates edits to this chauffeur's unavailable periods
    with booking assignments and other availability changes.

    Acquire the schedule lock before locking the availability
    record, maintaining a consistent order within this function.
    ============================================================ */
    PERFORM public.lock_chauffeur_schedule(p_chauffeur_id);

    /* Lock and read the original row to prevent concurrent
       modifications while the audit entry is being created. */
    SELECT to_jsonb(a)
    INTO v_old_values
    FROM public.chauffeur_availability AS a
    WHERE a.id = p_availability_id
      AND a.chauffeur_id = p_chauffeur_id
      AND a.booking_id IS NULL
    FOR UPDATE;

    IF v_old_values IS NULL THEN
        RAISE EXCEPTION 'Manual availability record not found or protected.';
    END IF;

    -- Update only the selected manual availability record.
    UPDATE public.chauffeur_availability AS a
    SET available_date = p_available_date,
        start_time = p_start_time,
        end_time = p_end_time,
        status = p_status,
        notes = NULLIF(btrim(p_notes), ''),
        updated_at = now()
    WHERE a.id = p_availability_id
      AND a.chauffeur_id = p_chauffeur_id
      AND a.booking_id IS NULL
    RETURNING to_jsonb(a) INTO v_new_values;

    -- Preserve the original and updated data in the audit history.
    INSERT INTO public.chauffeur_availability_audit (
        chauffeur_id, availability_id, action,
        changed_by_user_id, reason, old_values, new_values
    )
    VALUES (
        p_chauffeur_id, p_availability_id, 'updated',
        p_admin_user_id, btrim(p_reason), v_old_values, v_new_values
    );

    RETURN p_availability_id;
END;
$$;

/* ============================================================
   SECURITY - ADMIN CHAUFFEUR AVAILABILITY

   Only trusted server-side operations may add or update
   chauffeur availability through the administrator RPCs.

   Anonymous and ordinary authenticated users are denied.
============================================================ */

-- SECTION 1: Protect administrator Add RPC.
REVOKE ALL ON FUNCTION public.admin_add_chauffeur_availability(
    UUID, UUID, DATE, TIME, TIME,
    public.availability_status, TEXT, TEXT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_add_chauffeur_availability(
    UUID, UUID, DATE, TIME, TIME,
    public.availability_status, TEXT, TEXT
)
TO service_role;

-- SECTION 2: Protect administrator Update RPC.
REVOKE ALL ON FUNCTION public.admin_update_chauffeur_availability(
    UUID, UUID, UUID, DATE, TIME, TIME,
    public.availability_status, TEXT, TEXT
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_update_chauffeur_availability(
    UUID, UUID, UUID, DATE, TIME, TIME,
    public.availability_status, TEXT, TEXT
)
TO service_role;

/* ============================================================
   VOYA TAXI - PROTECT DIRECT AVAILABILITY WRITES

   Purpose:
   Require ordinary application users to manage chauffeur
   availability through authorized PostgreSQL RPC functions.

   Authenticated chauffeurs can still use:
   - chauffeur_add_availability()
   - chauffeur_update_availability()

   Privileged server operations retain their existing access.
   Existing RLS configuration remains unchanged.
============================================================ */

REVOKE INSERT, UPDATE, DELETE
ON TABLE public.chauffeur_availability
FROM anon, authenticated;

/* ============================================================
   Preserve trusted server-side availability access.

   The service_role bypasses RLS but still requires table
   privileges for direct database operations.
============================================================ */

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.chauffeur_availability
TO service_role;

/* Commit all changes only after every statement succeeds. */
COMMIT;
