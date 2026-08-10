/*
================================================================
VOYA TAXI - ATOMIC JOURNEY QUOTE CREATION

Purpose:

Create one complete temporary journey quote atomically.

The operation includes:

    1. Lock the unfinished booking session.
    2. Insert the journey quote header.
    3. Insert all journey quote calculation items.
    4. Void other active quotes from the same booking session.

If any step fails, PostgreSQL rolls back the complete transaction.

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

        Some database columns remain nullable for compatibility
        with older quotes.

        New quotes created through this function must contain
        the complete pricing configuration identity.
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


    /*
        STEP 2: REQUIRE CALCULATION ITEMS

        A complete journey quote must contain at least
        one calculation item.
        jsonb_array_length(p_quote_items) = Count how many items are inside the JSON array p_quote_items.
    */

    IF p_quote_items IS NULL
        OR jsonb_typeof(p_quote_items) <> 'array'
        OR jsonb_array_length(p_quote_items) = 0 THEN
            RAISE EXCEPTION 'Journey quote calculation items are required.';
    END IF;


    /*
        STEP 3: LOCK THE BOOKING SESSION
        “Create a lock number from this booking-session ID and lock that session until this transaction finishes.”
        Only one quote-creation/replacement operation for the same
        unfinished booking session may proceed at one time.

        Example:
        Session A → locked by transaction 1
        Session A → transaction 2 waits
        Session B → may continue independently
        ::TEXT means convert the UUID into text. like bookingSessionId.ToString()
        The xact means transaction-level lock. When the transaction ends: the lock is released by COMMIT or ROLLBACK.
    */

    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_booking_session_id::TEXT, 0)
    );


    /*
        STEP 4: INSERT JOURNEY QUOTE HEADER

        journey_quotes stores WHAT the complete quote is.
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

        journey_quote_items stores HOW the quote
        was calculated.

        We do not trust quote_id from the JSON.
        PostgreSQL attaches every item to p_quote_id.
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

        Because this booking session is locked, another
        quote-creation transaction for the same session
        cannot run at the same time.

        The newly created quote remains active.
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

Financial quote creation is server-only.

PUBLIC, anon and authenticated users cannot execute
this function directly.

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
END: ATOMIC JOURNEY QUOTE CREATION
================================================================
*/