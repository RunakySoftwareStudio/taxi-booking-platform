/*
 * VOYA TAXI - CREATE TAX-RULE DRAFT
 *
 * Purpose:
 * Creates one editable draft for an existing active tax-rule family.
 *
 * Tax-rule family:
 *     country_code + service_category
 *
 * Safety rules:
 *
 * 0 drafts -> create a new draft
 * 1 draft  -> return the existing draft
 * 2+ drafts -> raise a configuration error
 *
 * The family advisory lock prevents two administrators from
 * creating competing drafts at the same time.
 *
 * Important:
 * The draft's effective_from initially uses NOW() only as an
 * editable placeholder. The administrator may change the planned
 * effective period before activating the rule.
 */

CREATE OR REPLACE FUNCTION public.create_tax_rule_draft(
    p_source_tax_rule_id UUID,
    p_created_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* Identifies the tax-rule family before taking the family lock. */
    v_country_code TEXT;
    v_service_category TEXT;

    /* Complete active source tax rule. */
    v_source_tax_rule public.tax_rules%ROWTYPE;

    /* Number of existing drafts in this tax-rule family. */
    v_draft_count INTEGER;

    /* Existing draft UUID when exactly one draft already exists. */
    v_existing_draft_tax_rule_id UUID;

    /* UUID created for a new draft. */
    v_new_draft_tax_rule_id UUID;

BEGIN
    /* Both IDs are required. */
    IF p_source_tax_rule_id IS NULL
        OR p_created_by_user_id IS NULL
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Source tax rule ID and administrator user ID are required.';
    END IF;


    /*
     * Load the tax family first.
     */
    SELECT
        tax_rule.country_code,
        tax_rule.service_category
    INTO
        v_country_code,
        v_service_category
    FROM public.tax_rules AS tax_rule
    WHERE tax_rule.id = p_source_tax_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The source tax rule could not be found.';
    END IF;


    /*
     * Lock the complete tax-rule family.
     *
     * Example:
     *
     * BE + passenger_transport
     *
     * Administrator 1 creates a draft.
     * Administrator 2 waits.
     *
     * After the lock is released, administrator 2 finds the
     * existing draft instead of creating another one.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            /*
            || means concatenate strings. -- example: BE|passenger_transport. 
            hashtextextended(...) converts that text into a number.
            PostgreSQL advisory locks work very conveniently with a numeric lock key.
            */
            v_country_code || '|' || v_service_category, 
            0
        )
    );


    /*
     * Reload and lock the selected source rule.
     */
    SELECT tax_rule.*
    INTO v_source_tax_rule
    FROM public.tax_rules AS tax_rule
    WHERE tax_rule.id = p_source_tax_rule_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The source tax rule could not be found.';
    END IF;


    /*
     * New drafts may only be created from an approved active rule.
     *
     * "active" does not necessarily mean currently effective.
     * A future approved tax rule may also have status = active.
     */
    IF v_source_tax_rule.status <> 'active' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'A tax-rule draft can only be created from an active tax rule.';
    END IF;


    /*
     * Check whether this tax family already contains a draft.
     *
     * The unique partial index also protects this rule at database
     * level, while this check allows us to return the existing draft.
     */
    SELECT COUNT(*)
    INTO v_draft_count
    FROM public.tax_rules AS tax_rule
    WHERE tax_rule.country_code = v_source_tax_rule.country_code
      AND tax_rule.service_category = v_source_tax_rule.service_category
      AND tax_rule.status = 'draft';

    IF v_draft_count > 1 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Multiple tax-rule drafts already exist for this country and service category.';
    END IF;


    /*
     * Reuse the existing draft when one already exists.
     */
    IF v_draft_count = 1 THEN
        SELECT tax_rule.id
        INTO v_existing_draft_tax_rule_id
        FROM public.tax_rules AS tax_rule
        WHERE tax_rule.country_code = v_source_tax_rule.country_code
          AND tax_rule.service_category = v_source_tax_rule.service_category
          AND tax_rule.status = 'draft';

        RETURN v_existing_draft_tax_rule_id;
    END IF;


    /*
     * Create a new draft by copying the stable tax identity and
     * current percentage from the selected source rule.
     *
     * effective_from = NOW() is only the initial draft value.
     * It may be changed before activation.
     */
    INSERT INTO public.tax_rules (
        country_code,
        tax_name,
        service_category,
        tax_rate_percentage,
        status,
        effective_from,
        effective_until,
        created_by_user_id,
        activated_by_user_id,
        archived_by_user_id,
        activated_at,
        archived_at
    )
    VALUES (
        v_source_tax_rule.country_code,
        v_source_tax_rule.tax_name,
        v_source_tax_rule.service_category,
        v_source_tax_rule.tax_rate_percentage,
        'draft',
        NOW(),
        NULL,
        p_created_by_user_id,
        NULL,
        NULL,
        NULL,
        NULL
    )
    RETURNING id
    INTO v_new_draft_tax_rule_id;


    /* Return the UUID needed by the Next.js admin page. */
    RETURN v_new_draft_tax_rule_id;

END;
$$;


/*
 * Browser roles cannot directly perform this financial operation.
 */
REVOKE ALL
ON FUNCTION public.create_tax_rule_draft(UUID, UUID)
FROM PUBLIC, anon, authenticated;


/*
 * Trusted Next.js server operations use service_role.
 */
GRANT EXECUTE
ON FUNCTION public.create_tax_rule_draft(UUID, UUID)
TO service_role;


COMMENT ON FUNCTION public.create_tax_rule_draft(UUID, UUID)
IS 'Returns the existing draft for a tax-rule family or atomically creates one when no draft exists.';