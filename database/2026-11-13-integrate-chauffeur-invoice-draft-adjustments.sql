CREATE OR REPLACE FUNCTION public.create_chauffeur_invoice_draft(
        p_chauffeur_id UUID,
        p_billing_month DATE
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $$
    DECLARE
        v_invoice_id UUID;
        v_status TEXT;
        v_currency_code VARCHAR(3);
        v_current_month DATE;
    BEGIN
        /* Validate the requested billing month. */
        IF p_chauffeur_id IS NULL OR p_billing_month IS NULL THEN
            RAISE EXCEPTION
                'Chauffeur and billing month are required.'
                USING ERRCODE = '22023';
        END IF;

        IF EXTRACT(DAY FROM p_billing_month) <> 1 THEN
            RAISE EXCEPTION
                'Billing month must be the first day of a month.'
                USING ERRCODE = '22023';
        END IF;

        v_current_month := DATE_TRUNC('month', CLOCK_TIMESTAMP() AT TIME ZONE 'Europe/Amsterdam')::DATE;

        IF p_billing_month >= v_current_month THEN
            RAISE EXCEPTION
                'Only completed billing months can be invoiced.'
                USING ERRCODE = '23514';
        END IF;

        /*
            Coordinate draft creation with commission generation.
            Use the same chauffeur-and-month advisory lock key as generate_chauffeur_booking_commission().
            The lock remains active until the transaction ends.
        */
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(
                p_chauffeur_id::TEXT || ':' ||
                pg_catalog.to_char(p_billing_month, 'YYYY-MM'),
                0
            )
        );

        /*
            Use frozen commissions only.
            Reject months containing multiple currencies because a single invoice must have one currency.
        */
        SELECT MIN(c.currency_code)
        INTO v_currency_code
        FROM public.chauffeur_booking_commissions AS c
        WHERE c.chauffeur_id = p_chauffeur_id
        AND DATE_TRUNC('month', c.completed_at AT TIME ZONE 'Europe/Amsterdam')::DATE = p_billing_month;

        IF v_currency_code IS NULL THEN
            RAISE EXCEPTION
                'No frozen commissions found for this chauffeur and month.'
                USING ERRCODE = '23514';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.chauffeur_booking_commissions AS c
            WHERE c.chauffeur_id = p_chauffeur_id
            AND DATE_TRUNC('month', c.completed_at AT TIME ZONE 'Europe/Amsterdam')::DATE = p_billing_month
            AND c.currency_code <> v_currency_code
        ) THEN
            RAISE EXCEPTION
                'Multiple commission currencies cannot share one invoice.'
                USING ERRCODE = '23514';
        END IF;

        /*
            Create the invoice if necessary.
            The unique chauffeur/month constraint prevents concurrent requests from creating duplicate headers.
        */
        INSERT INTO public.chauffeur_invoices (
            chauffeur_id,
            billing_month,
            currency_code
        )
        VALUES (
            p_chauffeur_id,
            p_billing_month,
            v_currency_code
        )
        ON CONFLICT (chauffeur_id, billing_month)
        DO NOTHING;

        /*
            Lock the invoice header before modifying its items.
            This follows our required consistent locking order.
        */
        SELECT id, status
        INTO v_invoice_id, v_status
        FROM public.chauffeur_invoices
        WHERE chauffeur_id = p_chauffeur_id
        AND billing_month = p_billing_month
        AND currency_code = v_currency_code
        FOR UPDATE;

        IF v_invoice_id IS NULL THEN
            RAISE EXCEPTION
                'Existing invoice currency does not match the commissions.'
                USING ERRCODE = '23514';
        END IF;

        IF v_status <> 'draft' THEN
            RAISE EXCEPTION
                'Only draft invoices can receive commission items.'
                USING ERRCODE = '23514';
        END IF;

        /*
            Attach frozen commissions that are not already present.

            Draft lines initially have zero VAT; the issuance
            function applies the Admin-approved VAT percentage.
        */
        INSERT INTO public.chauffeur_invoice_items (
            invoice_id,
            chauffeur_id,
            commission_id,
            description,
            amount_excluding_vat,
            vat_percentage,
            vat_amount,
            total_including_vat
        )
        SELECT
            v_invoice_id,
            c.chauffeur_id,
            c.id,
            'Voya Taxi service fee - booking ' || c.booking_id::TEXT,
            /* Use the frozen final commission after all adjustments. */
            c.final_commission_amount,
            0,
            0,
            c.final_commission_amount
        FROM public.chauffeur_booking_commissions AS c
        WHERE c.chauffeur_id = p_chauffeur_id
        AND c.currency_code = v_currency_code
        AND DATE_TRUNC('month', c.completed_at AT TIME ZONE 'Europe/Amsterdam')::DATE = p_billing_month
        AND NOT EXISTS (
            SELECT 1
            FROM public.chauffeur_invoice_items AS item
            WHERE item.commission_id = c.id
        );

        RETURN v_invoice_id;
    END;
    $$;
