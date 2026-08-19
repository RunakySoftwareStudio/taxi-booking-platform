/*
 * VOYA TAXI - UPDATE TAX-RULE DRAFT
 *
 * Purpose:
 * Updates the editable values of one unfinished tax-rule draft.
 *
 * Editable:
 * - tax_name;
 * - tax_rate_percentage;
 * - effective_from;
 * - effective_until.
 *
 * Immutable tax-family identity:
 * - country_code;
 * - service_category.
 *
 * Safety:
 * Active and archived tax rules are historical financial records
 * and cannot be changed through this function.
 */

CREATE OR REPLACE FUNCTION public.update_tax_rule_draft(
    p_tax_rule_id UUID,
    p_tax_name TEXT,
    p_tax_rate_percentage NUMERIC,
    p_effective_from TIMESTAMPTZ,
    p_effective_until TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* Stores and locks the draft while it is being updated. */
    v_tax_rule public.tax_rules%ROWTYPE;

BEGIN
    /* Tax-rule ID is required. */
    IF p_tax_rule_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Tax rule ID is required.';
    END IF;


    /*
     * Load and lock the exact tax rule.
     *
     * FOR UPDATE prevents two simultaneous save requests from
     * changing the same draft at exactly the same time.
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


    /*
     * Only unfinished drafts may be edited.
     *
     * Active and archived tax rules must remain immutable
     * historical financial configuration.
     */
    IF v_tax_rule.status <> 'draft' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only draft tax rules can be edited.';
    END IF;


    /* Tax name must contain real text. */
    IF p_tax_name IS NULL
        OR LENGTH(TRIM(p_tax_name)) = 0
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Tax name is required.';
    END IF;


    /* Tax percentage must be between 0% and 100%. */
    IF p_tax_rate_percentage IS NULL
        OR p_tax_rate_percentage < 0
        OR p_tax_rate_percentage > 100
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Tax rate percentage must be between 0 and 100.';
    END IF;


    /* Every tax rule requires an effective start. */
    IF p_effective_from IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Effective-from date is required.';
    END IF;


    /*
     * An optional effective end must always be later than
     * the effective start.
     */
    IF p_effective_until IS NOT NULL
        AND p_effective_until <= p_effective_from
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Effective-until must be later than effective-from.';
    END IF;


    /*
     * Update only editable draft values.
     *
     * country_code and service_category deliberately remain unchanged.
     *
     * updated_at is maintained automatically by the existing
     * tax_rules trigger.
     */
    UPDATE public.tax_rules
    SET
        tax_name = TRIM(p_tax_name),
        tax_rate_percentage = p_tax_rate_percentage,
        effective_from = p_effective_from,
        effective_until = p_effective_until
    WHERE id = p_tax_rule_id;


    /* Return the same UUID for the Next.js admin workflow. */
    RETURN p_tax_rule_id;

END;
$$;


/*
 * Browser roles cannot directly perform this financial operation.
 */
REVOKE ALL
ON FUNCTION public.update_tax_rule_draft(
    UUID,
    TEXT,
    NUMERIC,
    TIMESTAMPTZ,
    TIMESTAMPTZ
)
FROM PUBLIC, anon, authenticated;


/*
 * Trusted Next.js server operations use service_role.
 */
GRANT EXECUTE
ON FUNCTION public.update_tax_rule_draft(
    UUID,
    TEXT,
    NUMERIC,
    TIMESTAMPTZ,
    TIMESTAMPTZ
)
TO service_role;


COMMENT ON FUNCTION public.update_tax_rule_draft(
    UUID,
    TEXT,
    NUMERIC,
    TIMESTAMPTZ,
    TIMESTAMPTZ
)
IS 'Updates editable financial values of one tax-rule draft while preserving its country and service family.';