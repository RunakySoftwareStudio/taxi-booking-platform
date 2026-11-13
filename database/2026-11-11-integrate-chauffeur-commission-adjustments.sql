/*========================================================================
    VOYA TAXI — CHAUFFEUR COMMISSION ADJUSTMENT INTEGRATION

    Extend completed-journey commission generation to:
    - Preserve the original base service fee.
    - Apply eligible chauffeur discounts and surcharges.
    - Calculate percentages on the VAT-exclusive journey amount.
    - Apply fixed adjustments per completed journey.
    - Preserve each applied adjustment as a financial snapshot.
    - Prevent the final service fee from becoming negative.
    - Preserve existing monthly invoicing protections.

    Dependencies:
    - 2026-11-11-add-chauffeur-commission-adjustments.sql

    The historical commission-generation migration remains unchanged.
========================================================================*/

/* ------------------------------------------------------------
   SECTION 1: COMMISSION GENERATION WITH ADJUSTMENTS

   Extend the existing commission-generation workflow while
   preserving booking, quotation, and invoicing safeguards.
------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.generate_chauffeur_booking_commission(
    p_booking_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    /* Booking and completion details. */
    v_status public.booking_status;
    v_excluded BOOLEAN;
    v_chauffeur_id UUID;
    v_quote_id UUID;
    v_completed_at TIMESTAMPTZ;
    v_completion_date DATE;

    /* Accepted quotation and VAT-exclusive journey amount. */
    v_quote_status public.journey_quote_status;
    v_currency_code VARCHAR(3);
    v_journey_amount NUMERIC(12,4);
    v_vat_amount NUMERIC(12,4);
    v_total_before_rounding NUMERIC(12,4);

    /* Historical service-fee calculation. */
    v_rate_id UUID;
    v_percentage NUMERIC(7,4);
    v_commission_amount NUMERIC(12,4);
    v_commission_id UUID;

    /* Applied chauffeur adjustment calculations. */
    v_adjustment RECORD;
    v_adjustment_amount NUMERIC(14,4);
    v_total_discount NUMERIC(14,4) := 0;
    v_total_surcharge NUMERIC(14,4) := 0;
    v_final_commission NUMERIC(14,4);
    /* Preserve calculated adjustments for atomic snapshot insertion. */
    v_adjustment_snapshots JSONB := '[]'::JSONB;
BEGIN
    /* SECTION 2: Validate the booking identifier. */
    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'Booking ID is required.'
            USING ERRCODE = '22023';
    END IF;

    /* SECTION 3: Lock and retrieve the booking. */
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

    /* SECTION 4: Preserve existing financial snapshots. */
    SELECT id
    INTO v_commission_id
    FROM public.chauffeur_booking_commissions
    WHERE booking_id = p_booking_id;

    IF FOUND THEN
        RETURN v_commission_id;
    END IF;

    /* SECTION 5: Verify financial eligibility. */
    IF v_status <> 'completed' OR v_completed_at IS NULL THEN
        RAISE EXCEPTION
            'Only completed bookings can generate commissions.'
            USING ERRCODE = '22023';
    END IF;

    IF v_excluded IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION
            'Financially excluded bookings cannot generate commissions.'
            USING ERRCODE = '22023';
    END IF;

    IF v_chauffeur_id IS NULL OR v_quote_id IS NULL THEN
        RAISE EXCEPTION
            'Booking requires a chauffeur and accepted quotation.'
            USING ERRCODE = '22023';
    END IF;
        /* SECTION 6: Determine the official completion date.
       Financial adjustments use the Europe/Amsterdam date. */
    v_completion_date :=
        (v_completed_at AT TIME ZONE 'Europe/Amsterdam')::DATE;

    /* SECTION 7: Coordinate commission generation with invoicing.
       The advisory lock is held until the transaction ends. */
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            v_chauffeur_id::TEXT || ':' ||
            pg_catalog.to_char(v_completion_date, 'YYYY-MM'),
            0
        )
    );

    /* SECTION 8: Prevent new commissions after invoice issuance.
       Issued and paid invoices must remain unchanged. */
    IF EXISTS (
        SELECT 1
        FROM public.chauffeur_invoices AS i
        WHERE i.chauffeur_id = v_chauffeur_id
          AND i.billing_month =
              pg_catalog.date_trunc(
                  'month', v_completion_date::TIMESTAMP
              )::DATE
          AND i.status IN ('issued', 'paid')
    ) THEN
        RAISE EXCEPTION
            'This chauffeur month has already been invoiced. New commissions require an adjustment workflow.'
            USING ERRCODE = '23514';
    END IF;

    /* SECTION 9: Retrieve the accepted journey quotation. */
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
        RAISE EXCEPTION
            'An accepted journey quotation is required.'
            USING ERRCODE = '22023';
    END IF;

    /* SECTION 10: Validate the VAT-exclusive calculation basis. */
    IF v_journey_amount IS NULL
        OR v_journey_amount < 0
        OR v_vat_amount IS NULL
        OR v_total_before_rounding IS NULL
        OR v_journey_amount <>
            (v_total_before_rounding - v_vat_amount)
    THEN
        RAISE EXCEPTION
            'Journey quotation amounts are inconsistent.'
            USING ERRCODE = '22023';
    END IF;

    /* SECTION 11: Select the historical chauffeur service-fee rate.
       Chauffeur-specific rates take priority over default rates.
       The completion date determines which rate applies. */
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

    /* Do not invent a rate when the effective-date schedule has a gap. */
    IF NOT FOUND THEN
        RAISE EXCEPTION
            'No applicable chauffeur service-fee rate exists for this completion date.'
            USING ERRCODE = '22023';
    END IF;

    /* SECTION 12: Calculate the original base service fee.
       Discounts and surcharges will be calculated separately. */
    v_commission_amount :=
        ROUND(v_journey_amount * v_percentage / 100, 4);

    /* SECTION 13: Select historical financial adjustments.
    The Amsterdam completion date determines eligibility.
    Current definition and assignment statuses do not alter history. */
    FOR v_adjustment IN
        SELECT
            fp.assignment_id,
            fp.adjustment_definition_id AS definition_id,
            fp.adjustment_name,
            fp.adjustment_type,
            fp.value_type,
            fp.adjustment_value AS applied_value,
            fp.currency_code
        FROM public.chauffeur_adjustment_financial_periods AS fp
        WHERE fp.chauffeur_id = v_chauffeur_id
        AND fp.period_status = 'applicable'
        AND fp.effective_from <= v_completion_date
        AND (
            fp.effective_until IS NULL
            OR v_completion_date <= fp.effective_until
        )
        ORDER BY fp.assignment_id
        FOR SHARE
    LOOP
        /* Fixed adjustments must use the journey currency. */
        IF v_adjustment.value_type = 'fixed'
           AND v_adjustment.currency_code
               IS DISTINCT FROM v_currency_code THEN
            RAISE EXCEPTION
                'Fixed chauffeur adjustment currency does not match the journey currency.'
                USING ERRCODE = '23514';
        END IF;

        /* Percentage adjustments use the journey amount
           excluding passenger VAT, not the base commission. */
        IF v_adjustment.value_type = 'percentage' THEN
            v_adjustment_amount := ROUND(
                v_journey_amount * v_adjustment.applied_value / 100,
                4
            );
        ELSE
            v_adjustment_amount := v_adjustment.applied_value;
        END IF;

        /* Accumulate discounts and surcharges separately. */
        IF v_adjustment.adjustment_type = 'discount' THEN
            v_total_discount :=
                v_total_discount + v_adjustment_amount;
        ELSE
            v_total_surcharge :=
                v_total_surcharge + v_adjustment_amount;
        END IF;

        /* Preserve exactly the values used in this calculation.
           The commission and its adjustment lines will be
           inserted together in the same database transaction. */
        v_adjustment_snapshots := v_adjustment_snapshots || pg_catalog.jsonb_build_array(
                pg_catalog.jsonb_build_object(
                    'assignment_id', v_adjustment.assignment_id,
                    'definition_id', v_adjustment.definition_id,
                    'adjustment_name', v_adjustment.adjustment_name,
                    'adjustment_type', v_adjustment.adjustment_type,
                    'value_type', v_adjustment.value_type,
                    'applied_value', v_adjustment.applied_value,
                    'calculation_basis', v_journey_amount,
                    'adjustment_amount', v_adjustment_amount,
                    'currency_code', v_currency_code
                )
            );
    END LOOP;

    /* SECTION 14: Calculate the final chauffeur service fee.
       Preserve full adjustment totals for financial auditing.
       The amount payable to Voya Taxi cannot be negative. */
    v_final_commission := GREATEST(
        0,
        v_commission_amount - v_total_discount + v_total_surcharge
    );

    /* SECTION 15: Insert the completed-journey commission.
       Preserve the original service fee, adjustment totals,
       and final payable amount as a financial snapshot. */
    INSERT INTO public.chauffeur_booking_commissions (
        booking_id,
        chauffeur_id,
        journey_quote_id,
        service_fee_rate_id,
        completed_at,
        journey_amount_excluding_vat,
        applied_percentage,
        commission_amount,
        currency_code,
        total_discount_amount,
        total_surcharge_amount,
        final_commission_amount
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
        v_currency_code,
        v_total_discount,
        v_total_surcharge,
        v_final_commission
    )
    RETURNING id INTO v_commission_id;

    /* SECTION 16: Insert the historical adjustment line items.
       Use the exact values collected during calculation.
       All inserts belong to the same database transaction. */
    INSERT INTO public.chauffeur_commission_adjustment_lines (
        commission_id,
        chauffeur_id,
        adjustment_assignment_id,
        adjustment_definition_id,
        adjustment_name,
        adjustment_type,
        value_type,
        applied_value,
        calculation_basis,
        adjustment_amount,
        currency_code
    )
    SELECT
        v_commission_id,
        v_chauffeur_id,
        snapshot.assignment_id,
        snapshot.definition_id,
        snapshot.adjustment_name,
        snapshot.adjustment_type,
        snapshot.value_type,
        snapshot.applied_value,
        snapshot.calculation_basis,
        snapshot.adjustment_amount,
        snapshot.currency_code
    FROM pg_catalog.jsonb_to_recordset(v_adjustment_snapshots) AS snapshot (
        assignment_id UUID,
        definition_id UUID,
        adjustment_name TEXT,
        adjustment_type TEXT,
        value_type TEXT,
        applied_value NUMERIC(14,4),
        calculation_basis NUMERIC(14,4),
        adjustment_amount NUMERIC(14,4),
        currency_code VARCHAR(3)
    );

    /* SECTION 17: Return the generated commission identifier.
       All financial snapshots were inserted successfully. */
    RETURN v_commission_id;
END;
$function$;