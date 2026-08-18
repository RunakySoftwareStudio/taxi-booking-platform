/* ============================================================
   ATOMIC JOURNEY QUOTE CREATION WITH TAX ALLOCATIONS

   Purpose:
   Extends atomic quote creation so one transaction stores:

       journey_quotes
       journey_quote_items
       journey_quote_tax_allocations

   Domestic journey:
       one tax allocation
       quote header may keep tax_rule_id + tax_rate_percentage

   Multi-country journey:
       several tax allocations
       quote header tax_rule_id + tax_rate_percentage are NULL

   Important:
   The previous RPC signature remains temporarily available so
   the currently deployed application continues working while
   the new application version is prepared and deployed.
============================================================ */

CREATE OR REPLACE FUNCTION public.create_journey_quote_with_items(
    p_quote_id UUID,
    p_booking_session_id UUID,

    p_pricing_profile_id UUID,
    p_tax_rule_id UUID,
    p_rounding_rule_id UUID,

    p_pricing_calculation_version INTEGER,
    p_booking_data_fingerprint TEXT,

    p_pricing_profile_code TEXT,
    p_pricing_profile_version INTEGER,

    p_country_code TEXT,
    p_destination_country_code TEXT,
    p_currency_code TEXT,

    p_distance_km NUMERIC,
    p_estimated_duration_minutes NUMERIC,

    p_tax_rate_percentage NUMERIC,

    p_basic_fare_excluding_vat NUMERIC,
    p_vat_amount NUMERIC,
    p_total_including_vat_before_rounding NUMERIC,
    p_final_total_including_vat NUMERIC,

    p_created_at TIMESTAMPTZ,
    p_expires_at TIMESTAMPTZ,

    p_quote_items JSONB,
    p_tax_allocations JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tax_allocation_count INTEGER;

    v_allocated_fare_total NUMERIC;
    v_allocated_vat_total NUMERIC;
    v_allocated_including_vat_total NUMERIC;
BEGIN

    /*
     * STEP 1: VALIDATE REQUIRED QUOTE INFORMATION
     */

    IF p_booking_session_id IS NULL THEN
        RAISE EXCEPTION 'Booking session ID is required.';
    END IF;

    IF p_pricing_profile_id IS NULL THEN
        RAISE EXCEPTION 'Pricing profile ID is required.';
    END IF;

    IF p_rounding_rule_id IS NULL THEN
        RAISE EXCEPTION 'Rounding rule ID is required.';
    END IF;

    IF p_booking_data_fingerprint IS NULL
        OR LENGTH(TRIM(p_booking_data_fingerprint)) = 0 THEN
            RAISE EXCEPTION 'Booking data fingerprint is required.';
    END IF;

    IF p_destination_country_code IS NULL
        OR LENGTH(TRIM(p_destination_country_code)) = 0 THEN
            RAISE EXCEPTION 'Destination country code is required.';
    END IF;


    /*
     * STEP 2: REQUIRE COMMERCIAL QUOTE ITEMS
     */

    IF p_quote_items IS NULL
        OR jsonb_typeof(p_quote_items) <> 'array'
        OR jsonb_array_length(p_quote_items) = 0 THEN
            RAISE EXCEPTION 'Journey quote calculation items are required.';
    END IF;


    /*
     * STEP 3: REQUIRE COUNTRY TAX ALLOCATIONS
     *
     * Every new quote uses the same financial snapshot model:
     *
     * Domestic:
     *     1 allocation
     *
     * Cross-border:
     *     2 or more allocations
     */

    IF p_tax_allocations IS NULL
        OR jsonb_typeof(p_tax_allocations) <> 'array'
        OR jsonb_array_length(p_tax_allocations) = 0 THEN
            RAISE EXCEPTION 'Journey quote tax allocations are required.';
    END IF;

    v_tax_allocation_count := jsonb_array_length(p_tax_allocations);


    /*
     * A domestic/single-country quote may use the convenient
     * single-tax fields on journey_quotes.
     */

    IF v_tax_allocation_count = 1 THEN
        IF p_tax_rule_id IS NULL THEN
            RAISE EXCEPTION 'Single-country quote tax rule ID is required.';
        END IF;

        IF p_tax_rate_percentage IS NULL THEN
            RAISE EXCEPTION 'Single-country quote tax rate is required.';
        END IF;
    END IF;


    /*
     * A multi-country quote does not have one truthful tax rule
     * or one truthful VAT percentage at quote-header level.
     */

    IF v_tax_allocation_count > 1 THEN
        IF p_tax_rule_id IS NOT NULL THEN
            RAISE EXCEPTION 'Multi-country quote tax rule ID must be NULL.';
        END IF;

        IF p_tax_rate_percentage IS NOT NULL THEN
            RAISE EXCEPTION 'Multi-country quote tax rate must be NULL.';
        END IF;
    END IF;


    /*
     * STEP 4: LOCK THE BOOKING SESSION
     *
     * Only one quote-creation transaction may modify the same
     * unfinished booking session at a time.
     */

    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_booking_session_id::TEXT, 0)
    );


    /*
     * STEP 5: INSERT JOURNEY QUOTE HEADER
     *
     * journey_quotes stores WHAT the complete quote is.
     */

    INSERT INTO public.journey_quotes (
        quote_id,
        booking_session_id,

        pricing_profile_id,
        tax_rule_id,
        rounding_rule_id,

        pricing_calculation_version,
        booking_data_fingerprint,

        pricing_profile_code,
        pricing_profile_version,

        country_code,
        destination_country_code,
        currency_code,

        distance_km,
        estimated_duration_minutes,

        tax_rate_percentage,

        basic_fare_excluding_vat,
        vat_amount,
        total_including_vat_before_rounding,
        final_total_including_vat,

        created_at,
        expires_at
    )
    VALUES (
        p_quote_id,
        p_booking_session_id,

        p_pricing_profile_id,
        p_tax_rule_id,
        p_rounding_rule_id,

        p_pricing_calculation_version,
        p_booking_data_fingerprint,

        p_pricing_profile_code,
        p_pricing_profile_version,

        UPPER(TRIM(p_country_code)),
        UPPER(TRIM(p_destination_country_code)),
        p_currency_code,

        p_distance_km,
        p_estimated_duration_minutes,

        p_tax_rate_percentage,

        p_basic_fare_excluding_vat,
        p_vat_amount,
        p_total_including_vat_before_rounding,
        p_final_total_including_vat,

        p_created_at,
        p_expires_at
    );


    /*
     * STEP 6: INSERT JOURNEY QUOTE ITEMS
     *
     * journey_quote_items explains WHAT created the fare.
     *
     * For multi-country quotes the item-level VAT fields may
     * legitimately be NULL.
     */

    INSERT INTO public.journey_quote_items (
        quote_id,
        item_code,
        description,
        quantity,
        unit,
        unit_amount_excluding_vat,
        amount_excluding_vat,
        vat_rate_percentage,
        vat_amount,
        amount_including_vat,
        calculation_order
    )
    SELECT
        p_quote_id,
        quote_item.item_code,
        quote_item.description,
        quote_item.quantity,
        quote_item.unit,
        quote_item.unit_amount_excluding_vat,
        quote_item.amount_excluding_vat,
        quote_item.vat_rate_percentage,
        quote_item.vat_amount,
        quote_item.amount_including_vat,
        quote_item.calculation_order
    FROM jsonb_to_recordset(p_quote_items) AS quote_item (
        item_code TEXT,
        description TEXT,
        quantity NUMERIC(12, 4),
        unit TEXT,
        unit_amount_excluding_vat NUMERIC(12, 4),
        amount_excluding_vat NUMERIC(12, 4),
        vat_rate_percentage NUMERIC(5, 2),
        vat_amount NUMERIC(12, 4),
        amount_including_vat NUMERIC(12, 4),
        calculation_order INTEGER
    );


    /*
     * STEP 7: INSERT COUNTRY TAX ALLOCATIONS
     *
     * journey_quote_tax_allocations explains WHERE the fare
     * was allocated for tax.
     *
     * quote_id is never trusted from JSON. PostgreSQL attaches
     * every allocation to p_quote_id.
     */

    INSERT INTO public.journey_quote_tax_allocations (
        quote_id,
        country_code,
        tax_rule_id,
        distance_km,
        allocated_fare_excluding_vat,
        tax_rate_percentage,
        vat_amount,
        amount_including_vat
    )
    SELECT
        p_quote_id,
        UPPER(TRIM(tax_allocation.country_code)),
        tax_allocation.tax_rule_id,
        tax_allocation.distance_km,
        tax_allocation.allocated_fare_excluding_vat,
        tax_allocation.tax_rate_percentage,
        tax_allocation.vat_amount,
        tax_allocation.amount_including_vat
    FROM jsonb_to_recordset(p_tax_allocations) AS tax_allocation (
        country_code TEXT,
        tax_rule_id UUID,
        distance_km NUMERIC(10, 3),
        allocated_fare_excluding_vat NUMERIC(12, 4),
        tax_rate_percentage NUMERIC(5, 2),
        vat_amount NUMERIC(12, 4),
        amount_including_vat NUMERIC(12, 4)
    );


    /*
     * STEP 8: VERIFY TAX-ALLOCATION TOTALS
     *
     * The tax allocations must reconstruct the financial totals
     * stored on the journey quote header.
     */

    SELECT
        COALESCE(SUM(allocated_fare_excluding_vat), 0),
        COALESCE(SUM(vat_amount), 0),
        COALESCE(SUM(amount_including_vat), 0)
    INTO
        v_allocated_fare_total,
        v_allocated_vat_total,
        v_allocated_including_vat_total
    FROM public.journey_quote_tax_allocations
    WHERE quote_id = p_quote_id;


    IF v_allocated_fare_total <> p_basic_fare_excluding_vat THEN
        RAISE EXCEPTION
            'Tax allocations do not match the journey fare excluding VAT.';
    END IF;

    IF v_allocated_vat_total <> p_vat_amount THEN
        RAISE EXCEPTION
            'Tax allocations do not match the total journey VAT.';
    END IF;

    IF v_allocated_including_vat_total
        <> p_total_including_vat_before_rounding THEN
            RAISE EXCEPTION
                'Tax allocations do not match the journey total before final rounding.';
    END IF;


    /*
     * For a single-country quote, verify that the allocation
     * agrees with the convenient single-tax header fields.
     */

    IF v_tax_allocation_count = 1
        AND NOT EXISTS (
            SELECT 1
            FROM public.journey_quote_tax_allocations allocation
            WHERE allocation.quote_id = p_quote_id
              AND allocation.tax_rule_id = p_tax_rule_id
              AND allocation.tax_rate_percentage = p_tax_rate_percentage
        ) THEN
            RAISE EXCEPTION
                'Single-country tax allocation does not match the quote tax header.';
    END IF;


    /*
     * STEP 9: VOID OTHER ACTIVE QUOTES
     *
     * The newly created quote remains active.
     */

    UPDATE public.journey_quotes
    SET
        status = 'voided',
        voided_at = clock_timestamp()
    WHERE
        booking_session_id = p_booking_session_id
        AND quote_id <> p_quote_id
        AND status = 'active';

END;
$$;


/* ============================================================
   SECURITY

   This new overload contains one additional JSONB parameter:
   p_tax_allocations.

   The old overload remains temporarily available until the new
   application version has been deployed.
============================================================ */

REVOKE ALL
ON FUNCTION public.create_journey_quote_with_items(
    UUID,
    UUID,
    UUID,
    UUID,
    UUID,
    INTEGER,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    TEXT,
    TEXT,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    TIMESTAMPTZ,
    TIMESTAMPTZ,
    JSONB,
    JSONB
)
FROM PUBLIC, anon, authenticated;


GRANT EXECUTE
ON FUNCTION public.create_journey_quote_with_items(
    UUID,
    UUID,
    UUID,
    UUID,
    UUID,
    INTEGER,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    TEXT,
    TEXT,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    TIMESTAMPTZ,
    TIMESTAMPTZ,
    JSONB,
    JSONB
)
TO service_role;