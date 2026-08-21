
/* ================================================================================================================
   ALLOW FIRST TAX-RULE ACTIVATION

   Purpose:
   Allows the first approved tax rule of a brand-new country/service
   family to be activated without requiring an existing predecessor.

   Existing tax-rule families keep the original append-only behavior:
   the previous open-ended approved rule is closed exactly when the
   newly approved rule begins.
==================================================================================================================== */

CREATE OR REPLACE FUNCTION public.activate_tax_rule_draft(
    p_tax_rule_id UUID,
    p_activated_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* The draft that will become approved/active. */
    v_tax_rule public.tax_rules%ROWTYPE;

    /*
     * The latest approved tax rule in this country/service family,
     * when one already exists.
     */
    v_latest_active_tax_rule public.tax_rules%ROWTYPE;

BEGIN
    /* A tax-rule ID is required. */
    IF p_tax_rule_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Tax rule ID is required.';
    END IF;


    /* The activating administrator is required for financial audit history. */
    IF p_activated_by_user_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Activated-by user ID is required.';
    END IF;


    /*
     * Load the draft first so we know which country/service
     * tax family must be locked.
     */
    SELECT tax_rule.*
    INTO v_tax_rule
    FROM public.tax_rules AS tax_rule
    WHERE tax_rule.id = p_tax_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The tax rule could not be found.';
    END IF;


    /*
     * Lock the complete tax-rule family.
     *
     * Example:
     * BE|passenger_transport
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            v_tax_rule.country_code || '|' || v_tax_rule.service_category,
            0
        )
    );


    /* Reload and lock the exact draft after obtaining the family lock. */
    SELECT tax_rule.*
    INTO v_tax_rule
    FROM public.tax_rules AS tax_rule
    WHERE tax_rule.id = p_tax_rule_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The tax rule could not be found.';
    END IF;


    /* Only an unfinished draft may be activated. */
    IF v_tax_rule.status <> 'draft' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only a draft tax rule can be activated.';
    END IF;


    /*
     * This lifecycle supports only an open-ended new terminal rule.
     */
    IF v_tax_rule.effective_until IS NOT NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'A newly activated terminal tax rule must have no effective-until date.';
    END IF;


    /*
     * Normal lifecycle activation must not create a tax rule
     * retroactively.
     */
    IF v_tax_rule.effective_from <= NOW() THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The new tax rule effective-from date must be in the future.';
    END IF;


    /*
     * Find and lock the latest approved rule in this tax family.
     *
     * For a brand-new country/service family, no predecessor exists.
     * That is valid and the first draft can be approved directly.
     */
    SELECT active_tax_rule.*
    INTO v_latest_active_tax_rule
    FROM public.tax_rules AS active_tax_rule
    WHERE active_tax_rule.country_code = v_tax_rule.country_code
      AND active_tax_rule.service_category = v_tax_rule.service_category
      AND active_tax_rule.status = 'active'
    ORDER BY active_tax_rule.effective_from DESC
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

        /*
         * The latest approved rule must be the open-ended
         * terminal rule.
         */
        IF v_latest_active_tax_rule.effective_until IS NOT NULL THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '22023',
                    MESSAGE = 'The latest approved tax rule is not open-ended.';
        END IF;


        /*
         * Append-only protection.
         *
         * The new rule must begin strictly after the latest
         * approved rule began.
         */
        IF v_tax_rule.effective_from <= v_latest_active_tax_rule.effective_from THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '22023',
                    MESSAGE = 'The new tax rule must start after the latest approved tax rule.';
        END IF;


        /*
         * Close the previous approved terminal rule exactly
         * where the new approved rule begins.
         */
        UPDATE public.tax_rules
        SET effective_until = v_tax_rule.effective_from
        WHERE id = v_latest_active_tax_rule.id;

    END IF;


    /*
     * Approve the draft.
     *
     * effective_from remains unchanged:
     * it determines when journeys begin using the rule.
     *
     * activated_at records when the administrator approved it.
     */
    UPDATE public.tax_rules
    SET
        status = 'active',
        activated_by_user_id = p_activated_by_user_id,
        activated_at = NOW()
    WHERE id = p_tax_rule_id;


    /* Return the activated tax-rule UUID to the Next.js workflow. */
    RETURN p_tax_rule_id;

END;
$$;


/* Browser roles cannot directly activate financial configuration. */
REVOKE ALL
ON FUNCTION public.activate_tax_rule_draft(UUID, UUID)
FROM PUBLIC, anon, authenticated;


/* Trusted Next.js server operations use service_role. */
GRANT EXECUTE
ON FUNCTION public.activate_tax_rule_draft(UUID, UUID)
TO service_role;


COMMENT ON FUNCTION public.activate_tax_rule_draft(UUID, UUID)
IS 'Activates a terminal tax-rule draft. Supports the first approved rule of a new tax family and atomically closes the previous approved terminal rule when one exists.';