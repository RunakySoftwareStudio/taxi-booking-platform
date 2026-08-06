/* ============================================================
   VOYA TAXI — CREATE PRICING PROFILE DRAFT

   Purpose:

   Creates a new draft version by copying one active pricing
   profile and its pricing rates.

   The function performs both inserts as one atomic database
   operation:

       active pricing profile
               ↓
       calculate next version
               ↓
       create draft pricing profile
               ↓
       copy pricing rates
               ↓
       return new draft profile ID

   When any step fails, PostgreSQL rolls back the entire function.
   A profile can therefore never be created without its copied
   pricing-rates record.
============================================================ */

BEGIN;


/* ============================================================
   CREATE PRICING PROFILE DRAFT FUNCTION

   Parameters:

   p_source_pricing_profile_id
       The active pricing profile that must be copied.

   p_created_by_user_id
       The authenticated administrator who creates the draft.

   Returns:

       UUID of the newly created draft pricing profile.
============================================================ */

CREATE OR REPLACE FUNCTION public.create_pricing_profile_draft(
    p_source_pricing_profile_id UUID,
    p_created_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* Stores the pricing-profile code before the family lock. */
    v_pricing_profile_code TEXT;

    /* Stores the complete active source profile. */
    v_source_profile public.pricing_profiles%ROWTYPE;

    /* Stores the rates connected to the source profile. */
    v_source_rate public.pricing_rates%ROWTYPE;

    /* Stores the next available version number. */
    v_next_version INTEGER;

    /* Stores the UUID generated for the new draft profile. */
    v_new_draft_profile_id UUID;
BEGIN
    /* Both IDs are required. */
    IF p_source_pricing_profile_id IS NULL
        OR p_created_by_user_id IS NULL
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Source pricing profile ID and administrator user ID are required.';
    END IF;


    /*
     * Load the profile code first.
     *
     * The profile code identifies the complete version family,
     * for example NL_DAYTIME_STANDARD.
     */
    SELECT pricing_profile.pricing_profile_code
    INTO v_pricing_profile_code
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_source_pricing_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The source pricing profile could not be found.';
    END IF;


    /*
     * Lock draft creation for this pricing-profile family.
     *
     * Two administrators may click Create draft at nearly the
     * same moment. The advisory transaction lock makes the second
     * request wait until the first request has calculated and
     * inserted its version.
     *
     * Example:
     *
     * Request 1 creates Version 2.
     * Request 2 waits and then creates Version 3.
     *
     * Both requests cannot independently choose Version 2.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_pricing_profile_code, 0)
    );


    /*
     * Reload and lock the selected source profile after obtaining
     * the family lock.
     */
    SELECT pricing_profile.*
    INTO v_source_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_source_pricing_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The source pricing profile could not be found.';
    END IF;


    /*
     * A new draft must be copied from the currently active version.
     *
     * Draft and archived profiles are historical or unfinished
     * records and are not authoritative sources for this workflow.
     */
    IF v_source_profile.status <> 'active' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'A draft pricing version can only be created from an active pricing profile.';
    END IF;


    /*
     * Load the complete rate row connected to the active profile.
     *
     * FOR SHARE keeps the rate values stable while they are copied.
     */
    SELECT pricing_rate.*
    INTO v_source_rate
    FROM public.pricing_rates AS pricing_rate
    WHERE pricing_rate.pricing_profile_id = v_source_profile.id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The active pricing profile does not contain a pricing-rates record.';
    END IF;


    /*
     * Calculate the next version number across the complete
     * pricing-profile family.
     *
     * Example:
     *
     * Existing versions: 1, 2 and 3
     * New draft version: 4
     */
    SELECT COALESCE(MAX(pricing_profile.pricing_profile_version), 0) + 1
    INTO v_next_version
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.pricing_profile_code =
        v_source_profile.pricing_profile_code;


    /*
     * Create the new profile as a draft.
     *
     * Identity and market information are copied.
     *
     * Lifecycle fields are not copied:
     * - status becomes draft;
     * - effective_from starts now;
     * - effective_until remains null;
     * - activated and archived fields remain null.
     */
    INSERT INTO public.pricing_profiles (
        pricing_profile_code,
        pricing_profile_name,
        pricing_profile_version,
        country_code,
        currency_code,
        quote_validity_minutes,
        status,
        effective_from,
        effective_until,
        created_by_user_id,
        activated_by_user_id,
        archived_by_user_id,
        activated_at,
        archived_at
    )
    VALUES (
        v_source_profile.pricing_profile_code,
        v_source_profile.pricing_profile_name,
        v_next_version,
        v_source_profile.country_code,
        v_source_profile.currency_code,
        v_source_profile.quote_validity_minutes,
        'draft',
        NOW(),
        NULL,
        p_created_by_user_id,
        NULL,
        NULL,
        NULL,
        NULL
    )
    RETURNING id
    INTO v_new_draft_profile_id;


    /*
     * Copy the active profile's monetary values to the new draft.
     *
     * The administrator can later edit these copied values without
     * changing the active or historical profile.
     */
    INSERT INTO public.pricing_rates (
        pricing_profile_id,
        base_fare_excluding_vat,
        distance_rate_per_km_excluding_vat,
        duration_rate_per_minute_excluding_vat,
        minimum_fare_excluding_vat
    )
    VALUES (
        v_new_draft_profile_id,
        v_source_rate.base_fare_excluding_vat,
        v_source_rate.distance_rate_per_km_excluding_vat,
        v_source_rate.duration_rate_per_minute_excluding_vat,
        v_source_rate.minimum_fare_excluding_vat
    );


    /* Return the UUID needed for redirecting to the new draft. */
    RETURN v_new_draft_profile_id;
END;
$$;


/* ============================================================
   FUNCTION PERMISSIONS

   Browser roles must not call this privileged financial
   operation directly.

   The Next.js server action will:

   1. call requireAdminUser();
   2. receive the authenticated administrator;
   3. call this function through supabaseAdmin;
   4. pass adminUser.id for the audit trail.
============================================================ */

REVOKE ALL
ON FUNCTION public.create_pricing_profile_draft(UUID, UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_pricing_profile_draft(UUID, UUID)
TO service_role;


COMMENT ON FUNCTION public.create_pricing_profile_draft(UUID, UUID)
IS 'Creates an atomic draft pricing-profile version by copying one active profile and its rates.';


COMMIT;