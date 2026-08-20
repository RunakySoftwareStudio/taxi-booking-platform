/*
 * VOYA TAXI - CANCEL CURRENCY ROUNDING-RULE DRAFT
 *
 * Purpose:
 * Deletes one unfinished currency-rounding-rule draft.
 *
 * IMPORTANT:
 * In the admin UI this action is called:
 *
 *     Delete draft
 *
 * "Cancel" is used in the database function name because it cancels
 * the unfinished financial configuration lifecycle.
 *
 * Rounding-rule family:
 *     country_code + currency_code
 *
 * ARCHITECTURE CHECK
 *
 * Draft must exist                         ✅
 * Family advisory lock                     ✅
 * Draft row locked with FOR UPDATE         ✅
 * Only status = draft may be deleted       ✅
 * Referenced quote rules cannot be deleted ✅
 * Active rules cannot be deleted           ✅
 * Archived rules cannot be deleted         ✅
 * Browser roles blocked                    ✅
 * service_role allowed                     ✅
 *
 * Example:
 *
 * BE + EUR active
 *     +
 * BE + EUR draft
 *
 *          ↓ Delete draft
 *
 * BE + EUR active
 *
 * The approved active rule remains unchanged.
 */

CREATE OR REPLACE FUNCTION public.cancel_currency_rounding_rule_draft(
    p_rounding_rule_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_country_code TEXT;
    v_currency_code TEXT;
    v_rounding_rule public.currency_rounding_rules%ROWTYPE;

BEGIN
    /* Rounding-rule ID is required. */
    IF p_rounding_rule_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Currency rounding rule ID is required.';
    END IF;

    /* Load the family before taking the family lock. */
    SELECT rounding_rule.country_code, rounding_rule.currency_code
    INTO v_country_code, v_currency_code
    FROM public.currency_rounding_rules AS rounding_rule
    WHERE rounding_rule.id = p_rounding_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002',
            MESSAGE = 'The currency rounding rule could not be found.';
    END IF;

    /* Lock the complete country/currency family. */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_country_code || '|' || v_currency_code, 0)
    );

    /* Reload and lock the exact draft. */
    SELECT rounding_rule.*
    INTO v_rounding_rule
    FROM public.currency_rounding_rules AS rounding_rule
    WHERE rounding_rule.id = p_rounding_rule_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002',
            MESSAGE = 'The currency rounding rule could not be found.';
    END IF;

    /* Only unfinished drafts may be deleted. */
    IF v_rounding_rule.status <> 'draft' THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Only draft currency rounding rules can be deleted.';
    END IF;

    /*
     * Protect financial history.
     *
     * A rounding rule referenced by a stored journey quote must never be deleted.
     * So even if something goes wrong elsewhere and a draft somehow becomes referenced by a quote, this function refuses to delete it.
     */
    IF EXISTS (
        SELECT 1
        FROM public.journey_quotes AS journey_quote
        WHERE journey_quote.rounding_rule_id = p_rounding_rule_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23503',
            MESSAGE = 'The currency rounding-rule draft is referenced by a journey quote and cannot be deleted.';
    END IF;

    /* Delete only the verified unreferenced draft. */
    DELETE FROM public.currency_rounding_rules
    WHERE id = p_rounding_rule_id;

    RETURN p_rounding_rule_id;
END;
$$;

/* Browser roles cannot directly perform this financial operation. */
REVOKE ALL
ON FUNCTION public.cancel_currency_rounding_rule_draft(UUID)
FROM PUBLIC, anon, authenticated;

/* Trusted Next.js server operations use service_role. */
GRANT EXECUTE
ON FUNCTION public.cancel_currency_rounding_rule_draft(UUID)
TO service_role;

COMMENT ON FUNCTION public.cancel_currency_rounding_rule_draft(UUID)
IS 'Deletes one unreferenced currency rounding-rule draft while preserving approved financial history.';