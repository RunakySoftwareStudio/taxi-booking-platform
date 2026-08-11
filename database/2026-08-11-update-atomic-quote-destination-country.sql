/*
================================================================
VOYA TAXI - UPDATE ATOMIC QUOTE CREATION

Purpose:

Extend atomic journey quote creation with the destination country.

The existing country_code remains the pricing/pickup country.

Example:

    country_code = NL
    destination_country_code = BE

means:

    NL → BE international journey

The previous function signature remains temporarily available
until the application route has been updated and tested.
================================================================
*/

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

    p_quote_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN

    /*
        STEP 1: VALIDATE REQUIRED FINANCIAL REFERENCES
    */

    IF p_booking_session_id IS NULL THEN
        RAISE EXCEPTION 'Booking session ID is required.';
    END IF;

    IF p_pricing_profile_id IS NULL THEN
        RAISE EXCEPTION 'Pricing profile ID is required.';
    END IF;

    IF p_tax_rule_id IS NULL THEN
        RAISE EXCEPTION 'Tax rule ID is required.';
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
        STEP 2: REQUIRE CALCULATION ITEMS
    */

    IF p_quote_items IS NULL
        OR jsonb_typeof(p_quote_items) <> 'array'
        OR jsonb_array_length(p_quote_items) = 0 THEN
            RAISE EXCEPTION 'Journey quote calculation items are required.';
    END IF;


    /*
        STEP 3: LOCK THIS BOOKING SESSION
    */

    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_booking_session_id::TEXT, 0)
    );


    /*
        STEP 4: INSERT JOURNEY QUOTE HEADER
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

        p_country_code,
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
        STEP 5: INSERT JOURNEY QUOTE ITEMS
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
        STEP 6: VOID OTHER ACTIVE QUOTES
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


/*
================================================================
SECURITY
================================================================
*/

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
    JSONB
)
TO service_role;


/*
================================================================
END: UPDATE ATOMIC QUOTE CREATION
================================================================
*/