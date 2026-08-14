/*
 * Pricing Version - Pricing lifecycle correction
 *
 * Cancels one unfinished pricing-profile draft.
 *
 * Safety rules:
 *
 * - only status = draft may be deleted;
 * - active and archived versions can never be cancelled;
 * - a draft referenced by a journey quote cannot be deleted;
 * - pricing_rates are removed automatically through ON DELETE CASCADE;
 * - the complete pricing family is locked during cancellation.
 */

CREATE OR REPLACE FUNCTION public.cancel_pricing_profile_draft(
    p_pricing_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_pricing_profile public.pricing_profiles%ROWTYPE;
BEGIN
    /* A pricing-profile ID is required. */
    IF p_pricing_profile_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing profile ID is required.';
    END IF;


    /*
     * Load the profile first so we know which pricing family
     * must be locked.
     */
    SELECT pricing_profile.*
    INTO v_pricing_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_pricing_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing profile could not be found.';
    END IF;


    /* Lock the complete pricing-profile family. */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_pricing_profile.pricing_profile_code, 0)
    );


    /*
     * Reload and lock the selected profile after obtaining
     * the family lock.
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


    /* Only unfinished drafts may be cancelled. */
    IF v_pricing_profile.status <> 'draft' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only a draft pricing profile can be cancelled.';
    END IF;


    /*
     * A pricing version already referenced by a journey quote
     * must remain available for financial history.
     *
     * The foreign key also uses ON DELETE RESTRICT, but this
     * explicit check gives a clearer financial-domain error.
     */
    IF EXISTS (
        SELECT 1
        FROM public.journey_quotes AS journey_quote
        WHERE journey_quote.pricing_profile_id = p_pricing_profile_id
    ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = 'This pricing draft is already referenced by a journey quote and cannot be cancelled.';
    END IF;


    /*
     * Delete the draft profile.
     *
     * Its pricing_rates row is deleted automatically because
     * pricing_rates.pricing_profile_id uses ON DELETE CASCADE.
     */
    DELETE FROM public.pricing_profiles
    WHERE id = p_pricing_profile_id;

    RETURN p_pricing_profile_id;
END;
$$;


/* Browser roles cannot cancel financial configuration directly. */
REVOKE ALL
ON FUNCTION public.cancel_pricing_profile_draft(UUID)
FROM PUBLIC, anon, authenticated;


/* Trusted Next.js server operations use service_role. */
GRANT EXECUTE
ON FUNCTION public.cancel_pricing_profile_draft(UUID)
TO service_role;


COMMENT ON FUNCTION public.cancel_pricing_profile_draft(UUID)
IS 'Safely deletes one unfinished pricing-profile draft while preserving active, archived and quoted financial versions.';