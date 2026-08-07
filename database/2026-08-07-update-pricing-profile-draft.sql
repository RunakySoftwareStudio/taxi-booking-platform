/* ============================================================
   VOYA TAXI — UPDATE PRICING PROFILE DRAFT

   PURPOSE

   Updates editable values belonging to one draft pricing profile.

   Editable:
   - pricing profile name
   - quote validity
   - base fare
   - distance rate per kilometre
   - duration rate per minute
   - minimum fare

   Not editable here:
   - pricing profile code
   - version
   - country
   - currency
   - status
   - VAT rule
   - currency rounding rule

   IMPORTANT RULE

       draft     → editable
       active    → read-only
       archived  → read-only

   The profile and pricing_rates updates happen inside the same
   PostgreSQL function call.

   Therefore:

       update pricing_profiles
                +
       update pricing_rates
                ↓
       both succeed or both are rolled back
============================================================ */

BEGIN;


/* ============================================================
   UPDATE PRICING PROFILE DRAFT FUNCTION
============================================================ */

CREATE OR REPLACE FUNCTION public.update_pricing_profile_draft(
    p_pricing_profile_id UUID,
    p_pricing_profile_name TEXT,
    p_quote_validity_minutes INTEGER,
    p_base_fare_excluding_vat NUMERIC,
    p_distance_rate_per_km_excluding_vat NUMERIC,
    p_duration_rate_per_minute_excluding_vat NUMERIC,
    p_minimum_fare_excluding_vat NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* Stores the draft profile while it is being updated. */
    v_pricing_profile public.pricing_profiles%ROWTYPE;
BEGIN
    /* The profile ID is required. */
    IF p_pricing_profile_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing profile ID is required.';
    END IF;


    /*
     * Lock the pricing profile during the update.
     *
     * This prevents two simultaneous save requests from changing
     * the same draft at exactly the same time.
     */
    SELECT pricing_profile.*
    INTO v_pricing_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_pricing_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing profile could not be found.';
    END IF;


    /*
     * Only draft profiles may be edited.
     *
     * Active and archived financial versions are historical records and must remain unchanged.
     * Even if somebody somehow submits an active Version 1 ID manually, PostgreSQL itself refuses the update. So our protection will eventually be:
        UI hides edit form
                +
        server action checks admin
                +
        PostgreSQL checks status = draft
                +
        database constraints validate the values
     */
    IF v_pricing_profile.status <> 'draft' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only draft pricing profiles can be edited.';
    END IF;


    /* Profile name must contain real text. */
    IF p_pricing_profile_name IS NULL
        OR LENGTH(TRIM(p_pricing_profile_name)) = 0
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing profile name is required.';
    END IF;


    /* Quote validity must remain between 1 minute and 24 hours. */
    IF p_quote_validity_minutes IS NULL
        OR p_quote_validity_minutes < 1
        OR p_quote_validity_minutes > 1440
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Quote validity must be between 1 and 1440 minutes.';
    END IF;


    /* Monetary values cannot be missing or negative. */
    IF p_base_fare_excluding_vat IS NULL
        OR p_distance_rate_per_km_excluding_vat IS NULL
        OR p_duration_rate_per_minute_excluding_vat IS NULL
        OR p_minimum_fare_excluding_vat IS NULL
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'All pricing rates are required.';
    END IF;

    IF p_base_fare_excluding_vat < 0
        OR p_distance_rate_per_km_excluding_vat < 0
        OR p_duration_rate_per_minute_excluding_vat < 0
        OR p_minimum_fare_excluding_vat < 0
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing rates cannot be negative.';
    END IF;


    /*
     * Update editable profile information.
     *
     * updated_at is handled automatically by the existing
     * pricing_profiles trigger.
     */
    UPDATE public.pricing_profiles
    SET
        pricing_profile_name = TRIM(p_pricing_profile_name),
        quote_validity_minutes = p_quote_validity_minutes
    WHERE id = p_pricing_profile_id;


    /*
     * Update the monetary rates belonging to this exact
     * pricing-profile version.
     *
     * updated_at is handled automatically by the existing
     * pricing_rates trigger.
     */
    UPDATE public.pricing_rates
    SET
        base_fare_excluding_vat = p_base_fare_excluding_vat,
        distance_rate_per_km_excluding_vat = p_distance_rate_per_km_excluding_vat,
        duration_rate_per_minute_excluding_vat = p_duration_rate_per_minute_excluding_vat,
        minimum_fare_excluding_vat = p_minimum_fare_excluding_vat
    WHERE pricing_profile_id = p_pricing_profile_id;


    /*
     * A draft created by our normal workflow must always contain
     * one pricing_rates row.

     * If no rate row was updated, stop the operation instead of
     * leaving an incomplete financial configuration.
     */
    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'Pricing rates for this draft could not be found.';
    END IF;


    /* Return the same profile ID for redirecting after Save. */
    RETURN p_pricing_profile_id;
END;
$$;


/* ============================================================
   FUNCTION PERMISSIONS

   The browser must not call this financial function directly.

   The Next.js server action will first execute:

       const adminUser = await requireAdminUser();

   Only after the administrator has been verified will
   supabaseAdmin call this PostgreSQL function.
============================================================ */

REVOKE ALL
ON FUNCTION public.update_pricing_profile_draft(
    UUID,
    TEXT,
    INTEGER,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.update_pricing_profile_draft(
    UUID,
    TEXT,
    INTEGER,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC
)
TO service_role;


COMMENT ON FUNCTION public.update_pricing_profile_draft(
    UUID,
    TEXT,
    INTEGER,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC
)
IS 'Atomically updates the editable profile and monetary rates of one draft pricing version.';


COMMIT;