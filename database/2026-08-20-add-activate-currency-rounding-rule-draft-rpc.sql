/*
 * VOYA TAXI - ACTIVATE CURRENCY ROUNDING-RULE DRAFT
 *
 * Purpose:
 * Approves one currency-rounding-rule draft and appends it
 * to the end of the existing approved rounding timeline.
 *
 * Rounding-rule family:
 *     country_code + currency_code
 *
 * IMPORTANT SEMANTICS
 *
 * status = active
 *     means the rounding rule is approved financial configuration.
 *
 * effective_from / effective_until
 *     determine when the approved rule actually applies.
 *
 * Therefore a future rounding rule may be activated today while
 * the current active rule remains applicable until that future date.
 *
 * SAFE FIRST VERSION
 *
 * This function only appends a new rule to the end of the
 * approved timeline. It does not insert rules into the middle
 * of existing approved periods.
 *
 * The new terminal rule must therefore have:
 *
 *     effective_until = NULL
 *
 * ARCHITECTURE CHECK
 *
 * Draft must exist                         ✅
 * Family advisory lock                    ✅
 * Draft row locked with FOR UPDATE         ✅
 * Only status = draft may be activated    ✅
 * Effective-until must be NULL             ✅
 * Effective-from must be in the future     ✅
 * Latest active rule must exist            ✅
 * Latest active rule must be open-ended    ✅
 * New rule must start after latest rule    ✅
 * Previous rule closes at new start        ✅
 * New rule becomes active atomically       ✅
 * Activation administrator is recorded     ✅
 * Browser roles blocked                    ✅
 * service_role allowed                     ✅
 *
 * Example:
 *
 * Before:
 *
 * BE + EUR
 * 0.0100 nearest
 * [2026-01-01 ----------------------------- infinity)
 *
 * Draft:
 * 0.0500 nearest
 * [2027-01-01 ----------------------------- infinity)
 *
 *          ↓ Activate draft
 *
 * After:
 *
 * 0.0100 nearest
 * [2026-01-01 ----------- 2027-01-01)
 *
 * 0.0500 nearest
 *                       [2027-01-01 ------- infinity)
 */

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
    v_rounding_rule public.currency_rounding_rules%ROWTYPE;
    v_latest_active_rounding_rule public.currency_rounding_rules%ROWTYPE;

BEGIN
    /* Both IDs are required. */
    IF p_rounding_rule_id IS NULL OR p_activated_by_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
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
        RAISE EXCEPTION USING ERRCODE = 'P0002',
            MESSAGE = 'The currency rounding rule could not be found.';
    END IF;

    /* Lock the complete country/currency family. */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_rounding_rule.country_code || '|' || v_rounding_rule.currency_code, 0)
    );

    /* Reload and lock the exact draft after obtaining the family lock. */
    SELECT rounding_rule.*
    INTO v_rounding_rule
    FROM public.currency_rounding_rules AS rounding_rule
    WHERE rounding_rule.id = p_rounding_rule_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002',
            MESSAGE = 'The currency rounding rule could not be found.';
    END IF;

    /* Only an unfinished draft may be activated. */
    IF v_rounding_rule.status <> 'draft' THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Only a draft currency rounding rule can be activated.';
    END IF;

    /* This version only supports a new open-ended terminal rule. */
    IF v_rounding_rule.effective_until IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'A newly activated terminal rounding rule must have no effective-until date.';
    END IF;

    /* Normal activation must not create a rule retroactively. */
    IF v_rounding_rule.effective_from <= NOW() THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'The new rounding rule effective-from date must be in the future.';
    END IF;

    /*
     * Find and lock the latest approved rule in this
     * country/currency family.
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

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002',
            MESSAGE = 'No approved currency rounding rule exists for this country and currency.';
    END IF;

    /* The latest approved rule must be the current open-ended terminal rule. */
    IF v_latest_active_rounding_rule.effective_until IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'The latest approved currency rounding rule is not open-ended.';
    END IF;

    /* Append-only protection. */
    IF v_rounding_rule.effective_from <= v_latest_active_rounding_rule.effective_from THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'The new currency rounding rule must start after the latest approved rule.';
    END IF;

    /*
     * Close the previous approved terminal rule exactly when
     * the newly approved rule begins.
     *
     * This happens before changing the draft to active so the
     * active-period non-overlap constraint is never violated.
     */
    UPDATE public.currency_rounding_rules
    SET effective_until = v_rounding_rule.effective_from
    WHERE id = v_latest_active_rounding_rule.id;

    /*
     * Activate the draft.
     *
     * effective_from stays unchanged because it records when
     * the rule starts applying.
     *
     * activated_at records when the administrator approved it.
     */
    UPDATE public.currency_rounding_rules
    SET status = 'active',
        activated_by_user_id = p_activated_by_user_id,
        activated_at = NOW()
    WHERE id = p_rounding_rule_id;

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
IS 'Activates one terminal currency rounding-rule draft and atomically closes the previous approved rounding period at the new effective-from boundary.';