/*
 * VOYA TAXI - ACTIVATE TAX-RULE DRAFT
 *
 * Purpose:
 * Approves one tax-rule draft and appends it to the end of the
 * existing approved tax timeline.
 *
 * IMPORTANT TAX-RULE SEMANTICS
 *
 * status = active
 *     means the tax rule is approved financial configuration.
 *
 * effective_from / effective_until
 *     determine for which journey timestamp the approved rule applies.
 *
 * Therefore a future tax rule may be activated today while an older
 * active rule remains applicable until the future effective boundary.
 *
 * The most important part is the order:
 *
 * 1. Lock tax family
 * 2. Lock draft
 * 3. Lock latest active rule
 * 4. Close old period
 * 5. Activate new period

 * Example:
 *
 * Before:
 *
 * BE 6%
 * [2026-01-01 ------------------------------------ infinity)
 *
 * Draft BE 7%
 * [2027-01-01 ------------------------------------ infinity)
 *
 * After activation:
 *
 * BE 6%
 * [2026-01-01 ------------------- 2027-01-01)
 *
 * BE 7%
 *                               [2027-01-01 ------ infinity)
 *
 * The previous rule remains status = active because it is still an
 * approved historical/effective-period rule.
 *
 * SAFE FIRST VERSION
 *
 * This function only appends a new rule to the end of the approved
 * timeline. It does not insert rules into the middle of existing
 * approved periods.
 *
 * The new terminal rule must therefore have:
 *
 *     effective_until = NULL
 */

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
     * The final currently approved tax rule in this
     * country/service timeline.
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


    /* The activating admin user is required for financial audit history. */
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
     *
     * BE|passenger_transport
     *
     * The same family lock is used by tax draft creation,
     * cancellation and activation.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            v_tax_rule.country_code || '|' || v_tax_rule.service_category,
            0
        )
    );


    /*
     * Reload and lock the exact draft after obtaining
     * the family lock.
     */
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
     * This first lifecycle version only supports appending a new
     * terminal rule.
     *
     * A finite effective_until would deliberately create a future
     * gap unless another approved rule already followed it.
     *
     * Inserting rules into the middle of an existing timeline will
     * be handled separately if that capability is needed later.
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
    *
    * Historical corrections should use a separate controlled
    * financial-maintenance process if ever required.
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
     * Multiple status = active rows are valid because each one may
     * represent a different non-overlapping effective period.
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

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'No approved tax rule exists for this country and service family.';
    END IF;


    /*
     * The latest approved rule must currently be the open-ended
     * terminal rule.
     *
     * If it already has an effective_until value while no later
     * approved rule exists, the timeline is incomplete and should
     * be repaired rather than silently extended.
     */
    IF v_latest_active_tax_rule.effective_until IS NOT NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The latest approved tax rule is not open-ended.';
    END IF;


    /*
     * Append-only safety rule.
     *
     * The new rule must start strictly after the latest approved
     * rule started. This prevents inserting a new rule before or
     * inside an already approved future timeline.
     */
    IF v_tax_rule.effective_from <= v_latest_active_tax_rule.effective_from THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The new tax rule must start after the latest approved tax rule.';
    END IF;

    /*
     * Close the previous terminal rule exactly where the new
     * approved rule begins.
     *
     * Because our periods use [start, end):
     *
     * previous effective_until = new effective_from
     *
     * creates no overlap and no gap.
     * 
     * Before changing the draft to status = 'active'. Otherwise PostgreSQL's non-overlap constraint would temporarily see 
     * two overlapping active periods and reject the transaction.
     * And because everything happens inside one PostgreSQL function call, if activation fails after 
     * changing the old rule, the whole statement is rolled back so we don't leave the tax timeline half-modified.
     */
    UPDATE public.tax_rules
    SET effective_until = v_tax_rule.effective_from
    WHERE id = v_latest_active_tax_rule.id;


    /*
     * Approve the draft.
     *
     * IMPORTANT:
     * effective_from is NOT replaced with NOW().
     *
     * activated_at records when the administrator approved the rule.
     * effective_from records when journeys begin using the rule.
     */
    UPDATE public.tax_rules
    SET
        status = 'active',
        activated_by_user_id = p_activated_by_user_id,
        activated_at = NOW()
    WHERE id = p_tax_rule_id;


    /* Return the activated tax-rule UUID to the Next.js admin workflow. */
    RETURN p_tax_rule_id;

END;
$$;


/*
 * Browser roles cannot directly activate financial configuration.
 */
REVOKE ALL
ON FUNCTION public.activate_tax_rule_draft(UUID, UUID)
FROM PUBLIC, anon, authenticated;


/*
 * Trusted Next.js server operations use service_role.
 */
GRANT EXECUTE
ON FUNCTION public.activate_tax_rule_draft(UUID, UUID)
TO service_role;


COMMENT ON FUNCTION public.activate_tax_rule_draft(UUID, UUID)
IS 'Activates one terminal tax-rule draft and atomically closes the previous approved tax period at the new rule effective-from boundary.';