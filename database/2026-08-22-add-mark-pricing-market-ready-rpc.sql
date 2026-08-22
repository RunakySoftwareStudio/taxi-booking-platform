
/* ================================================================================================================
   MARK PRICING MARKET READY

   Purpose:
   Marks a reviewed pricing market as ready only after PostgreSQL
   verifies that its required financial configuration is complete.

   Important:
   - Ready does NOT mean pricing is enabled.
   - pricing_enabled remains FALSE.
   - The database is the final safety layer.
==================================================================================================================== */

CREATE OR REPLACE FUNCTION public.mark_pricing_market_ready(
    p_country_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* ===== Normalized market identity ===== */
    v_country_code TEXT;

    /* ===== Pricing market being reviewed ===== */
    v_pricing_market public.pricing_markets%ROWTYPE;

    /* ===== Readiness counters ===== */
    v_profile_count INTEGER;
    v_active_profile_count INTEGER;
    v_draft_profile_count INTEGER;
    v_active_profile_rate_count INTEGER;
    v_schedule_count INTEGER;
    v_tax_rule_count INTEGER;
    v_rounding_rule_count INTEGER;

BEGIN
    /* ===== Normalize input ===== */
    v_country_code := UPPER(TRIM(p_country_code));


    /* ===== Required country code ===== */
    IF p_country_code IS NULL OR v_country_code = '' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing-market country code is required.';
    END IF;


    /* ===== Validate country-code format ===== */
    IF v_country_code !~ '^[A-Z]{2}$' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing-market country code is invalid.';
    END IF;

    /* ===== Lock pricing-market family ===== */
    PERFORM pg_advisory_xact_lock(
        hashtextextended('pricing_market|' || v_country_code, 0)
    );


    /* ===== Load and lock pricing market ===== */
    SELECT pricing_market.*
    INTO v_pricing_market
    FROM public.pricing_markets AS pricing_market
    WHERE pricing_market.country_code = v_country_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing market could not be found.';
    END IF;


    /* ===== Validate current market state ===== */
    IF v_pricing_market.configuration_status <> 'review_required' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only a pricing market that requires review can be marked ready.';
    END IF;


    /* ===== Pricing must remain disabled during review ===== */
    IF v_pricing_market.pricing_enabled THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing must remain disabled while the pricing market is under review.';
    END IF;


    /* ===== Planned effective date must exist ===== */
    IF v_pricing_market.planned_effective_from IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing market does not have a planned effective date.';
    END IF;

    /* ===== Count pricing profiles ===== */
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'active'),
        COUNT(*) FILTER (WHERE status = 'draft')
    INTO
        v_profile_count,
        v_active_profile_count,
        v_draft_profile_count
    FROM public.pricing_profiles
    WHERE country_code = v_country_code;


    /* ===== Validate pricing profile readiness ===== */
    IF v_profile_count <> 5 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing market must contain exactly five pricing profiles.';
    END IF;

    IF v_active_profile_count <> 5 OR v_draft_profile_count <> 0 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'All five pricing profiles must be approved and no pricing-profile drafts may remain.';
    END IF;


    /* ===== Count rates for approved pricing profiles ===== */
    SELECT COUNT(*)
    INTO v_active_profile_rate_count
    FROM public.pricing_rates AS pricing_rate
    JOIN public.pricing_profiles AS pricing_profile
        ON pricing_profile.id = pricing_rate.pricing_profile_id
    WHERE pricing_profile.country_code = v_country_code
    AND pricing_profile.status = 'active';


    /* ===== Validate pricing rates ===== */
    IF v_active_profile_rate_count <> 5 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'All five approved pricing profiles must contain pricing rates.';
    END IF;

    /* ===== Count weekly schedule rows ===== */
    SELECT COUNT(*)
    INTO v_schedule_count
    FROM public.pricing_schedules
    WHERE country_code = v_country_code
    AND service_category = v_pricing_market.service_category;


    /* ===== Validate weekly schedule ===== */
    IF v_schedule_count <> 17 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing market must contain exactly seventeen weekly schedule rows.';
    END IF;

    /* ===== Count approved terminal tax rules ===== */
    SELECT COUNT(*)
    INTO v_tax_rule_count
    FROM public.tax_rules
    WHERE country_code = v_country_code
    AND service_category = v_pricing_market.service_category
    AND status = 'active'
    AND effective_until IS NULL;


    /* ===== Validate tax-rule readiness ===== */
    IF v_tax_rule_count <> 1 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing market must contain exactly one approved open-ended tax rule.';
    END IF;

    /* ===== Count approved terminal currency rounding rules ===== */
    SELECT COUNT(*)
    INTO v_rounding_rule_count
    FROM public.currency_rounding_rules
    WHERE country_code = v_country_code
    AND currency_code = v_pricing_market.currency_code
    AND status = 'active'
    AND effective_until IS NULL;


    /* ===== Validate currency rounding readiness ===== */
    IF v_rounding_rule_count <> 1 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing market must contain exactly one approved open-ended currency rounding rule.';
    END IF;

    /* ===== Mark pricing market ready ===== */
    UPDATE public.pricing_markets
    SET
        configuration_status = 'ready',
        pricing_enabled = FALSE
    WHERE id = v_pricing_market.id;

    /*
    * IMPORTANT:
    * Marking the market ready does NOT enable public pricing.
    *
    * Pricing enablement remains a separate administrator action.
    */
    RETURN v_pricing_market.id;

    END;
    $$;


    /* ===== Function permissions ===== */
    /* Browser roles cannot directly approve pricing-market readiness. */
    REVOKE ALL
    ON FUNCTION public.mark_pricing_market_ready(TEXT)
    FROM PUBLIC, anon, authenticated;

    /* Trusted Next.js server operations use service_role. */
    GRANT EXECUTE
    ON FUNCTION public.mark_pricing_market_ready(TEXT)
    TO service_role;

    /* ===== Function documentation ===== */
    COMMENT ON FUNCTION public.mark_pricing_market_ready(TEXT)
    IS 'Marks a review-required pricing market ready only after validating five active pricing profiles with rates, seventeen weekly schedule rows, one approved terminal tax rule and one approved terminal currency rounding rule. Pricing remains disabled.';