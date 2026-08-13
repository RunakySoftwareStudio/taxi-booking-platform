/*
 * Pricing Version - Process 3
 *
 * Allows the first draft of a new pricing-profile family
 * to become active when no active predecessor exists yet.
 *
 * Existing family:
 *
 * V2 active
 * V3 draft
 *     ↓
 * V2 archived
 * V3 active
 *
 * New family:
 *
 * V1 draft
 *     ↓
 * V1 active
 */


CREATE OR REPLACE FUNCTION public.activate_pricing_profile_draft(
    p_pricing_profile_id UUID,
    p_activated_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* Stores the pricing-profile code before locking the family. */
    v_pricing_profile_code TEXT;

    /* Stores the draft that will become active. */
    v_draft_profile public.pricing_profiles%ROWTYPE;

    /* Stores the active predecessor when one exists. */
    v_active_profile public.pricing_profiles%ROWTYPE;

    /*
     * NOW() stays the same throughout this transaction.
     *
     * When an old active version exists, both versions therefore
     * receive exactly the same transition timestamp.
     */
    v_activation_time TIMESTAMPTZ := NOW();

    /* Used to verify that the draft contains pricing rates. */
    v_rate_exists BOOLEAN;

BEGIN
    /* Both IDs are required. */
    IF p_pricing_profile_id IS NULL
        OR p_activated_by_user_id IS NULL
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing profile ID and administrator user ID are required.';
    END IF;


    /* Load the profile-family code. */
    SELECT pricing_profile.pricing_profile_code
    INTO v_pricing_profile_code
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_pricing_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing profile could not be found.';
    END IF;


    /*
     * Lock the complete pricing family.
     *
     * This prevents two administrators from activating competing
     * versions of the same family at the same moment.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_pricing_profile_code, 0)
    );


    /* Reload and lock the selected draft. */
    SELECT pricing_profile.*
    INTO v_draft_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_pricing_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing profile could not be found.';
    END IF;


    /* Only draft profiles may be activated. */
    IF v_draft_profile.status <> 'draft' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only a draft pricing profile can be activated.';
    END IF;


    /* A complete pricing-rates record must exist. */
    SELECT EXISTS (
        SELECT 1
        FROM public.pricing_rates AS pricing_rate
        WHERE pricing_rate.pricing_profile_id = v_draft_profile.id
    )
    INTO v_rate_exists;

    IF NOT v_rate_exists THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The draft pricing profile does not contain pricing rates.';
    END IF;


    /*
     * Find the currently active version of this family.
     *
     * A brand-new family such as NL_NIGHT_STANDARD V1 does not
     * have an active predecessor yet. That is valid.
     */
    SELECT pricing_profile.*
    INTO v_active_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.pricing_profile_code =
        v_draft_profile.pricing_profile_code
      AND pricing_profile.status = 'active'
    FOR UPDATE;


    /*
     * When an active predecessor exists, validate and archive it.
     *
     * When none exists, this complete block is skipped and the
     * new family's first draft is activated directly.
     */
    IF FOUND THEN

        /* Old and new versions must belong to the same market. */
        IF v_active_profile.country_code <> v_draft_profile.country_code
            OR v_active_profile.currency_code <> v_draft_profile.currency_code
        THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '22023',
                    MESSAGE = 'The draft pricing market does not match the active pricing market.';
        END IF;


        /* Preserve a valid effective period for the old version. */
        IF v_activation_time <= v_active_profile.effective_from THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '22023',
                    MESSAGE = 'The activation time must be later than the active profile effective start.';
        END IF;


        /*
         * Archive the current active version before activating
         * the replacement.
         */
        UPDATE public.pricing_profiles
        SET
            status = 'archived',
            effective_until = v_activation_time,
            archived_by_user_id = p_activated_by_user_id,
            archived_at = v_activation_time
        WHERE id = v_active_profile.id;

    END IF;


    /*
     * Activate the draft.
     *
     * This works both for:
     *
     * - Version 1 of a brand-new family;
     * - a replacement version of an existing family.
     */
    UPDATE public.pricing_profiles
    SET
        status = 'active',
        effective_from = v_activation_time,
        effective_until = NULL,
        activated_by_user_id = p_activated_by_user_id,
        archived_by_user_id = NULL,
        activated_at = v_activation_time,
        archived_at = NULL
    WHERE id = v_draft_profile.id;


    /* Return the activated profile UUID for the Next.js redirect. */
    RETURN v_draft_profile.id;

END;
$$;


/* Browser roles cannot perform this financial transition. */
REVOKE ALL
ON FUNCTION public.activate_pricing_profile_draft(UUID, UUID)
FROM PUBLIC, anon, authenticated;


/* Trusted Next.js server operations use service_role. */
GRANT EXECUTE
ON FUNCTION public.activate_pricing_profile_draft(UUID, UUID)
TO service_role;


COMMENT ON FUNCTION public.activate_pricing_profile_draft(UUID, UUID)
IS 'Activates one draft pricing profile and archives the previous active version when one exists.';