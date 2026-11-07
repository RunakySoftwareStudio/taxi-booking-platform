
/* ============================================================
    VOYA TAXI — SHARED CHAUFFEUR COMMISSION CALCULATION
    Purpose:
    Calculate a chauffeur service fee without saving a record.
    Business rules:
    - Completed, financially included bookings only.
    - A chauffeur and accepted quotation are required.
    - The calculation excludes passenger VAT.
    - Chauffeur-specific rates override default rates.
    - Rates use the Amsterdam completion date.
    - No database records are modified.

    This function will be shared by commission previews and permanent commission generation.
    ============================================================ */

    CREATE OR REPLACE FUNCTION public.calculate_chauffeur_booking_commission(
        p_booking_id UUID
    )
    RETURNS TABLE (
        service_fee_rate_id UUID,
        applied_percentage NUMERIC,
        journey_amount_excluding_vat NUMERIC,
        commission_amount NUMERIC,
        currency_code VARCHAR(3)
    )
    LANGUAGE plpgsql
    STABLE
    SECURITY INVOKER
    SET search_path = ''
    AS $function$
    DECLARE
        v_booking public.bookings%ROWTYPE;
        v_quote public.journey_quotes%ROWTYPE;
        v_rate public.financial_service_fee_rates%ROWTYPE;
        v_completion_date DATE;
        v_commission_amount NUMERIC(12,4);
    BEGIN
        /* SECTION 1: Validate the booking identifier. */
        IF p_booking_id IS NULL THEN
            RAISE EXCEPTION 'Booking ID is required.'
            USING ERRCODE = '22023';
        END IF;

        /* SECTION 2: Retrieve the completed booking. */
        SELECT *
        INTO v_booking
        FROM public.bookings AS b
        WHERE b.id = p_booking_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Booking was not found.'
            USING ERRCODE = 'P0002';
        END IF;

        /* SECTION 3: Check financial eligibility. */
        IF v_booking.status <> 'completed'
        OR v_booking.completed_at IS NULL THEN
            RAISE EXCEPTION
                'Only completed bookings can generate commissions.'
            USING ERRCODE = '22023';
        END IF;

        IF v_booking.is_financially_excluded IS DISTINCT FROM FALSE THEN
            RAISE EXCEPTION
                'Financially excluded bookings cannot generate commissions.'
            USING ERRCODE = '22023';
        END IF;

        IF v_booking.chauffeur_id IS NULL
        OR v_booking.journey_quote_id IS NULL THEN
            RAISE EXCEPTION
                'Booking requires a chauffeur and accepted quotation.'
            USING ERRCODE = '22023';
        END IF;

        /* SECTION 4: Determine the official Amsterdam completion date. */
        v_completion_date := (v_booking.completed_at AT TIME ZONE 'Europe/Amsterdam')::DATE;

        /* SECTION 5: Retrieve and validate the accepted quotation. */
        SELECT *
        INTO v_quote
        FROM public.journey_quotes AS q
        WHERE q.quote_id = v_booking.journey_quote_id;

        IF NOT FOUND OR v_quote.status IS DISTINCT FROM 'accepted' THEN
            RAISE EXCEPTION
                'An accepted journey quotation is required.'
            USING ERRCODE = '22023';
        END IF;

        IF v_quote.basic_fare_excluding_vat IS NULL
        OR v_quote.basic_fare_excluding_vat < 0
        OR v_quote.vat_amount IS NULL
        OR v_quote.total_including_vat_before_rounding IS NULL
        OR v_quote.basic_fare_excluding_vat <> (v_quote.total_including_vat_before_rounding - v_quote.vat_amount)
        THEN
            RAISE EXCEPTION
                'Journey quotation amounts are inconsistent.'
            USING ERRCODE = '22023';
        END IF;

        /* SECTION 6: Select the applicable historical service-fee rate. */
        SELECT *
        INTO v_rate
        FROM public.financial_service_fee_rates AS r
        WHERE
            (r.chauffeur_id = v_booking.chauffeur_id OR r.chauffeur_id IS NULL)
            AND r.effective_from <= v_completion_date
            AND (r.effective_until IS NULL OR v_completion_date < r.effective_until)
        ORDER BY
            (r.chauffeur_id IS NOT NULL) DESC,
            r.effective_from DESC
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'No applicable chauffeur service-fee rate exists for this completion date.'
            USING ERRCODE = '22023';
        END IF;

        /* SECTION 7: Calculate the commission excluding passenger VAT. */
        v_commission_amount := ROUND(
            v_quote.basic_fare_excluding_vat * v_rate.percentage / 100,
            4
        );

        /* SECTION 8: Return the calculation without inserting a record. */
        RETURN QUERY
        SELECT
            v_rate.id,
            v_rate.percentage,
            v_quote.basic_fare_excluding_vat,
            v_commission_amount,
            v_quote.currency_code;
    END;
    $function$;

    /* ============================================================
    SECURITY — COMMISSION CALCULATION

    Only trusted server-side operations may calculate
    financial commission previews.
    ============================================================ */

    REVOKE ALL ON FUNCTION public.calculate_chauffeur_booking_commission(UUID)
    FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE ON FUNCTION public.calculate_chauffeur_booking_commission(UUID)
    TO service_role;
    /* =========================================================================
    END VOYA TAXI — SHARED CHAUFFEUR COMMISSION CALCULATION
    ============================================================================= */