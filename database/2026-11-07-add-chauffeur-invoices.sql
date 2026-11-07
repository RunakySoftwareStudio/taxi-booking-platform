    /*=============================================================
        Voya Taxi — Chauffeur Invoice Management

        Creates monthly chauffeur invoice headers and their items.

        Financial rules:
        - One invoice per chauffeur per calendar month.
        - Invoice numbers are assigned only upon issuance.
        - Individual chauffeurs are the invoice recipients.
        - Invoice items reference frozen commission records.
        - A commission cannot belong to multiple invoice items.
        - Issuance and financial protection will be implemented
        through dedicated database functions in a later migration.
    ==================================================================*/
    -- ============================================================
    -- 0. Commission relationship protection
    -- ============================================================

    /*
        Support a composite foreign key using commission ID and chauffeur ID.
        This allows invoice items to reference commissions belonging to the same chauffeur as the invoice.
        Existing commission records are not modified.
    */
    ALTER TABLE public.chauffeur_booking_commissions
        ADD CONSTRAINT chauffeur_booking_commissions_id_chauffeur_key
        UNIQUE (id, chauffeur_id);

    -- ============================================================
    -- 1. Chauffeur invoice headers
    -- ============================================================

    CREATE TABLE public.chauffeur_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        chauffeur_id UUID NOT NULL
            REFERENCES public.chauffeurs(id)
            ON DELETE RESTRICT,

        -- First day of the billing month.
        billing_month DATE NOT NULL,

        -- Official invoice number is assigned upon issuance.
        invoice_number TEXT UNIQUE,

        status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft', 'issued', 'paid')),

        -- Recipient identity snapshot.
        recipient_name TEXT,
        recipient_email TEXT,
        recipient_address TEXT,

        /*
            Financial amounts are stored in invoice currency.
            VAT percentage is selected by Admin before issuance.
            NULL means the draft VAT rate has not been confirmed.
        */
        currency_code VARCHAR(3) NOT NULL DEFAULT 'EUR',

        vat_percentage NUMERIC(7,4)
            CHECK (vat_percentage BETWEEN 0 AND 100),

        subtotal_excluding_vat NUMERIC(12,4) NOT NULL DEFAULT 0,
        vat_amount NUMERIC(12,4) NOT NULL DEFAULT 0,
        total_including_vat NUMERIC(12,4) NOT NULL DEFAULT 0,

        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        issued_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,

        CONSTRAINT chauffeur_invoices_unique_month
            UNIQUE (chauffeur_id, billing_month),
        /*
            Support composite foreign keys from invoice items.
            Each invoice ID and chauffeur ID combination identifies the invoice's legal recipient.
        */
        CONSTRAINT chauffeur_invoices_id_chauffeur_key
            UNIQUE (id, chauffeur_id),
            
        CONSTRAINT chauffeur_invoices_month_start_check
            CHECK (EXTRACT(DAY FROM billing_month) = 1),

        /*
            Ensure invoice totals are non-negative and internally consistent.
            Draft totals may initially be zero.
        */
        CONSTRAINT chauffeur_invoices_amounts_check
            CHECK (
                subtotal_excluding_vat >= 0
                AND vat_amount >= 0
                AND total_including_vat >= 0
                AND total_including_vat =
                    subtotal_excluding_vat + vat_amount
            ),

        /*
            Draft invoices do not need a VAT percentage.

            Issued and paid invoices require an explicitly selected
            VAT percentage, invoice number and issuance timestamp.
        */
        CONSTRAINT chauffeur_invoices_status_dates_check
            CHECK (
                (
                    status = 'draft'
                    AND invoice_number IS NULL
                    AND issued_at IS NULL
                    AND paid_at IS NULL
                )
                OR
                (
                    status = 'issued'
                    AND invoice_number IS NOT NULL
                    AND issued_at IS NOT NULL
                    AND paid_at IS NULL
                    AND vat_percentage IS NOT NULL
                )
                OR
                (
                    status = 'paid'
                    AND invoice_number IS NOT NULL
                    AND issued_at IS NOT NULL
                    AND paid_at IS NOT NULL
                    AND vat_percentage IS NOT NULL
                )
            )
    );

    COMMENT ON TABLE public.chauffeur_invoices IS
        'Monthly invoices issued by Voya Taxi to individual chauffeurs.';

    -- ============================================================
    -- 2. Chauffeur invoice items
    -- ============================================================

    CREATE TABLE public.chauffeur_invoice_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        /*
            Identifies the chauffeur responsible for this invoice line.
            Composite foreign keys ensure the invoice and commission both belong to this chauffeur.
        */
        chauffeur_id UUID NOT NULL,
        invoice_id UUID NOT NULL,
        commission_id UUID NOT NULL,

        -- Frozen invoice-line details.
        description TEXT NOT NULL,
        amount_excluding_vat NUMERIC(12,4) NOT NULL,
        vat_percentage NUMERIC(7,4) NOT NULL DEFAULT 0,
        vat_amount NUMERIC(12,4) NOT NULL DEFAULT 0,
        total_including_vat NUMERIC(12,4) NOT NULL,

        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT chauffeur_invoice_items_unique_commission
            UNIQUE (commission_id),

        /*
            An invoice item must belong to the same chauffeur
            as both its invoice header and frozen commission.
        */
        CONSTRAINT chauffeur_invoice_items_invoice_chauffeur_fk
            FOREIGN KEY (invoice_id, chauffeur_id)
            REFERENCES public.chauffeur_invoices(id, chauffeur_id)
            ON DELETE RESTRICT,

        CONSTRAINT chauffeur_invoice_items_commission_chauffeur_fk
            FOREIGN KEY (commission_id, chauffeur_id)
            REFERENCES public.chauffeur_booking_commissions(id, chauffeur_id)
            ON DELETE RESTRICT,

        /*
            Prevent negative amounts and inconsistent invoice line totals.
            The VAT calculation itself will be validated during issuance.
        */
        CONSTRAINT chauffeur_invoice_items_amounts_check
            CHECK (
                amount_excluding_vat >= 0
                AND vat_percentage >= 0
                AND vat_amount >= 0
                AND total_including_vat >= 0
                AND total_including_vat =
                    amount_excluding_vat + vat_amount
            )
    );

    COMMENT ON TABLE public.chauffeur_invoice_items IS
        'Invoice lines referencing existing frozen chauffeur commissions.';

    -- ============================================================
    -- 3. Indexes
    -- ============================================================

    CREATE INDEX chauffeur_invoices_chauffeur_idx
        ON public.chauffeur_invoices(chauffeur_id);

    CREATE INDEX chauffeur_invoices_status_idx
        ON public.chauffeur_invoices(status);

    CREATE INDEX chauffeur_invoice_items_invoice_idx
        ON public.chauffeur_invoice_items(invoice_id);

    -- ============================================================
    -- 4. Row-level security
    -- ============================================================

    ALTER TABLE public.chauffeur_invoices
        ENABLE ROW LEVEL SECURITY;

    ALTER TABLE public.chauffeur_invoice_items
        ENABLE ROW LEVEL SECURITY;

    -- Revoke direct access from client-facing database roles.
    REVOKE ALL ON public.chauffeur_invoices
        FROM anon, authenticated;

    REVOKE ALL ON public.chauffeur_invoice_items
        FROM anon, authenticated;

    /*
        Allow server-side financial reporting.
        Invoice creation, modification, issuance and payment will be performed through protected PostgreSQL functions.
        Direct table writes are not granted to service_role.
    */
    REVOKE ALL ON public.chauffeur_invoices FROM service_role;
    REVOKE ALL ON public.chauffeur_invoice_items FROM service_role;
    GRANT SELECT ON public.chauffeur_invoices TO service_role;
    GRANT SELECT ON public.chauffeur_invoice_items TO service_role;

    -- ============================================================
    -- 4A. Annual invoice numbering
    -- ============================================================

    /*
        Maintain a separate invoice counter for each calendar year.
        The protected invoice issuance function will increment this counter within the same database transaction.
        No direct client or service-role access is permitted.
    */
    CREATE TABLE public.chauffeur_invoice_number_counters (
        invoice_year INTEGER PRIMARY KEY,
        last_number INTEGER NOT NULL DEFAULT 0,

        CONSTRAINT chauffeur_invoice_counter_year_check
            CHECK (invoice_year BETWEEN 2000 AND 9999),

        CONSTRAINT chauffeur_invoice_counter_number_check
            CHECK (last_number BETWEEN 0 AND 9999)
    );

    /* Restrict access to the annual numbering counters. */
    ALTER TABLE public.chauffeur_invoice_number_counters
        ENABLE ROW LEVEL SECURITY;

    REVOKE ALL ON public.chauffeur_invoice_number_counters
        FROM PUBLIC, anon, authenticated, service_role;

    COMMENT ON TABLE public.chauffeur_invoice_number_counters IS
        'Annual invoice number counters updated atomically during protected invoice issuance.';
    -- ============================================================
    -- 5. Invoice item billing-period validation
    -- ============================================================

    /*
        Validate that each commission belongs to the invoice's calendar billing month in the Europe/Amsterdam timezone.
        This validation runs whenever an invoice item is inserted or its financial relationships are changed.
    */
    CREATE OR REPLACE FUNCTION public.validate_chauffeur_invoice_item_period()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $$
    DECLARE
        v_billing_month DATE;
        v_completed_month DATE;
    BEGIN
        -- Retrieve the invoice's billing month.
        SELECT i.billing_month
        INTO v_billing_month
        FROM public.chauffeur_invoices AS i
        WHERE i.id = NEW.invoice_id;

        -- Retrieve the commission's completion month.
        SELECT date_trunc('month', c.completed_at AT TIME ZONE 'Europe/Amsterdam')::DATE
        INTO v_completed_month
        FROM public.chauffeur_booking_commissions AS c
        WHERE c.id = NEW.commission_id;

        -- Reject a commission from a different billing month.
        IF v_billing_month IS DISTINCT FROM v_completed_month THEN
            RAISE EXCEPTION
                'Commission completion month does not match invoice billing month.'
                USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
    END;
    $$;

    CREATE TRIGGER validate_chauffeur_invoice_item_period_trigger
    BEFORE INSERT OR UPDATE OF invoice_id, commission_id
    ON public.chauffeur_invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_chauffeur_invoice_item_period();   

    -- ============================================================
    -- 6. Protect invoice billing periods
    -- ============================================================

    /*
        Prevent changing an invoice's billing month or chauffeur after commission items have been attached.
        This preserves the billing-period and ownership checks already enforced on individual invoice items.
    */
    CREATE OR REPLACE FUNCTION public.protect_chauffeur_invoice_relationships()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $$
    BEGIN
        IF (
            OLD.billing_month IS DISTINCT FROM NEW.billing_month
            OR OLD.chauffeur_id IS DISTINCT FROM NEW.chauffeur_id
        ) THEN
            IF EXISTS (
                SELECT 1
                FROM public.chauffeur_invoice_items AS item
                WHERE item.invoice_id = OLD.id
            ) THEN
                RAISE EXCEPTION
                    'Cannot change chauffeur or billing month after invoice items have been added.'
                    USING ERRCODE = '23514';
            END IF;
        END IF;

        RETURN NEW;
    END;
    $$;

    CREATE TRIGGER protect_chauffeur_invoice_relationships_trigger
    BEFORE UPDATE OF billing_month, chauffeur_id
    ON public.chauffeur_invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_chauffeur_invoice_relationships();

    -- ============================================================
    -- 7. Protect issued invoice items
    -- ============================================================

    /*
        Allow invoice items to be changed only while their parent invoice remains in draft status.
        Lock the invoice header during validation to prevent concurrent issuance and item modifications.
        Issued and paid invoice items cannot be inserted, updated or deleted.
    */
    CREATE OR REPLACE FUNCTION public.protect_chauffeur_invoice_items()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $$
    DECLARE
        v_invoice_status TEXT;
    BEGIN
        -- Validate the existing invoice for UPDATE or DELETE.
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            SELECT i.status
            INTO v_invoice_status
            FROM public.chauffeur_invoices AS i
            WHERE i.id = OLD.invoice_id
            FOR UPDATE;

            IF v_invoice_status IS DISTINCT FROM 'draft' THEN
                RAISE EXCEPTION
                    'Cannot modify items belonging to an issued or paid invoice.'
                    USING ERRCODE = '23514';
            END IF;
        END IF;

        -- Validate the destination invoice for INSERT or UPDATE.
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            SELECT i.status
            INTO v_invoice_status
            FROM public.chauffeur_invoices AS i
            WHERE i.id = NEW.invoice_id
            FOR UPDATE;

            IF v_invoice_status IS DISTINCT FROM 'draft' THEN
                RAISE EXCEPTION
                    'Invoice items can only be added to draft invoices.'
                    USING ERRCODE = '23514';
            END IF;
        END IF;

        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;

        RETURN NEW;
    END;
    $$;

    CREATE TRIGGER protect_chauffeur_invoice_items_trigger
    BEFORE INSERT OR UPDATE OR DELETE
    ON public.chauffeur_invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_chauffeur_invoice_items();

    -- ============================================================
    -- 8. Protect issued invoice headers
    -- ============================================================

    /*
        Protect issued and paid invoice headers.
        Draft invoices may be edited or deleted.

        Once issued:
        - Financial amounts and recipient details are immutable.
        - Invoice number and issuance date are immutable.
        - Only the transition from issued to paid is permitted.
        - Paid invoices cannot be modified or deleted.

        Protected issuance and payment functions will be
        implemented before financial operations are enabled.
    */
    CREATE OR REPLACE FUNCTION public.protect_chauffeur_invoice_headers()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $$
    BEGIN
        /*
            Draft invoices may be edited or deleted.
            Only a trusted database execution context may transition an invoice from draft to issued.
            The future issuance function will run as postgres using SECURITY DEFINER, after validating the invoice.
            The application's service_role has no direct UPDATE permission on the invoice table.
        */
        IF OLD.status = 'draft' THEN
            IF TG_OP = 'UPDATE' AND NEW.status <> 'draft' THEN
                IF NEW.status <> 'issued' OR current_user <> 'postgres' THEN
                    RAISE EXCEPTION
                        'Invoice issuance requires the protected database workflow.'
                        USING ERRCODE = '23514';
                END IF;
            END IF;

            RETURN COALESCE(NEW, OLD);
        END IF;

        -- Issued and paid invoices cannot be deleted.
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION
                'Issued or paid invoices cannot be deleted.'
                USING ERRCODE = '23514';
        END IF;

        -- Paid invoices are immutable.
        IF OLD.status = 'paid' THEN
            RAISE EXCEPTION
                'Paid invoices cannot be modified.'
                USING ERRCODE = '23514';
        END IF;

        /*
            Issued invoices are immutable.
            Payment status changes are blocked until the protected payment registration function is implemented.
        */
        IF OLD.status = 'issued' THEN
            RAISE EXCEPTION
                'Issued invoices cannot be modified directly. Use the protected payment workflow.'
                USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
    END;
    $$;

    CREATE TRIGGER protect_chauffeur_invoice_headers_trigger
    BEFORE UPDATE OR DELETE
    ON public.chauffeur_invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_chauffeur_invoice_headers();

    -- ============================================================
    -- 9. Protected chauffeur invoice issuance
    -- ============================================================

    /*
        Issue a validated monthly chauffeur invoice.
        The function executes as postgres, while EXECUTE access is restricted to service_role.
        All changes occur in one PostgreSQL transaction.
    */
    CREATE OR REPLACE FUNCTION public.issue_chauffeur_invoice(
        p_invoice_id UUID
    )
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
        pg_catalog.hashtextextended(
            v_lock_chauffeur_id::TEXT || ':' ||
            pg_catalog.to_char(v_lock_billing_month, 'YYYY-MM'),
            0
        )
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
            Validate each invoice item and calculate its VAT.

            Always use the frozen commission amount, never
            the original journey price or a recalculated fee.
        */
        FOR v_line IN
            SELECT
                item.id,
                item.amount_excluding_vat,
                commission.commission_amount,
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
                v_line.commission_amount THEN
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

            v_line_vat := ROUND(v_line.commission_amount * v_invoice.vat_percentage / 100, 4 );

            UPDATE public.chauffeur_invoice_items
            SET
                vat_percentage = v_invoice.vat_percentage,
                vat_amount = v_line_vat,
                total_including_vat = v_line.commission_amount + v_line_vat
            WHERE id = v_line.id;

            v_subtotal := v_subtotal + v_line.commission_amount;
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

    /*
        Only the trusted server-side role can execute issuance.
        Direct application-level table writes remain restricted.
    */
    REVOKE ALL ON FUNCTION public.issue_chauffeur_invoice(UUID)
        FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE ON FUNCTION public.issue_chauffeur_invoice(UUID)
        TO service_role;

    -- ============================================================
    -- 10. Protected monthly draft invoice creation
    -- ============================================================

    /*
        Create or retrieve a chauffeur's monthly draft invoice.

        Rules:
        - One draft per chauffeur and billing month.
        - The billing month must already be completed.
        - Only existing frozen commissions are included.
        - A commission cannot be invoiced twice.
        - The invoice header is locked before items are inserted.
        - VAT and official numbering are finalized during issuance.

        This function is called by the protected Admin API.
    */
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
            c.commission_amount,
            0,
            0,
            c.commission_amount
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

    /* Allow only the trusted server role to request draft creation. */
    REVOKE ALL ON FUNCTION public.create_chauffeur_invoice_draft(UUID, DATE)
        FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE
        ON FUNCTION public.create_chauffeur_invoice_draft(UUID, DATE)
        TO service_role;

    -- ============================================================
    -- 11. Protected invoice VAT selection
    -- ============================================================

    /*
        Set the VAT percentage on a draft invoice.
        Only draft invoices may be changed.
        The approved percentage is used during invoice issuance.
    */
    CREATE OR REPLACE FUNCTION public.set_chauffeur_invoice_vat_rate(
        p_invoice_id UUID,
        p_vat_percentage NUMERIC
    )
    RETURNS VOID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $$
    DECLARE
        v_status TEXT;
    BEGIN
        /* Validate the requested VAT percentage. */
        IF p_invoice_id IS NULL
            OR p_vat_percentage IS NULL
            OR p_vat_percentage < 0
            OR p_vat_percentage > 100
        THEN
            RAISE EXCEPTION
                'A valid invoice ID and VAT percentage between 0 and 100 are required.'
                USING ERRCODE = '22023';
        END IF;

        /* Lock the invoice and verify that it is still a draft. */
        SELECT status
        INTO v_status
        FROM public.chauffeur_invoices
        WHERE id = p_invoice_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invoice not found.'
                USING ERRCODE = 'P0002';
        END IF;

        IF v_status <> 'draft' THEN
            RAISE EXCEPTION
                'VAT percentage can only be changed on draft invoices.'
                USING ERRCODE = '23514';
        END IF;

        /* Save the percentage; invoice issuance calculates the VAT amounts. */
        UPDATE public.chauffeur_invoices
        SET vat_percentage = p_vat_percentage
        WHERE id = p_invoice_id;
    END;
    $$;

    /* Restrict VAT selection to the trusted server-side role. */
    REVOKE ALL ON FUNCTION public.set_chauffeur_invoice_vat_rate(UUID, NUMERIC)
        FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE
        ON FUNCTION public.set_chauffeur_invoice_vat_rate(UUID, NUMERIC)
        TO service_role;
        
    -- ============================================================
    -- 12. Restrict internal invoice trigger functions
    -- ============================================================

    /*
        Trigger functions are internal database components.

        Remove default PUBLIC execution privileges.
        PostgreSQL invokes these functions through their triggers.
    */
    REVOKE ALL ON FUNCTION public.validate_chauffeur_invoice_item_period()
        FROM PUBLIC, anon, authenticated, service_role;

    REVOKE ALL ON FUNCTION public.protect_chauffeur_invoice_relationships()
        FROM PUBLIC, anon, authenticated, service_role;

    REVOKE ALL ON FUNCTION public.protect_chauffeur_invoice_items()
        FROM PUBLIC, anon, authenticated, service_role;

    REVOKE ALL ON FUNCTION public.protect_chauffeur_invoice_headers()
        FROM PUBLIC, anon, authenticated, service_role;
    /*=============================================================
        END Voya Taxi — Chauffeur Invoice Management
    ==================================================================*/
