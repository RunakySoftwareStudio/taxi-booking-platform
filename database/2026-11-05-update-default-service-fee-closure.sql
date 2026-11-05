    /* ============================================================
    VOYA TAXI — UPDATE DEFAULT SERVICE FEE CLOSURE

    Purpose:
    Record why an existing default service-fee rate ends
    when Admin schedules a new rate.

    Business rules:
    1. The previous rate is preserved.
    2. Its effective end date is set to the new start date.
    3. closure_reason is set to 'system_ended'.
    4. The new rate remains open-ended.
    5. All scheduling validations remain unchanged.

    This migration replaces the existing RPC definition.
    ============================================================ */
    CREATE OR REPLACE FUNCTION public.set_default_service_fee_rate(
        p_percentage NUMERIC,
        p_effective_from DATE
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $$
    DECLARE
        v_previous_rate public.financial_service_fee_rates%ROWTYPE;
        v_new_rate_id UUID;
        v_today DATE;
    BEGIN
        /*-------------------------------
        SECTION 1 — Validate input.
        Use the Netherlands calendar date consistently for service-fee configuration.
        -----------------------------------*/
        v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE;

        IF p_percentage IS NULL
        OR p_percentage < 0
        OR p_percentage > 100 THEN
            RAISE EXCEPTION 'Service-fee percentage must be between 0 and 100.';
        END IF;

        /*
        A new service-fee rate must start on a future date.
        This prevents same-day changes from affecting
        journeys completed earlier today.
        */
        IF p_effective_from IS NULL
        OR p_effective_from <= v_today THEN
            RAISE EXCEPTION
                'Effective date must be later than today.';
        END IF;

        /*--------------------------------------------
        SECTION 2 — Serialize default-rate changes.
        Prevent two simultaneous Admin requests from modifying the default schedule concurrently.
        ----------------------------------------------*/
        PERFORM pg_catalog.pg_advisory_xact_lock(506, 1);

        /*-----------------------------------------
        SECTION 3 — Find the latest default rate.
        -----------------------------------------*/
        SELECT *
        INTO v_previous_rate
        FROM public.financial_service_fee_rates
        WHERE chauffeur_id IS NULL
        ORDER BY effective_from DESC
        LIMIT 1
        FOR UPDATE;

        /*-----------------------------------------
        SECTION 4 — Prevent conflicting schedules.
        Existing future rates must be preserved.
        A new rate can only start after the latest configured rate's start date.
        -------------------------------------------*/
        IF v_previous_rate.id IS NOT NULL
        AND p_effective_from <= v_previous_rate.effective_from THEN
            RAISE EXCEPTION
                'New effective date must be after the latest configured rate start date.';
        END IF;

        /*
        Only an open-ended latest rate may be replaced.
        A closed latest rate requires a separate scheduling operation, preventing accidental gaps or changes to existing historical periods.
        */
        IF v_previous_rate.id IS NOT NULL
        AND v_previous_rate.effective_until IS NOT NULL THEN
            RAISE EXCEPTION
                'Latest default service-fee rate is already closed.';
        END IF;

        /*--------------------------------------------
        SECTION 5 — Close the previous rate if necessary.
        End dates are exclusive.
        Previously completed historical periods remain unchanged.
        --------------------------------------------*/
        IF v_previous_rate.id IS NOT NULL
        AND (
            v_previous_rate.effective_until IS NULL
            OR v_previous_rate.effective_until > p_effective_from
        ) THEN
            /* Close the previous rate and record the closure reason. */
            UPDATE public.financial_service_fee_rates
            SET effective_until = p_effective_from,
                closure_reason = 'system_ended'
            WHERE id = v_previous_rate.id;
        END IF;

        /*---------------------------------------------
        SECTION 6 — Insert the new default rate.
        An open-ended rate remains applicable until a later rate is scheduled.
        -------------------------------------------------*/
        INSERT INTO public.financial_service_fee_rates (
            chauffeur_id,
            percentage,
            effective_from,
            effective_until
        )
        VALUES (
            NULL,
            p_percentage,
            p_effective_from,
            NULL
        )
        RETURNING id INTO v_new_rate_id;

        RETURN v_new_rate_id;
    END;
    $$;

    /* ======================================================================================================
        END VOYA TAXI — UPDATE DEFAULT SERVICE FEE CLOSURE
    =====================================================================================================*/
