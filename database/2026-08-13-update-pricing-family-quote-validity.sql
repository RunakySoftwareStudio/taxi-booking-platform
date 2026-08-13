/*
 * Pricing Version - Process 3
 *
 * Synchronizes create_pricing_profile_family() with the canonical schema.
 * New pricing-profile families now start with: quote_validity_minutes = 20
 * Existing pricing profiles and journey quotes are not changed.
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
     * Prevent two administrators from creating the same
     * pricing-profile family at the same moment.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_pricing_profile_code, 0)
    );


    /* The pricing-profile family must not already exist. */
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
     * New pricing families start with a quote validity
     * of 20 minutes.
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
        created_by_user_id
    )
    VALUES (
        v_pricing_profile_code,
        v_pricing_profile_name,
        1,
        v_country_code,
        v_currency_code,
        20,
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


    RETURN v_new_pricing_profile_id;
END;
$$;


/* Browser roles cannot create financial configuration directly. */
REVOKE ALL
ON FUNCTION public.create_pricing_profile_family(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    UUID
)
FROM PUBLIC, anon, authenticated;


/* Trusted Next.js server operations use service_role. */
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
IS 'Creates Version 1 of a new pricing-profile family as an editable draft with zero initial rates and 20-minute quote validity.';