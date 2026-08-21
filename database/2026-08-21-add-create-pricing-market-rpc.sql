/* ================================================================================================================
   CREATE PRICING MARKET

   Purpose:
   Atomically creates a new pricing market and, in the following
   sections of this function, generates its initial financial
   configuration from a selected pricing-market template.

   New markets always start as:
   configuration_status = 'review_required'
   pricing_enabled = FALSE

   The complete operation is atomic:
   if any generated financial configuration fails, PostgreSQL
   rolls back the complete market creation.
==================================================================================================================== */

CREATE OR REPLACE FUNCTION public.create_pricing_market(
    p_country_code TEXT,
    p_country_name TEXT,
    p_currency_code TEXT,
    p_time_zone TEXT,
    p_template_code TEXT,
    p_planned_effective_from TIMESTAMPTZ,
    p_created_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* Normalized country-specific input. */
    v_country_code TEXT;
    v_country_name TEXT;
    v_currency_code TEXT;
    v_time_zone TEXT;
    v_template_code TEXT;

    /* Selected reusable onboarding template. */
    v_template public.pricing_market_templates%ROWTYPE;

    /* Template-completeness checks. */
    v_profile_template_count INTEGER;
    v_schedule_template_count INTEGER;
    v_tax_rounding_template_count INTEGER;

    /* UUID of the newly created pricing market. */
    v_new_pricing_market_id UUID;
    
    /* Current pricing-profile template being copied. */
    v_profile_template public.pricing_market_profile_templates%ROWTYPE;

    /* UUID of each generated real pricing profile. */
    v_new_pricing_profile_id UUID;

    /* Tax + rounding starter configuration selected from the template. */
    v_tax_rounding_template public.pricing_market_tax_rounding_templates%ROWTYPE;

BEGIN
    /* -----------------------------------------------------------------------------------------------------------
       NORMALIZE INPUT
    ----------------------------------------------------------------------------------------------------------- */

    v_country_code := UPPER(TRIM(p_country_code));
    v_country_name := TRIM(p_country_name);
    v_currency_code := UPPER(TRIM(p_currency_code));
    v_time_zone := TRIM(p_time_zone);
    v_template_code := UPPER(TRIM(p_template_code));


    /* -----------------------------------------------------------------------------------------------------------
       REQUIRED VALUES
    ----------------------------------------------------------------------------------------------------------- */

    IF p_country_code IS NULL
        OR p_country_name IS NULL
        OR p_currency_code IS NULL
        OR p_time_zone IS NULL
        OR p_template_code IS NULL
        OR p_planned_effective_from IS NULL
        OR p_created_by_user_id IS NULL
        OR v_country_code = ''
        OR v_country_name = ''
        OR v_currency_code = ''
        OR v_time_zone = ''
        OR v_template_code = ''
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing market information is incomplete.';
    END IF;


    /* -----------------------------------------------------------------------------------------------------------
       COUNTRY + CURRENCY FORMAT
    ----------------------------------------------------------------------------------------------------------- */

    IF v_country_code !~ '^[A-Z]{2}$'
        OR v_currency_code !~ '^[A-Z]{3}$'
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The country or currency code is invalid.';
    END IF;


    /* -----------------------------------------------------------------------------------------------------------
       TEMPLATE CODE FORMAT
    ----------------------------------------------------------------------------------------------------------- */

    IF v_template_code !~ '^[A-Z0-9_]+$' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing-market template code is invalid.';
    END IF;


    /* -----------------------------------------------------------------------------------------------------------
       TIME ZONE

       PostgreSQL's pg_timezone_names contains the supported IANA
       time-zone names, for example Europe/Amsterdam or Europe/Berlin.
    ----------------------------------------------------------------------------------------------------------- */

    IF NOT EXISTS (
        SELECT 1
        FROM pg_timezone_names
        WHERE name = v_time_zone
    ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing-market time zone is invalid.';
    END IF;


    /* -----------------------------------------------------------------------------------------------------------
       PLANNED EFFECTIVE DATE

       A newly onboarded country must begin with a future planned
       financial start date so its generated drafts can be reviewed.
    ----------------------------------------------------------------------------------------------------------- */

    IF p_planned_effective_from <= NOW() THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The planned effective date must be in the future.';
    END IF;


    /* -----------------------------------------------------------------------------------------------------------
       LOAD TEMPLATE

       service_category is deliberately derived from this trusted
       template instead of being supplied separately by the browser.
    ----------------------------------------------------------------------------------------------------------- */

    SELECT *
    INTO v_template
    FROM public.pricing_market_templates
    WHERE template_code = v_template_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing-market template does not exist.';
    END IF;


    /* -----------------------------------------------------------------------------------------------------------
       TEMPLATE COMPLETENESS

       A country must never be generated from a partial template.
    ----------------------------------------------------------------------------------------------------------- */

    SELECT COUNT(*)
    INTO v_profile_template_count
    FROM public.pricing_market_profile_templates
    WHERE pricing_market_template_id = v_template.id;

    IF v_profile_template_count <> 5 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing-market template must contain exactly five pricing-profile templates.';
    END IF;


    SELECT COUNT(*)
    INTO v_schedule_template_count
    FROM public.pricing_market_schedule_templates
    WHERE pricing_market_template_id = v_template.id;

    IF v_schedule_template_count <> 17 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing-market template must contain exactly seventeen weekly schedule rows.';
    END IF;


    SELECT COUNT(*)
    INTO v_tax_rounding_template_count
    FROM public.pricing_market_tax_rounding_templates
    WHERE pricing_market_template_id = v_template.id;

    IF v_tax_rounding_template_count <> 1 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing-market template must contain exactly one tax and rounding template.';
    END IF;


    /* -----------------------------------------------------------------------------------------------------------
       COUNTRY CREATION LOCK

       Prevents two administrators from creating the same country
       at the same moment.

       The prefix keeps this advisory-lock namespace separate from
       other financial locks in the platform.
    ----------------------------------------------------------------------------------------------------------- */

    PERFORM pg_advisory_xact_lock(
        hashtextextended('pricing_market|' || v_country_code, 0)
    );


    /* The country code identifies one pricing market. */
    IF EXISTS (
        SELECT 1
        FROM public.pricing_markets
        WHERE country_code = v_country_code
    ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23505',
                MESSAGE = 'This pricing market already exists.';
    END IF;

    /* -----------------------------------------------------------------------------------------------------------
    CREATE PRICING MARKET

    New markets always begin under administrator review.

    Public pricing remains disabled until the complete generated
    financial configuration has been reviewed and marked ready.
    ----------------------------------------------------------------------------------------------------------- */

    INSERT INTO public.pricing_markets (
        country_code,
        country_name,
        currency_code,
        service_category,
        time_zone,
        configuration_status,
        pricing_enabled,
        planned_effective_from
    )
    VALUES (
        v_country_code,
        v_country_name,
        v_currency_code,
        v_template.service_category,
        v_time_zone,
        'review_required',
        FALSE,
        p_planned_effective_from
    )
    RETURNING id
    INTO v_new_pricing_market_id;


    /* -----------------------------------------------------------------------------------------------------------
    GENERATE PRICING PROFILE DRAFTS + RATES

    Each reusable profile template becomes one real Version 1
    pricing-profile family for the new country.

    Example:
    country = DE
    profile_suffix = DAYTIME_STANDARD

    Generated code:
    DE_DAYTIME_STANDARD

    Generated name:
    Germany Daytime Standard
    ----------------------------------------------------------------------------------------------------------- */

    FOR v_profile_template IN
        SELECT *
        FROM public.pricing_market_profile_templates
        WHERE pricing_market_template_id = v_template.id
        ORDER BY profile_suffix
    LOOP
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
            created_by_user_id
        )
        VALUES (
            v_country_code || '_' || v_profile_template.profile_suffix,
            v_country_name || ' ' || v_profile_template.profile_name_suffix,
            1,
            v_country_code,
            v_currency_code,
            v_profile_template.quote_validity_minutes,
            'draft',
            p_planned_effective_from,
            NULL,
            p_created_by_user_id
        )
        RETURNING id
        INTO v_new_pricing_profile_id;


        /*
        * Copy the template's starter monetary values into the
        * editable real pricing-rate record.
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
            v_profile_template.base_fare_excluding_vat,
            v_profile_template.distance_rate_per_km_excluding_vat,
            v_profile_template.duration_rate_per_minute_excluding_vat,
            v_profile_template.minimum_fare_excluding_vat
        );
    END LOOP;

    /* -----------------------------------------------------------------------------------------------------------
    GENERATE WEEKLY PRICING SCHEDULE

    Copies the reusable weekly schedule into the real
    public.pricing_schedules table.

    Example:
    template profile suffix = DAYTIME_STANDARD
    country                 = DE

    Generated profile code:
    DE_DAYTIME_STANDARD
    ----------------------------------------------------------------------------------------------------------- */

    INSERT INTO public.pricing_schedules (
        country_code,
        service_category,
        day_of_week,
        start_local_time,
        end_local_time,
        pricing_profile_code
    )
    SELECT
        v_country_code,
        v_template.service_category,
        schedule_template.day_of_week,
        schedule_template.start_local_time,
        schedule_template.end_local_time,
        v_country_code || '_' || schedule_template.profile_suffix
    FROM public.pricing_market_schedule_templates schedule_template
    WHERE schedule_template.pricing_market_template_id = v_template.id;

    /* -----------------------------------------------------------------------------------------------------------
    LOAD TAX + ROUNDING TEMPLATE

    One pricing-market template has exactly one starter tax
    and rounding configuration.
    ----------------------------------------------------------------------------------------------------------- */

    SELECT *
    INTO v_tax_rounding_template
    FROM public.pricing_market_tax_rounding_templates
    WHERE pricing_market_template_id = v_template.id;


    /* -----------------------------------------------------------------------------------------------------------
    GENERATE TAX-RULE DRAFT

    The starter tax value is copied into a real country tax-rule draft.

    Important:
    The template currently uses 0.00% deliberately.
    This is NOT an approved country tax rate.

    The new market remains review_required and pricing remains disabled
    until an administrator verifies the correct tax configuration.
    ----------------------------------------------------------------------------------------------------------- */

    INSERT INTO public.tax_rules (
        country_code,
        tax_name,
        service_category,
        tax_rate_percentage,
        status,
        effective_from,
        effective_until,
        created_by_user_id
    )
    VALUES (
        v_country_code,
        v_tax_rounding_template.tax_name,
        v_template.service_category,
        v_tax_rounding_template.tax_rate_percentage,
        'draft',
        p_planned_effective_from,
        NULL,
        p_created_by_user_id
    );

    /* -----------------------------------------------------------------------------------------------------------
    GENERATE CURRENCY-ROUNDING-RULE DRAFT

    The starter rounding configuration is copied into a real
    country currency-rounding-rule draft.

    Important:
    0.0100 nearest is only a generic starter configuration.
    The administrator must verify whether it is correct for the
    new country's currency and financial requirements.
    ----------------------------------------------------------------------------------------------------------- */

    INSERT INTO public.currency_rounding_rules (
        country_code,
        currency_code,
        rounding_increment,
        rounding_mode,
        status,
        effective_from,
        effective_until,
        created_by_user_id
    )
    VALUES (
        v_country_code,
        v_currency_code,
        v_tax_rounding_template.rounding_increment,
        v_tax_rounding_template.rounding_mode,
        'draft',
        p_planned_effective_from,
        NULL,
        p_created_by_user_id
    );

        /* -----------------------------------------------------------------------------------------------------------
        RETURN NEW PRICING MARKET

        If execution reaches this point, the market and its complete
        starter financial configuration were created successfully.

        PostgreSQL keeps the whole function call atomic, so any earlier
        failure would have rolled back all generated rows.
        ----------------------------------------------------------------------------------------------------------- */

        RETURN v_new_pricing_market_id;

    END;
    $$;

    /* ============================================================
    FUNCTION PERMISSIONS

    Browser roles cannot create pricing markets directly.

    The Next.js Admin Server Action will first verify the
    administrator and then call this function through supabaseAdmin.
    ============================================================ */

    REVOKE ALL
    ON FUNCTION public.create_pricing_market(
        TEXT,
        TEXT,
        TEXT,
        TEXT,
        TEXT,
        TIMESTAMPTZ,
        UUID
    )
    FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE
    ON FUNCTION public.create_pricing_market(
        TEXT,
        TEXT,
        TEXT,
        TEXT,
        TEXT,
        TIMESTAMPTZ,
        UUID
    )
    TO service_role;

    COMMENT ON FUNCTION public.create_pricing_market(
        TEXT,
        TEXT,
        TEXT,
        TEXT,
        TEXT,
        TIMESTAMPTZ,
        UUID
    )
    IS 'Atomically creates a review-required pricing market and generates its initial pricing profiles, rates, weekly schedule, tax-rule draft and currency-rounding-rule draft from a selected market template.';
