/* ============================================================
   VALIDATOR DATA VISIBILITY

   claim_open_booking(...) first assigns the chauffeur and
   vehicle and then validates that new assignment.

   VOLATILE allows validate_booking_assignment(...) to see
   database changes made earlier inside the same claim command.

   With STABLE, PostgreSQL would use the snapshot from the
   beginning of the command and could still see the booking as
   unassigned.
============================================================ */

ALTER FUNCTION public.validate_booking_assignment(UUID)
VOLATILE;

/* ============================================================
   CLAIM OPEN BOOKING

   Allows an authenticated chauffeur to claim one open booking.

   Important security rules:

   - The browser provides only the booking ID.
   - The chauffeur ID comes from auth.uid() and user_profiles.
   - The vehicle ID comes from the chauffeur's default vehicle.
   - The chauffeur and vehicle IDs are never trusted from the browser.
   - The booking row is locked to prevent two chauffeurs from
     claiming the same booking simultaneously.
   - The existing admin assignment function creates the linked
     busy period.
   - The existing assignment validator checks whether the
     chauffeur and default vehicle match the booking.
============================================================ */

CREATE OR REPLACE FUNCTION public.claim_open_booking(
    p_booking_id UUID
)
RETURNS TABLE (
    claimed_booking_id UUID,
    claimed_chauffeur_id UUID,
    claimed_vehicle_id UUID,
    claimed_status public.booking_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    /* The currently authenticated Supabase user. */
    v_authenticated_user_id UUID;

    /* The chauffeur connected to the authenticated user. */
    v_chauffeur_id UUID;

    /* Current chauffeur eligibility information. */
    v_account_status public.chauffeur_account_status;
    v_operational_status public.chauffeur_operational_status;

    /* The chauffeur's available default vehicle. */
    v_vehicle_id UUID;

    /* Current booking information before it is claimed. */
    v_booking_status public.booking_status;
    v_existing_chauffeur_id UUID;
    v_existing_vehicle_id UUID;

    /* Result returned by validate_booking_assignment(...). */
    v_validation RECORD;

BEGIN
    /* ========================================================
       SECTION 1: VALIDATE THE BOOKING ID
    ======================================================== */

    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'A booking ID is required.';
    END IF;


    /* ========================================================
       SECTION 2: IDENTIFY THE AUTHENTICATED USER

       auth.uid() reads the user ID from the authenticated
       Supabase session.

       A service-role request or unauthenticated request does not
       represent a chauffeur using the website.
    ======================================================== */

    v_authenticated_user_id := auth.uid();

    IF v_authenticated_user_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '42501',
                MESSAGE = 'You must be logged in to claim a booking.';
    END IF;


    /* ========================================================
       SECTION 3: FIND THE CHAUFFEUR PROFILE

       We do not accept chauffeur_id from the browser.

       The authenticated user must have:

       - a user_profiles record;
       - role = chauffeur;
       - a linked chauffeur_id.
    ======================================================== */

    SELECT user_profile.chauffeur_id
    INTO v_chauffeur_id
    FROM public.user_profiles AS user_profile
    WHERE user_profile.user_id = v_authenticated_user_id
      AND user_profile.role = 'chauffeur';

    IF NOT FOUND OR v_chauffeur_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '42501',
                MESSAGE = 'Your account is not connected to a chauffeur profile.';
    END IF;


    /* ========================================================
       SECTION 4: LOCK AND CHECK THE BOOKING

       FOR UPDATE locks this booking row until the function ends.

       When two chauffeurs click Claim at approximately the same
       moment:

       - the first function locks and claims the booking;
       - the second function waits;
       - after waiting, it sees that the booking is no longer open.
    ======================================================== */

    SELECT
        booking.status,
        booking.chauffeur_id,
        booking.vehicle_id
    INTO
        v_booking_status,
        v_existing_chauffeur_id,
        v_existing_vehicle_id
    FROM public.bookings AS booking
    WHERE booking.id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The booking could not be found.';
    END IF;

    /*
     * A claimable booking must still be pending and completely
     * unassigned.
     */
    IF v_booking_status <> 'pending'
       OR v_existing_chauffeur_id IS NOT NULL
       OR v_existing_vehicle_id IS NOT NULL THEN

        RAISE EXCEPTION
            USING
                ERRCODE = 'P0001',
                MESSAGE = 'This booking is no longer available.';
    END IF;


    /* ========================================================
       SECTION 5: LOCK AND CHECK THE CHAUFFEUR

       The chauffeur must still be approved and operationally
       available at the exact moment the booking is claimed.

       Locking the chauffeur prevents the status from changing
       halfway through the claim.
    ======================================================== */

    SELECT
        chauffeur.account_status,
        chauffeur.operational_status
    INTO
        v_account_status,
        v_operational_status
    FROM public.chauffeurs AS chauffeur
    WHERE chauffeur.id = v_chauffeur_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'Your chauffeur profile could not be found.';
    END IF;

    IF v_account_status <> 'approved' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '42501',
                MESSAGE = 'Only an approved chauffeur can claim bookings.';
    END IF;

    IF v_operational_status <> 'available' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '42501',
                MESSAGE = 'You must be operationally available to claim bookings.';
    END IF;


    /* ========================================================
       SECTION 6: LOAD THE AVAILABLE DEFAULT VEHICLE

       The browser does not select or provide a vehicle ID.

       The function finds the vehicle that:

       - belongs to the authenticated chauffeur;
       - is marked as the default vehicle;
       - is operationally available.

       The chauffeur row is already locked, which also serializes
       default-vehicle changes for this chauffeur.
    ======================================================== */

    SELECT vehicle.id
    INTO v_vehicle_id
    FROM public.vehicles AS vehicle
    WHERE vehicle.chauffeur_id = v_chauffeur_id
      AND vehicle.is_default_vehicle = TRUE
      AND vehicle.vehicle_status = 'available'
    FOR UPDATE;

    IF NOT FOUND OR v_vehicle_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0001',
                MESSAGE = 'You need an available default vehicle before you can claim bookings.';
    END IF;


    /* ========================================================
       SECTION 7: ASSIGN THE BOOKING

       Reuses the existing trusted database function.

       It will:

       - assign the chauffeur;
       - assign the exact default vehicle;
       - change pending to accepted;
       - calculate the trip end time;
       - create the linked busy period;
       - reject conflicting busy periods.

       Everything remains inside this same PostgreSQL transaction.
    ======================================================== */

    PERFORM public.update_booking_admin_assignment(
        p_booking_id,
        v_chauffeur_id,
        v_vehicle_id,
        'accepted'
    );


    /* ========================================================
       SECTION 8: VALIDATE THE COMPLETE ASSIGNMENT

       The validator checks the current chauffeur and vehicle
       against all booking requirements, including:

       - pets;
       - passenger seats;
       - luggage;
       - child seats;
       - ISOFIX;
       - wheelchair support;
       - mobility-aid storage;
       - extra-large luggage.

       The assignment has temporarily been made so the existing
       validator can inspect it.

       If validation fails, RAISE EXCEPTION rolls back:

       - the booking assignment;
       - the accepted status;
       - the linked busy period.

       The booking therefore remains pending and unassigned.
    ======================================================== */

    SELECT *
    INTO v_validation
    FROM public.validate_booking_assignment(p_booking_id);

    IF NOT FOUND
       OR v_validation.is_valid IS DISTINCT FROM TRUE THEN

        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = COALESCE(
                    v_validation.issue_summary,
                    'The default vehicle does not match this booking.'
                ),
                DETAIL = COALESCE(
                    v_validation.issue_details::TEXT,
                    '{"issues":[]}'
                );
    END IF;


    /* ========================================================
       SECTION 9: RETURN THE SUCCESSFUL CLAIM

       The function returns only technical assignment data.
       It does not return client contact information or notes.
    ======================================================== */

    RETURN QUERY
    SELECT
        p_booking_id,
        v_chauffeur_id,
        v_vehicle_id,
        'accepted'::public.booking_status;

END;
$$;


/* ============================================================
   FUNCTION PERMISSIONS

   The function must not be publicly callable.

   Only an authenticated Supabase user may call it. The function
   itself then verifies that the user really represents an
   approved and available chauffeur.
============================================================ */

REVOKE ALL
ON FUNCTION public.claim_open_booking(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.claim_open_booking(UUID)
TO authenticated;