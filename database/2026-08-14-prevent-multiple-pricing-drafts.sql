/*
 * Pricing Version - Pricing lifecycle correction
 *
 * Prevents multiple draft versions from being created for the
 * same pricing-profile family.
 *
 * New rule:
 *
 * 0 drafts → create a new draft
 * 1 draft  → return the existing draft
 * 2+ drafts → raise a configuration error
 *
 * The family advisory lock keeps this operation safe when two
 * administrators request a draft at nearly the same moment.
 */

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

    /* Number of existing drafts in this pricing family. */
    v_draft_count INTEGER;

    /* Existing draft UUID when exactly one draft already exists. */
    v_existing_draft_profile_id UUID;

    /* Stores the next available version number. */
    v_next_version INTEGER;

    /* Stores the UUID generated for a new draft profile. */
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
     * Load the pricing-profile family code first.
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
     * Lock the complete pricing family.
     *
     * Example:
     *
     * Request 1 creates Version 2 draft.
     *
     * Request 2 waits for Request 1.
     * After the lock is released, Request 2 finds Version 2
     * and returns that existing draft instead of creating Version 3.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_pricing_profile_code, 0)
    );


    /* Reload and lock the selected source profile. */
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
     * New drafts may only be requested from the active version.
     */
    IF v_source_profile.status <> 'active' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'A draft pricing version can only be created from an active pricing profile.';
    END IF;


    /*
     * Check whether this pricing family already contains a draft.
     *
     * Normal lifecycle:
     *
     * 0 drafts → create one
     * 1 draft  → reuse it
     * 2+ drafts → existing data must be corrected
     */
    SELECT COUNT(*)
    INTO v_draft_count
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.pricing_profile_code =
        v_source_profile.pricing_profile_code
      AND pricing_profile.status = 'draft';


    IF v_draft_count > 1 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Multiple draft pricing versions already exist for this pricing-profile family.';
    END IF;


    /*
     * If one draft already exists, return its UUID.
     *
     * The Next.js server action can use the returned UUID exactly
     * as before and redirect the administrator to that draft.
     */
    IF v_draft_count = 1 THEN
        SELECT pricing_profile.id
        INTO v_existing_draft_profile_id
        FROM public.pricing_profiles AS pricing_profile
        WHERE pricing_profile.pricing_profile_code =
            v_source_profile.pricing_profile_code
          AND pricing_profile.status = 'draft';

        RETURN v_existing_draft_profile_id;
    END IF;


    /*
     * No draft exists, so load the active profile's rates.
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
     * Calculate the next version number across the complete family.
     */
    SELECT COALESCE(MAX(pricing_profile.pricing_profile_version), 0) + 1
    INTO v_next_version
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.pricing_profile_code =
        v_source_profile.pricing_profile_code;


    /*
     * Create the new draft profile.
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


    /* Return the UUID needed for the Next.js redirect. */
    RETURN v_new_draft_profile_id;
END;
$$;


/* Browser roles cannot perform this financial operation directly. */
REVOKE ALL
ON FUNCTION public.create_pricing_profile_draft(UUID, UUID)
FROM PUBLIC, anon, authenticated;


/* Trusted Next.js server operations use service_role. */
GRANT EXECUTE
ON FUNCTION public.create_pricing_profile_draft(UUID, UUID)
TO service_role;


COMMENT ON FUNCTION public.create_pricing_profile_draft(UUID, UUID)
IS 'Returns the existing draft for a pricing family or atomically creates one when no draft exists.';