/*
 * Pricing Version - Process 3
 *
 * Creates the first draft version of a completely new
 * pricing-profile family.
 *
 * Example:
 *
 * NL_NIGHT_STANDARD does not exist
 *          ↓
 * create_pricing_profile_family(...)
 *          ↓
 * NL_NIGHT_STANDARD V1
 * status = draft
 * rates = 0
 *
 * The administrator can then edit the draft through the
 * existing pricing-detail page before activating it.
 */


CREATE OR REPLACE FUNCTION public.create_pricing_profile_family(
    p_pricing_profile_code TEXT,
    p_pricing_profile_name TEXT,
    p_country_code TEXT,
    p_currency_code TEXT,
    p_created_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_pricing_profile_code TEXT;
    v_pricing_profile_name TEXT;
    v_country_code TEXT;
    v_currency_code TEXT;

    v_new_pricing_profile_id UUID;

BEGIN
    /*
     * Normalize values before validation and storage.
     *
     * Example:
     *
     * nl_night_standard → NL_NIGHT_STANDARD
     * nl                → NL
     * eur               → EUR
     */
    v_pricing_profile_code := UPPER(TRIM(p_pricing_profile_code));
    v_pricing_profile_name := TRIM(p_pricing_profile_name);
    v_country_code := UPPER(TRIM(p_country_code));
    v_currency_code := UPPER(TRIM(p_currency_code));


    /* All required values must be present. */
    IF p_pricing_profile_code IS NULL
        OR p_pricing_profile_name IS NULL
        OR p_country_code IS NULL
        OR p_currency_code IS NULL
        OR p_created_by_user_id IS NULL
        OR v_pricing_profile_code = ''
        OR v_pricing_profile_name = ''
        OR v_country_code = ''
        OR v_currency_code = ''
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing profile family information is incomplete.';
    END IF;

    /* Validate the stable pricing-profile code. */
    IF v_pricing_profile_code !~ '^[A-Z0-9_]+$' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing profile code is invalid.';
    END IF;


    /* Validate country and currency codes. */
    IF v_country_code !~ '^[A-Z]{2}$'
        OR v_currency_code !~ '^[A-Z]{3}$'
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The country or currency code is invalid.';
    END IF;


    /*
     * Lock creation for this pricing-profile family.
     *
     * This prevents two administrators from creating the
     * same family at the same moment.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_pricing_profile_code, 0)
    );


    /*
     * A pricing-profile code identifies one complete family.
     *
     * If any version already exists, this is not a new family.
     */
    IF EXISTS (
        SELECT 1
        FROM public.pricing_profiles AS pricing_profile
        WHERE pricing_profile.pricing_profile_code = v_pricing_profile_code
    ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23505',
                MESSAGE = 'This pricing profile family already exists.';
    END IF;


    /*
     * Create Version 1 as a draft.
     *
     * quote_validity_minutes uses the table default of 15.
     * Lifecycle fields remain null while status = draft.
     */
    INSERT INTO public.pricing_profiles (
        pricing_profile_code,
        pricing_profile_name,
        pricing_profile_version,
        country_code,
        currency_code,
        status,
        effective_from,
        created_by_user_id
    )
    VALUES (
        v_pricing_profile_code,
        v_pricing_profile_name,
        1,
        v_country_code,
        v_currency_code,
        'draft',
        NOW(),
        p_created_by_user_id
    )
    RETURNING id
    INTO v_new_pricing_profile_id;


    /*
     * Create an editable rates record.
     *
     * New families begin with zero monetary values.
     * The administrator must configure the real values
     * before activation.
     */
    INSERT INTO public.pricing_rates (
        pricing_profile_id,
        base_fare_excluding_vat,
        distance_rate_per_km_excluding_vat,
        duration_rate_per_minute_excluding_vat,
        minimum_fare_excluding_vat
    )
    VALUES (
        v_new_pricing_profile_id,
        0,
        0,
        0,
        0
    );


    /* Return the UUID needed for redirecting to the draft page. */
    RETURN v_new_pricing_profile_id;

END;
$$;


/* ============================================================
FUNCTION PERMISSIONS

Browser roles cannot create financial configuration directly.

The Next.js server action will first verify the administrator
and then call this function through supabaseAdmin.
============================================================ */

REVOKE ALL
ON FUNCTION public.create_pricing_profile_family(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    UUID
)
FROM PUBLIC, anon, authenticated;


GRANT EXECUTE
ON FUNCTION public.create_pricing_profile_family(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    UUID
)
TO service_role;


COMMENT ON FUNCTION public.create_pricing_profile_family(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    UUID
)
IS 'Creates Version 1 of a new pricing-profile family as an editable draft with zero initial rates.';