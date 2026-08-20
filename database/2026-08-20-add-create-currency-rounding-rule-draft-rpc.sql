/*
 * VOYA TAXI - CREATE CURRENCY ROUNDING-RULE DRAFT
 *
 * Purpose:
 * Creates one editable draft for an existing active
 * currency-rounding-rule family.
 *
 * Rounding-rule family:
 *     country_code + currency_code
 *
 * Safety:
 * 0 drafts  -> create a new draft
 * 1 draft   -> return the existing draft
 * 2+ drafts -> configuration error
 *
 * A family advisory lock prevents competing drafts
 * from being created at the same time.
 *
 * ARCHITECTURE CHECK
 *
 * Family identity:
 *     country_code + currency_code
 *
 * Source must exist                    ✅
 * Family advisory lock                 ✅
 * Source row locked with FOR UPDATE    ✅
 * Source must be status = active       ✅
 * Existing draft is reused             ✅
 * New draft copies increment + mode    ✅
 * Draft gets effective_from = NOW()    ✅
 * Audit created_by_user_id stored      ✅
 * Browser roles blocked                ✅
 * service_role allowed                 ✅
 * Returns draft UUID                   ✅
 *
 * Example:
 *
 * BE + EUR active
 * rounding_increment = 0.0100
 * rounding_mode = nearest
 *
 *          ↓ Create draft
 *
 * BE + EUR draft
 * rounding_increment = 0.0100
 * rounding_mode = nearest
 */           


CREATE OR REPLACE FUNCTION public.create_currency_rounding_rule_draft(
    p_source_rounding_rule_id UUID,
    p_created_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_country_code TEXT;
    v_currency_code TEXT;
    v_source_rounding_rule public.currency_rounding_rules%ROWTYPE;
    v_draft_count INTEGER;
    v_existing_draft_rounding_rule_id UUID;
    v_new_draft_rounding_rule_id UUID;

BEGIN
    IF p_source_rounding_rule_id IS NULL OR p_created_by_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Source rounding rule ID and administrator user ID are required.';
    END IF;

    /* Load the rounding-rule family before taking the family lock. */
    SELECT rounding_rule.country_code, rounding_rule.currency_code
    INTO v_country_code, v_currency_code
    FROM public.currency_rounding_rules AS rounding_rule
    WHERE rounding_rule.id = p_source_rounding_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002',
            MESSAGE = 'The source currency rounding rule could not be found.';
    END IF;

    /* Lock the complete country/currency family. */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_country_code || '|' || v_currency_code, 0)
    );

    /* Reload and lock the source rule. */
    SELECT rounding_rule.*
    INTO v_source_rounding_rule
    FROM public.currency_rounding_rules AS rounding_rule
    WHERE rounding_rule.id = p_source_rounding_rule_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002',
            MESSAGE = 'The source currency rounding rule could not be found.';
    END IF;

    /* Drafts may only be created from an approved active rule. */
    IF v_source_rounding_rule.status <> 'active' THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'A currency rounding-rule draft can only be created from an active rule.';
    END IF;

    /* Check whether this family already contains a draft. */
    SELECT COUNT(*)
    INTO v_draft_count
    FROM public.currency_rounding_rules AS rounding_rule
    WHERE rounding_rule.country_code = v_source_rounding_rule.country_code
      AND rounding_rule.currency_code = v_source_rounding_rule.currency_code
      AND rounding_rule.status = 'draft';

    IF v_draft_count > 1 THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Multiple currency rounding-rule drafts already exist for this country and currency.';
    END IF;

    /* Reuse the existing draft when one already exists. */
    IF v_draft_count = 1 THEN
        SELECT rounding_rule.id
        INTO v_existing_draft_rounding_rule_id
        FROM public.currency_rounding_rules AS rounding_rule
        WHERE rounding_rule.country_code = v_source_rounding_rule.country_code
          AND rounding_rule.currency_code = v_source_rounding_rule.currency_code
          AND rounding_rule.status = 'draft';

        RETURN v_existing_draft_rounding_rule_id;
    END IF;

    /* Create the new editable draft. */
    INSERT INTO public.currency_rounding_rules (
        country_code,
        currency_code,
        rounding_increment,
        rounding_mode,
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
        v_source_rounding_rule.country_code,
        v_source_rounding_rule.currency_code,
        v_source_rounding_rule.rounding_increment,
        v_source_rounding_rule.rounding_mode,
        'draft',
        NOW(),
        NULL,
        p_created_by_user_id,
        NULL,
        NULL,
        NULL,
        NULL
    )
    RETURNING id INTO v_new_draft_rounding_rule_id;

    RETURN v_new_draft_rounding_rule_id;
END;
$$;

/* Browser roles cannot directly perform this financial operation. */
REVOKE ALL
ON FUNCTION public.create_currency_rounding_rule_draft(UUID, UUID)
FROM PUBLIC, anon, authenticated;

/* Trusted Next.js server operations use service_role. */
GRANT EXECUTE
ON FUNCTION public.create_currency_rounding_rule_draft(UUID, UUID)
TO service_role;

COMMENT ON FUNCTION public.create_currency_rounding_rule_draft(UUID, UUID)
IS 'Returns the existing draft for a country/currency rounding-rule family or atomically creates one when no draft exists.';