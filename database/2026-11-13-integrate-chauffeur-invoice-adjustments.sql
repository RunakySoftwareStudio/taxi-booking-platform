CREATE OR REPLACE FUNCTION public.issue_chauffeur_invoice(p_invoice_id UUID)
        RETURNS TEXT
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_invoice public.chauffeur_invoices%ROWTYPE;
            v_line RECORD;

            /* Preserve the invoice identity used to acquire the advisory lock. */
            v_lock_chauffeur_id UUID;
            v_lock_billing_month DATE;

            v_recipient_name TEXT;
            v_recipient_email TEXT;
            v_recipient_address TEXT;
            /* Store Voya Taxi's current business settings for the invoice snapshot. */
            v_sender public.platform_invoice_settings%ROWTYPE;

            v_subtotal NUMERIC(12,4) := 0;
            v_vat_total NUMERIC(12,4) := 0;
            v_line_vat NUMERIC(12,4);
            v_line_count INTEGER := 0;

            v_issued_at TIMESTAMPTZ;
            v_invoice_year INTEGER;
            v_sequence INTEGER;
            v_invoice_number TEXT;
        BEGIN
        /*
            Step 1: Read the invoice identity without locking the row.

            We need the chauffeur and billing month to calculate
            the same advisory lock key used by commission generation.
        */
        SELECT chauffeur_id, billing_month
        INTO v_lock_chauffeur_id, v_lock_billing_month
        FROM public.chauffeur_invoices
        WHERE id = p_invoice_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invoice not found.'
                USING ERRCODE = 'P0002';
        END IF;

        /*
            Step 2: Acquire the chauffeur-and-month transaction lock.

            This coordinates invoice issuance with commission
            generation and draft creation.
        */
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(v_lock_chauffeur_id::TEXT || ':' || pg_catalog.to_char(v_lock_billing_month, 'YYYY-MM'), 0 )
        );

            /*
                Step 3: Lock and retrieve the invoice header.

                Recheck its identity because the initial read
                occurred before acquiring the locks.
            */
            SELECT *
            INTO v_invoice
            FROM public.chauffeur_invoices
            WHERE id = p_invoice_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Invoice no longer exists.'
                    USING ERRCODE = 'P0002';
            END IF;

            IF v_invoice.chauffeur_id IS DISTINCT FROM v_lock_chauffeur_id
                OR v_invoice.billing_month IS DISTINCT FROM v_lock_billing_month
            THEN
                RAISE EXCEPTION
                    'Invoice chauffeur or billing month changed during issuance. Retry the operation.'
                    USING ERRCODE = '23514';
            END IF;

            IF v_invoice.status <> 'draft' THEN
                RAISE EXCEPTION 'Only draft invoices can be issued.'
                    USING ERRCODE = '23514';
            END IF;

            /*
                Only completed calendar months may be invoiced.

                Use Europe/Amsterdam as the business timezone.
                Current and future billing months cannot be issued.
            */
            IF v_invoice.billing_month >= DATE_TRUNC('month', CLOCK_TIMESTAMP() AT TIME ZONE 'Europe/Amsterdam')::DATE
            THEN
                RAISE EXCEPTION
                    'The invoice billing month must be completed before issuance.'
                    USING ERRCODE = '23514';
            END IF;

            IF v_invoice.vat_percentage IS NULL THEN
                RAISE EXCEPTION 'Invoice VAT percentage must be selected.'
                    USING ERRCODE = '23514';
            END IF;

            /*
                Retrieve the current chauffeur identity.
                The values will be frozen on the issued invoice.
            */
            SELECT name, email, address
            INTO
                v_recipient_name,
                v_recipient_email,
                v_recipient_address
            FROM public.chauffeurs
            WHERE id = v_invoice.chauffeur_id;

            IF NULLIF(BTRIM(v_recipient_name), '') IS NULL
                OR NULLIF(BTRIM(v_recipient_email), '') IS NULL
                OR NULLIF(BTRIM(v_recipient_address), '') IS NULL
            THEN
                RAISE EXCEPTION
                    'Chauffeur name, email and address are required.'
                    USING ERRCODE = '23514';
            END IF;

            /*
                Retrieve Voya Taxi's invoice sender information.
                Required business details must exist before issuance.
            */
            SELECT *
            INTO v_sender
            FROM public.platform_invoice_settings
            WHERE id = 1;

            IF NOT FOUND THEN
                RAISE EXCEPTION
                    'Platform invoice settings are missing.'
                    USING ERRCODE = '23514';
            END IF;

            /* Validate the required invoice sender details. */
            IF NULLIF(BTRIM(v_sender.legal_name), '') IS NULL
                OR NULLIF(BTRIM(v_sender.business_address), '') IS NULL
                OR NULLIF(BTRIM(v_sender.kvk_number), '') IS NULL
                OR NULLIF(BTRIM(v_sender.vat_number), '') IS NULL
                OR NULLIF(BTRIM(v_sender.contact_email), '') IS NULL
                OR NULLIF(BTRIM(v_sender.iban), '') IS NULL
            THEN
                RAISE EXCEPTION
                    'Complete Voya Taxi business details before issuing invoices.'
                    USING ERRCODE = '23514';
            END IF;

            /*
                Validate each invoice item and calculate its VAT.

                Always use the frozen commission amount, never
                the original journey price or a recalculated fee.
            */
            FOR v_line IN
                SELECT
                    item.id,
                    item.amount_excluding_vat,
                    commission.final_commission_amount,
                    commission.currency_code,
                    commission.completed_at
                FROM public.chauffeur_invoice_items AS item
                JOIN
                    public.chauffeur_booking_commissions AS commission
                    ON commission.id = item.commission_id
                WHERE
                    item.invoice_id = p_invoice_id
                ORDER BY item.id
                FOR UPDATE OF item
            LOOP
                IF v_line.amount_excluding_vat <>
                    v_line.final_commission_amount THEN
                    RAISE EXCEPTION
                        'Invoice item amount differs from its frozen commission.'
                        USING ERRCODE = '23514';
                END IF;

                IF v_line.currency_code <> v_invoice.currency_code THEN
                    RAISE EXCEPTION
                        'Invoice and commission currencies do not match.'
                        USING ERRCODE = '23514';
                END IF;

                IF DATE_TRUNC('month', v_line.completed_at AT TIME ZONE 'Europe/Amsterdam')::DATE <> v_invoice.billing_month THEN
                    RAISE EXCEPTION
                        'Commission is outside the invoice billing month.'
                        USING ERRCODE = '23514';
                END IF;

                v_line_vat := ROUND(v_line.final_commission_amount * v_invoice.vat_percentage / 100, 4 );

                UPDATE public.chauffeur_invoice_items
                SET
                    vat_percentage = v_invoice.vat_percentage,
                    vat_amount = v_line_vat,
                    total_including_vat = v_line.final_commission_amount + v_line_vat
                WHERE id = v_line.id;

                v_subtotal := v_subtotal + v_line.final_commission_amount;
                v_vat_total := v_vat_total + v_line_vat;
                v_line_count := v_line_count + 1;
            END LOOP;

            IF v_line_count = 0 THEN
                RAISE EXCEPTION 'Cannot issue an invoice without items.'
                    USING ERRCODE = '23514';
            END IF;

            /*
                Ensure that every frozen commission for this chauffeur and billing month is included in the invoice.
                Prevent issuing an incomplete draft when additional commissions were generated after draft creation.
            */
            IF EXISTS (
                SELECT 1
                FROM public.chauffeur_booking_commissions AS c
                WHERE c.chauffeur_id = v_invoice.chauffeur_id
                AND DATE_TRUNC('month', c.completed_at AT TIME ZONE 'Europe/Amsterdam')::DATE = v_invoice.billing_month
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.chauffeur_invoice_items AS item
                    WHERE item.invoice_id = p_invoice_id
                        AND item.commission_id = c.id
                )
            ) THEN
                RAISE EXCEPTION
                    'Invoice is incomplete. Refresh its commissions before issuance.'
                    USING ERRCODE = '23514';
            END IF;

            /*
                Allocate the next annual invoice number atomically.
                Use the issuance year in Europe/Amsterdam, not the billing month.
            */
            v_issued_at := CLOCK_TIMESTAMP();
            v_invoice_year := EXTRACT(YEAR FROM v_issued_at AT TIME ZONE 'Europe/Amsterdam')::INTEGER;

            INSERT INTO public.chauffeur_invoice_number_counters (
                invoice_year,
                last_number
            )
            VALUES (v_invoice_year, 1)
            ON CONFLICT (invoice_year)
            DO UPDATE
            SET last_number = public.chauffeur_invoice_number_counters.last_number + 1
            RETURNING last_number INTO v_sequence;

            v_invoice_number :='VT-' || v_invoice_year::TEXT || '-' || LPAD(v_sequence::TEXT, 4, '0');

            /*
                Freeze recipient details, financial totals and
                official invoice number in the issued record.
            */
            UPDATE public.chauffeur_invoices
            SET
                recipient_name = v_recipient_name,
                recipient_email = v_recipient_email,
                recipient_address = v_recipient_address,

                /* Freeze Voya Taxi's sender identity and payment terms. */
                sender_legal_name = v_sender.legal_name,
                sender_business_address = v_sender.business_address,
                sender_kvk_number = v_sender.kvk_number,
                sender_vat_number = v_sender.vat_number,
                sender_contact_email = v_sender.contact_email,
                sender_iban = v_sender.iban,
                sender_bic = v_sender.bic,
                payment_terms_days = v_sender.payment_terms_days,

                subtotal_excluding_vat = v_subtotal,
                vat_amount = v_vat_total,
                total_including_vat = v_subtotal + v_vat_total,
                invoice_number = v_invoice_number,
                issued_at = v_issued_at,
                status = 'issued'
            WHERE id = p_invoice_id;

            RETURN v_invoice_number;
    END;
    $$;