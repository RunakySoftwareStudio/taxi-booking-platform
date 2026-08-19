/*
 * VOYA TAXI - CANCEL TAX-RULE DRAFT
 *
 * Purpose:
 * Safely deletes one unfinished tax-rule draft.
 *
 * Safety rules:
 * - only status = draft may be deleted;
 * - active and archived tax rules can never be cancelled;
 * - a tax rule referenced by a journey quote must remain;
 * - a tax rule referenced by a country tax allocation must remain;
 * - the complete country/service tax family is locked during cancellation.
 */

CREATE OR REPLACE FUNCTION public.cancel_tax_rule_draft(
    p_tax_rule_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* Stores the selected tax rule and identifies its tax family. */
    v_tax_rule public.tax_rules%ROWTYPE;

BEGIN
    /* A tax-rule ID is required. */
    IF p_tax_rule_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Tax rule ID is required.';
    END IF;


    /*
     * Load the tax rule first so we know which country/service
     * family must be locked.
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
     * BE + passenger_transport
     *
     * Draft creation, cancellation and later activation use the
     * same family lock so competing lifecycle operations cannot
     * modify this tax family at the same moment.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            v_tax_rule.country_code || '|' || v_tax_rule.service_category,
            0
        )
    );


    /*
     * Reload and lock the exact tax rule after obtaining
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


    /*
     * Only unfinished drafts may be cancelled.
     *
     * Active and archived tax rules are historical financial
     * configuration and must remain available.
     */
    IF v_tax_rule.status <> 'draft' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only a draft tax rule can be cancelled.';
    END IF;


    /*
     * A tax rule directly referenced by a journey quote must
     * remain available for financial history.
     */
    IF EXISTS (
        SELECT 1
        FROM public.journey_quotes AS journey_quote
        WHERE journey_quote.tax_rule_id = p_tax_rule_id
    ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = 'This tax-rule draft is already referenced by a journey quote and cannot be cancelled.';
    END IF;


    /*
     * Cross-border quotes store their exact country-specific tax
     * rules in journey_quote_tax_allocations.
     *
     * A referenced tax rule must therefore also remain available.
     */
    IF EXISTS (
        SELECT 1
        FROM public.journey_quote_tax_allocations AS tax_allocation
        WHERE tax_allocation.tax_rule_id = p_tax_rule_id
    ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = 'This tax-rule draft is already referenced by a journey tax allocation and cannot be cancelled.';
    END IF;


    /* Delete the unfinished draft. */
    DELETE FROM public.tax_rules
    WHERE id = p_tax_rule_id;


    /* Return the deleted UUID for the Next.js admin workflow. */
    RETURN p_tax_rule_id;

END;
$$;


/*
 * Browser roles cannot directly perform this financial operation.
 */
REVOKE ALL
ON FUNCTION public.cancel_tax_rule_draft(UUID)
FROM PUBLIC, anon, authenticated;


/*
 * Trusted Next.js server operations use service_role.
 */
GRANT EXECUTE
ON FUNCTION public.cancel_tax_rule_draft(UUID)
TO service_role;


COMMENT ON FUNCTION public.cancel_tax_rule_draft(UUID)
IS 'Safely deletes one unfinished tax-rule draft while preserving active, archived and quoted financial tax rules.';