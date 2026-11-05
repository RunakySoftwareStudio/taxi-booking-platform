    /* ============================================================
    VOYA TAXI — DEFAULT SERVICE FEE REMOVAL

    Purpose:
    Remove the latest unused future default service-fee
    rate and safely restore the previous rate if needed.

    Security:
    Only service_role may execute this function.
    Next.js must independently verify Admin authorization.

    Business rules:
    1. Only the latest scheduled default rate can be removed.
    2. The effective start date must still be in the future.
    3. Restore the previous rate to Ongoing when safely possible.
    4. Reject removal if the previous period cannot be restored.
    5. Execute deletion and restoration atomically.

    Limitation:
    Financial commission-reference checks are not yet implemented.
    ============================================================ */

    CREATE OR REPLACE FUNCTION public.remove_default_service_fee_rate(
        p_rate_id UUID
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $$
    DECLARE
        v_latest public.financial_service_fee_rates%ROWTYPE;
        v_previous public.financial_service_fee_rates%ROWTYPE;
        v_today DATE;
    BEGIN
        /* SECTION 1 — Validate the request. */
        IF p_rate_id IS NULL THEN
            RAISE EXCEPTION 'Service-fee rate ID is required.';
        END IF;

        v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE;

        /* SECTION 2 — Serialize default-rate changes. */
        PERFORM pg_catalog.pg_advisory_xact_lock(506, 1);

        /* SECTION 3 — Lock and identify the latest default rate. */
        SELECT * INTO v_latest
        FROM public.financial_service_fee_rates
        WHERE chauffeur_id IS NULL
        ORDER BY effective_from DESC
        LIMIT 1
        FOR UPDATE;

        IF v_latest.id IS NULL OR v_latest.id <> p_rate_id THEN
            RAISE EXCEPTION 'Only the latest default service-fee rate can be removed.';
        END IF;

        IF v_latest.effective_from <= v_today THEN
            RAISE EXCEPTION 'Historical or active service-fee rates cannot be removed.';
        END IF;

        /* SECTION 4 — Locate the preceding default rate. */
        SELECT * INTO v_previous
        FROM public.financial_service_fee_rates
        WHERE chauffeur_id IS NULL
        AND effective_from < v_latest.effective_from
        ORDER BY effective_from DESC
        LIMIT 1
        FOR UPDATE;

        /*
        Only automatically ended periods may be restored.
        Admin-ended periods must remain protected.
        */
        IF v_previous.id IS NOT NULL
        AND (
            v_previous.effective_until IS DISTINCT FROM v_latest.effective_from
            OR v_previous.closure_reason IS DISTINCT FROM 'system_ended'
        ) THEN
            RAISE EXCEPTION 'Previous service-fee period cannot be safely restored.';
        END IF;

        /* SECTION 5 — Delete the future rate. */
        DELETE FROM public.financial_service_fee_rates
        WHERE id = v_latest.id;

        /* SECTION 6 — Reopen the previous rate, if present. */
        IF v_previous.id IS NOT NULL THEN
            /* Restore the previous rate and clear its closure reason. */
            UPDATE public.financial_service_fee_rates
            SET effective_until = NULL,
                closure_reason = NULL
            WHERE id = v_previous.id;
        END IF;

        RETURN p_rate_id;
    END;
    $$;

    /* SECTION 7 — Restrict execution permissions. */
    REVOKE ALL ON FUNCTION public.remove_default_service_fee_rate(UUID)
    FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE ON FUNCTION public.remove_default_service_fee_rate(UUID)
    TO service_role;

    /* SECTION 8 — Documentation. */
    COMMENT ON FUNCTION public.remove_default_service_fee_rate(UUID) IS
    'Removes the latest future default service-fee rate and safely restores the preceding period when applicable.';
    /* ===========================================================
        END VOYA TAXI — DEFAULT SERVICE FEE REMOVAL
    =============================================================*/