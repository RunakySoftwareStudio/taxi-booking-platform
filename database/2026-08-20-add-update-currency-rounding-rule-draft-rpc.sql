/*
 * VOYA TAXI - UPDATE CURRENCY ROUNDING-RULE DRAFT
 *
 * Purpose:
 * Updates the editable values of one unfinished
 * currency-rounding-rule draft.
 *
 * Editable:
 * - rounding_increment;
 * - rounding_mode;
 * - effective_from;
 * - effective_until.
 *
 * Immutable rounding-rule family identity:
 * - country_code;
 * - currency_code.
 *
 * Safety:
 * Active and archived rounding rules are historical financial
 * configuration and cannot be changed through this function.
 *
 * ARCHITECTURE CHECK
 *
 * Draft must exist                      ✅
 * Draft row locked with FOR UPDATE      ✅
 * Only status = draft can be changed    ✅
 * Increment must be greater than 0      ✅
 * Mode must be nearest / up / down      ✅
 * Effective-from is required            ✅
 * Effective-until must be after start   ✅
 * Country and currency stay immutable   ✅
 * service_role permissions              ✅
 *
 * Example:
 *
 * BE + EUR draft
 * rounding_increment = 0.0100
 * rounding_mode = nearest
 *
 *          ↓ Update draft
 *
 * BE + EUR draft
 * rounding_increment = 0.0500
 * rounding_mode = nearest
 */

CREATE OR REPLACE FUNCTION public.update_currency_rounding_rule_draft(
    p_rounding_rule_id UUID,
    p_rounding_increment NUMERIC,
    p_rounding_mode TEXT,
    p_effective_from TIMESTAMPTZ,
    p_effective_until TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_rounding_rule public.currency_rounding_rules%ROWTYPE;

BEGIN
    /* Rounding-rule ID is required. */
    IF p_rounding_rule_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Currency rounding rule ID is required.';
    END IF;

    /*
     * Load and lock the exact draft.
     *
     * FOR UPDATE prevents two simultaneous save requests from
     * modifying the same draft at exactly the same time.
     */
    SELECT rounding_rule.*
    INTO v_rounding_rule
    FROM public.currency_rounding_rules AS rounding_rule
    WHERE rounding_rule.id = p_rounding_rule_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002',
            MESSAGE = 'The currency rounding rule could not be found.';
    END IF;

    /* Only unfinished drafts may be edited. */
    IF v_rounding_rule.status <> 'draft' THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Only draft currency rounding rules can be edited.';
    END IF;

    /* Rounding increment must always be greater than zero. */
    IF p_rounding_increment IS NULL OR p_rounding_increment <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Rounding increment must be greater than zero.';
    END IF;

    /* Only supported rounding modes may be stored. */
    IF p_rounding_mode IS NULL OR p_rounding_mode NOT IN ('nearest', 'up', 'down') THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Rounding mode must be nearest, up, or down.';
    END IF;

    /* Every rounding rule requires an effective start. */
    IF p_effective_from IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Effective-from date is required.';
    END IF;

    /* Optional effective end must be later than the start. */
    IF p_effective_until IS NOT NULL AND p_effective_until <= p_effective_from THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Effective-until must be later than effective-from.';
    END IF;

    /*
     * Update only editable draft values.
     *
     * country_code and currency_code deliberately remain unchanged.
     * updated_at is maintained by the existing database trigger.
     */
    UPDATE public.currency_rounding_rules
    SET rounding_increment = p_rounding_increment,
        rounding_mode = p_rounding_mode,
        effective_from = p_effective_from,
        effective_until = p_effective_until
    WHERE id = p_rounding_rule_id;

    RETURN p_rounding_rule_id;
END;
$$;

/* Browser roles cannot directly perform this financial operation. */
REVOKE ALL
ON FUNCTION public.update_currency_rounding_rule_draft(UUID, NUMERIC, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
FROM PUBLIC, anon, authenticated;

/* Trusted Next.js server operations use service_role. */
GRANT EXECUTE
ON FUNCTION public.update_currency_rounding_rule_draft(UUID, NUMERIC, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
TO service_role;

COMMENT ON FUNCTION public.update_currency_rounding_rule_draft(UUID, NUMERIC, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
IS 'Updates editable values of one currency rounding-rule draft while preserving its country and currency family.';