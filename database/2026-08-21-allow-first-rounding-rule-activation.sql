
/* ================================================================================================================
   ALLOW FIRST CURRENCY-ROUNDING-RULE ACTIVATION

   Purpose:
   Allows the first approved currency rounding rule of a brand-new
   country/currency family to be activated without requiring an
   existing predecessor.

   Existing rounding-rule families keep the original append-only
   behavior: the previous open-ended approved rule is closed exactly
   when the newly approved rule begins.
==================================================================================================================== */

CREATE OR REPLACE FUNCTION public.activate_currency_rounding_rule_draft(
    p_rounding_rule_id UUID,
    p_activated_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* The draft that will become approved/active. */
    v_rounding_rule public.currency_rounding_rules%ROWTYPE;

    /*
     * The latest approved rounding rule in this country/currency
     * family, when one already exists.
     */
    v_latest_active_rounding_rule public.currency_rounding_rules%ROWTYPE;

BEGIN
    /* Both IDs are required. */
    IF p_rounding_rule_id IS NULL
        OR p_activated_by_user_id IS NULL
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Rounding rule ID and activating administrator user ID are required.';
    END IF;


    /*
     * Load the draft first so we know which country/currency
     * family must be locked.
     */
    SELECT rounding_rule.*
    INTO v_rounding_rule
    FROM public.currency_rounding_rules AS rounding_rule
    WHERE rounding_rule.id = p_rounding_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The currency rounding rule could not be found.';
    END IF;


    /* Lock the complete country/currency family. */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            v_rounding_rule.country_code || '|' || v_rounding_rule.currency_code,
            0
        )
    );


    /* Reload and lock the exact draft after obtaining the family lock. */
    SELECT rounding_rule.*
    INTO v_rounding_rule
    FROM public.currency_rounding_rules AS rounding_rule
    WHERE rounding_rule.id = p_rounding_rule_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The currency rounding rule could not be found.';
    END IF;


    /* Only an unfinished draft may be activated. */
    IF v_rounding_rule.status <> 'draft' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only a draft currency rounding rule can be activated.';
    END IF;


    /* This lifecycle supports only a new open-ended terminal rule. */
    IF v_rounding_rule.effective_until IS NOT NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'A newly activated terminal rounding rule must have no effective-until date.';
    END IF;


    /* Normal activation must not create a rule retroactively. */
    IF v_rounding_rule.effective_from <= NOW() THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The new rounding rule effective-from date must be in the future.';
    END IF;


    /*
     * Find and lock the latest approved rule in this
     * country/currency family.
     *
     * For a brand-new country/currency family, no predecessor
     * exists. That is valid.
     */
    SELECT active_rounding_rule.*
    INTO v_latest_active_rounding_rule
    FROM public.currency_rounding_rules AS active_rounding_rule
    WHERE active_rounding_rule.country_code = v_rounding_rule.country_code
      AND active_rounding_rule.currency_code = v_rounding_rule.currency_code
      AND active_rounding_rule.status = 'active'
    ORDER BY active_rounding_rule.effective_from DESC
    LIMIT 1
    FOR UPDATE;


    /*
     * Existing family:
     * validate and close the previous approved terminal rule.
     *
     * Brand-new family:
     * FOUND is false, so this complete block is skipped.
     */
    IF FOUND THEN

        /* The latest approved rule must be open-ended. */
        IF v_latest_active_rounding_rule.effective_until IS NOT NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '22023',
                    MESSAGE = 'The latest approved currency rounding rule is not open-ended.';
        END IF;


        /*
         * Append-only protection.
         *
         * The new rule must start strictly after the latest
         * approved rule started.
         */
        IF v_rounding_rule.effective_from <= v_latest_active_rounding_rule.effective_from THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '22023',
                    MESSAGE = 'The new currency rounding rule must start after the latest approved rule.';
        END IF;


        /*
         * Close the previous approved terminal rule exactly when
         * the newly approved rule begins.
         */
        UPDATE public.currency_rounding_rules
        SET effective_until = v_rounding_rule.effective_from
        WHERE id = v_latest_active_rounding_rule.id;

    END IF;


    /*
     * Approve the draft.
     *
     * effective_from remains unchanged because it determines when
     * journeys begin using this rounding rule.
     *
     * activated_at records when the administrator approved it.
     */
    UPDATE public.currency_rounding_rules
    SET
        status = 'active',
        activated_by_user_id = p_activated_by_user_id,
        activated_at = NOW()
    WHERE id = p_rounding_rule_id;


    /* Return the activated rounding-rule UUID. */
    RETURN p_rounding_rule_id;

END;
$$;


/* Browser roles cannot directly activate financial configuration. */
REVOKE ALL
ON FUNCTION public.activate_currency_rounding_rule_draft(UUID, UUID)
FROM PUBLIC, anon, authenticated;


/* Trusted Next.js server operations use service_role. */
GRANT EXECUTE
ON FUNCTION public.activate_currency_rounding_rule_draft(UUID, UUID)
TO service_role;


COMMENT ON FUNCTION public.activate_currency_rounding_rule_draft(UUID, UUID)
IS 'Activates a terminal currency rounding-rule draft. Supports the first approved rule of a new country/currency family and atomically closes the previous approved terminal rule when one exists.';