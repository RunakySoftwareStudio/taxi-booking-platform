/*
    Voya Taxi — Commission Generation and Invoice Coordination

    Updates the existing commission-generation function to:
    - Coordinate generation with monthly invoicing.
    - Prevent new commissions after an invoice is issued or paid.
    - Preserve historical commission calculations.

    Dependency:
    Run after 2026-11-07-add-chauffeur-invoices.sql.

    The original 2026-11-06 commission migration
    remains unchanged.
*/
 CREATE OR REPLACE FUNCTION public.generate_chauffeur_booking_commission(p_booking_id UUID)
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $function$
    DECLARE
        v_status public.booking_status;
        v_excluded BOOLEAN;
        v_chauffeur_id UUID;
        v_quote_id UUID;
        v_completed_at TIMESTAMPTZ;
        v_completion_date DATE;

        v_quote_status public.journey_quote_status;
        v_currency_code VARCHAR(3);
        v_journey_amount NUMERIC(12,4);
        v_vat_amount NUMERIC(12,4);
        v_total_before_rounding NUMERIC(12,4);

        v_rate_id UUID;
        v_percentage NUMERIC(7,4);
        v_commission_amount NUMERIC(12,4);
        v_commission_id UUID;
    BEGIN
        /* SECTION 1: Validate the booking identifier. */
        IF p_booking_id IS NULL THEN
            RAISE EXCEPTION 'Booking ID is required.'
            USING ERRCODE = '22023';
        END IF;

        /* SECTION 2: Lock and retrieve the booking. */
        SELECT
            status,
            is_financially_excluded,
            chauffeur_id,
            journey_quote_id,
            completed_at
        INTO
            v_status,
            v_excluded,
            v_chauffeur_id,
            v_quote_id,
            v_completed_at
        FROM public.bookings
        WHERE id = p_booking_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Booking was not found.'
            USING ERRCODE = 'P0002';
        END IF;

        /* SECTION 3: Return an existing frozen commission. */
        SELECT id INTO v_commission_id
        FROM public.chauffeur_booking_commissions
        WHERE booking_id = p_booking_id;

        IF FOUND THEN
            RETURN v_commission_id;
        END IF;

        /* SECTION 4: Verify financial eligibility. */
        IF v_status <> 'completed' OR v_completed_at IS NULL THEN
            RAISE EXCEPTION 'Only completed bookings can generate commissions.'
            USING ERRCODE = '22023';
        END IF;

        IF v_excluded IS DISTINCT FROM FALSE THEN
            RAISE EXCEPTION 'Financially excluded bookings cannot generate commissions.'
            USING ERRCODE = '22023';
        END IF;

        IF v_chauffeur_id IS NULL OR v_quote_id IS NULL THEN
            RAISE EXCEPTION 'Booking requires a chauffeur and accepted quotation.'
            USING ERRCODE = '22023';
        END IF;

       /* Use the official completion date in Amsterdam.
            := means: assigns (v_completed_at AT TIME ZONE 'Europe/Amsterdam')::DATE; to v_completion_date.
            SELECT '2026-11-06'::DATE; means SELECT CAST('2026-11-06' AS DATE);
        */
        v_completion_date := (v_completed_at AT TIME ZONE 'Europe/Amsterdam')::DATE;

        /*
            Coordinate commission generation with monthly invoicing.

            Lock this chauffeur and completion month until the
            current transaction finishes. Invoice functions will
            acquire the same advisory lock.
        */
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(
                v_chauffeur_id::TEXT || ':' ||
                pg_catalog.to_char(v_completion_date, 'YYYY-MM'),
                0
            )
        );
        
        /*
            Prevent generating a new commission after the chauffeur's monthly invoice has been issued.
            The advisory lock ensures this check cannot race with invoice issuance using the same lock key.
        */
        IF EXISTS (
            SELECT 1
            FROM public.chauffeur_invoices AS i
            WHERE i.chauffeur_id = v_chauffeur_id
            AND i.billing_month = DATE_TRUNC('month', v_completion_date::TIMESTAMP)::DATE
            AND i.status IN ('issued', 'paid')
        ) THEN
            RAISE EXCEPTION
                'This chauffeur month has already been invoiced. New commissions require an adjustment workflow.'
                USING ERRCODE = '23514';
        END IF;

        /* SECTION 5: Retrieve the accepted quotation. */
        SELECT
            status,
            currency_code,
            basic_fare_excluding_vat,
            vat_amount,
            total_including_vat_before_rounding
        INTO
            v_quote_status,
            v_currency_code,
            v_journey_amount,
            v_vat_amount,
            v_total_before_rounding
        FROM public.journey_quotes
        WHERE quote_id = v_quote_id
        FOR SHARE;

        IF NOT FOUND OR v_quote_status IS DISTINCT FROM 'accepted' THEN
            RAISE EXCEPTION 'An accepted journey quotation is required.'
            USING ERRCODE = '22023';
        END IF;

        /* Validate the historical VAT-exclusive calculation basis. */
        IF v_journey_amount IS NULL
        OR v_journey_amount < 0
        OR v_vat_amount IS NULL
        OR v_total_before_rounding IS NULL
        OR v_journey_amount <>
            (v_total_before_rounding - v_vat_amount) THEN
            RAISE EXCEPTION 'Journey quotation amounts are inconsistent.'
            USING ERRCODE = '22023';
        END IF;

        /* SECTION 6: Select the applicable historical service fee.
        Chauffeur-specific rates take priority over the default. */
        SELECT
            id,
            percentage
        INTO
            v_rate_id,
            v_percentage
        FROM public.financial_service_fee_rates
        WHERE (chauffeur_id = v_chauffeur_id OR chauffeur_id IS NULL)
        AND effective_from <= v_completion_date
        AND (
            effective_until IS NULL
            OR v_completion_date < effective_until
        )
        ORDER BY
            (chauffeur_id IS NOT NULL) DESC,
            effective_from DESC
        LIMIT 1
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'No applicable chauffeur service-fee rate exists for this completion date.'
            USING ERRCODE = '22023';
        END IF;

        /* SECTION 7: Calculate the frozen commission amount.
            := means: assigns ROUND(v_journey_amount * v_percentage / 100, 4); to v_commission_amount.
        */
        v_commission_amount := ROUND(v_journey_amount * v_percentage / 100, 4);

        /* SECTION 8: Insert the historical commission snapshot. */
        INSERT INTO public.chauffeur_booking_commissions (
            booking_id,
            chauffeur_id,
            journey_quote_id,
            service_fee_rate_id,
            completed_at,
            journey_amount_excluding_vat,
            applied_percentage,
            commission_amount,
            currency_code
        )
        VALUES (
            p_booking_id,
            v_chauffeur_id,
            v_quote_id,
            v_rate_id,
            v_completed_at,
            v_journey_amount,
            v_percentage,
            v_commission_amount,
            v_currency_code
        )
        RETURNING id INTO v_commission_id;

        RETURN v_commission_id;
    END;
    $function$;
