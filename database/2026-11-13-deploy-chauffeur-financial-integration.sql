/* ============================================================
   VOYA TAXI — CHAUFFEUR FINANCIAL INTEGRATION DEPLOYMENT

   Purpose:
   Deploy commission adjustments, financial history,
   protected management functions and invoice integration.

   All seven migrations must succeed or roll back together.

   IMPORTANT:
   Review and validate before executing in Supabase.
============================================================ */

BEGIN;
    /* ============================================================
    DEPLOYMENT SECTION 1 — COMMISSION ADJUSTMENT STRUCTURE

    Extend chauffeur commissions, create adjustment snapshots,
    and establish the required financial relationships.
    ==============================+++============================== */

    /* ------------------------------------------------------------
    SECTION 1: EXTEND CHAUFFEUR COMMISSIONS

    commission_amount remains the original base service fee.
    The final payable amount cannot be negative.
    ------------------------------------------------------------ */

    ALTER TABLE public.chauffeur_booking_commissions
        ADD COLUMN total_discount_amount NUMERIC(14,4)
            NOT NULL DEFAULT 0,
        ADD COLUMN total_surcharge_amount NUMERIC(14,4)
            NOT NULL DEFAULT 0,
        /* Every generated commission must contain its final payable amount. */
        ADD COLUMN final_commission_amount NUMERIC(14,4) NOT NULL;

    /* Prevent negative adjustment totals and final service fees. */
    ALTER TABLE public.chauffeur_booking_commissions
        ADD CONSTRAINT chauffeur_commission_discount_total_valid
            CHECK (total_discount_amount >= 0),
        ADD CONSTRAINT chauffeur_commission_surcharge_total_valid
            CHECK (total_surcharge_amount >= 0),
        ADD CONSTRAINT chauffeur_commission_final_amount_valid
            CHECK (final_commission_amount >= 0),

        /* Ensure the final fee matches the stored adjustment totals. */
        ADD CONSTRAINT chauffeur_commission_final_calculation_valid
            /* Final commission must equal the base fee after adjustments. */
            CHECK (
                final_commission_amount = GREATEST(
                    0,
                    commission_amount - total_discount_amount + total_surcharge_amount
                )
            );


    /* Ensure adjustment lines reference the commission currency. */
    ALTER TABLE public.chauffeur_booking_commissions
        ADD CONSTRAINT chauffeur_commission_identity_currency_unique
        UNIQUE (id, chauffeur_id, currency_code);
            
    /* ------------------------------------------------------------
    SECTION 2: COMMISSION ADJUSTMENT LINE ITEMS

    Preserve a financial snapshot of each discount or surcharge
    applied when a chauffeur commission is generated.

    Historical calculation values remain independent of later
    changes to adjustment definitions and assignments.
    ------------------------------------------------------------ */

    CREATE TABLE public.chauffeur_commission_adjustment_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        /* Identify the commission and its chauffeur. */
        commission_id UUID NOT NULL,
        chauffeur_id UUID NOT NULL,
        currency_code VARCHAR(3) NOT NULL,

        /* Ensure the adjustment belongs to the same commission, chauffeur, and currency. */
        CONSTRAINT chauffeur_commission_line_commission_identity_fkey
            FOREIGN KEY (commission_id, chauffeur_id, currency_code)
            REFERENCES public.chauffeur_booking_commissions(id, chauffeur_id, currency_code)
            ON DELETE RESTRICT,

        /* Reference the original assignment and adjustment definition. */
        adjustment_assignment_id UUID NOT NULL,
        adjustment_definition_id UUID NOT NULL,

        /* Preserve the definition referenced by the financial snapshot. */
        CONSTRAINT chauffeur_commission_line_definition_fkey
            FOREIGN KEY (adjustment_definition_id)
            REFERENCES public.chauffeur_adjustment_definitions(id)
            ON DELETE RESTRICT,

        /* Snapshot of the applied financial adjustment. */
        adjustment_name TEXT NOT NULL,
        adjustment_type TEXT NOT NULL,
        value_type TEXT NOT NULL,
        applied_value NUMERIC(14,4) NOT NULL,

        /* Monetary calculation and currency snapshot. */
        calculation_basis NUMERIC(14,4) NOT NULL,
        adjustment_amount NUMERIC(14,4) NOT NULL,

        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

        /* Validate stored adjustment values. */
        CONSTRAINT chauffeur_commission_line_type_valid
            CHECK (adjustment_type IN ('discount', 'surcharge')),

        CONSTRAINT chauffeur_commission_line_value_type_valid
            CHECK (value_type IN ('percentage', 'fixed')),

        CONSTRAINT chauffeur_commission_line_value_valid
            CHECK (applied_value > 0),

        CONSTRAINT chauffeur_commission_line_amount_valid
            CHECK (adjustment_amount >= 0),

        CONSTRAINT chauffeur_commission_line_basis_valid
            CHECK (calculation_basis >= 0),

        CONSTRAINT chauffeur_commission_line_currency_valid
            CHECK (currency_code ~ '^[A-Z]{3}$'),

        CONSTRAINT chauffeur_commission_line_percentage_valid
            CHECK (
                value_type <> 'percentage'
                OR adjustment_type <> 'discount'
                OR applied_value <= 100
            ),

        /* Prevent applying the same assignment twice to one commission. */
        CONSTRAINT chauffeur_commission_line_unique_assignment
            UNIQUE (commission_id, adjustment_assignment_id)
    );

    /* ------------------------------------------------------------
    SECTION 3: PROTECT ASSIGNMENT RELATIONSHIPS

    Ensure an adjustment line references an assignment belonging
    to the same chauffeur and adjustment definition.
    ------------------------------------------------------------ */

    /* Support composite foreign-key references to assignments. */
    ALTER TABLE public.chauffeur_adjustment_assignments
        ADD CONSTRAINT chauffeur_assignment_identity_unique
        UNIQUE (id, chauffeur_id, adjustment_definition_id);

    /* Enforce assignment, chauffeur, and definition consistency. */
    ALTER TABLE public.chauffeur_commission_adjustment_lines
        ADD CONSTRAINT chauffeur_commission_line_assignment_identity_fkey
        FOREIGN KEY (
            adjustment_assignment_id,
            chauffeur_id,
            adjustment_definition_id
        )
        REFERENCES public.chauffeur_adjustment_assignments (
            id,
            chauffeur_id,
            adjustment_definition_id
        )
        ON DELETE RESTRICT;
    /* ------------------------------------------------------------
    SECTION 4: FINANCIAL SNAPSHOT SECURITY

    Restrict adjustment lines to trusted server-side operations.
    Historical line items must not be updated or deleted.
    ------------------------------------------------------------ */

    /* Enable Row Level Security for adjustment snapshots. */
    ALTER TABLE public.chauffeur_commission_adjustment_lines
        ENABLE ROW LEVEL SECURITY;

    /* Block direct access by ordinary application roles. */
    REVOKE ALL ON TABLE public.chauffeur_commission_adjustment_lines
        FROM PUBLIC, anon, authenticated;

    /* Allow trusted server-side reading and initial creation. */
    GRANT SELECT, INSERT ON TABLE public.chauffeur_commission_adjustment_lines
        TO service_role;

    /* Explicitly prohibit modification and deletion of snapshots. */
    REVOKE UPDATE, DELETE, TRUNCATE
        ON TABLE public.chauffeur_commission_adjustment_lines
        FROM service_role;

    /* Optimize retrieving adjustment lines for each commission. */
    CREATE INDEX idx_chauffeur_commission_adjustment_lines_commission
        ON public.chauffeur_commission_adjustment_lines(commission_id);

    /* ------------------------------------------------------------
    SECTION 5: PROTECT HISTORICAL FINANCIAL SNAPSHOTS

    Block updates and deletions of commission adjustment lines.
    Corrections must use a separate audited financial workflow.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION public.protect_chauffeur_commission_adjustment_line()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = ''
    AS $$
    BEGIN
        RAISE EXCEPTION
            'Historical commission adjustment lines cannot be modified or deleted.'
            USING ERRCODE = '23514';
    END;
    $$;

    /* Prevent modification or deletion of historical line items. */
    CREATE TRIGGER trg_protect_chauffeur_commission_adjustment_line
    BEFORE UPDATE OR DELETE
    ON public.chauffeur_commission_adjustment_lines
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_chauffeur_commission_adjustment_line();

    /* Restrict direct execution of the protection function. */
    REVOKE ALL ON FUNCTION public.protect_chauffeur_commission_adjustment_line()
    FROM PUBLIC, anon, authenticated;

    /* ------------------------------------------------------------
    SECTION 6: PROTECT CHAUFFEUR ASSIGNMENT IDENTITY

    Prevent reassignment of an existing adjustment record to
    another chauffeur or adjustment definition.

    Dates and activation status remain editable.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION public.protect_chauffeur_adjustment_assignment_identity()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = ''
    AS $$
    BEGIN
        IF NEW.chauffeur_id IS DISTINCT FROM OLD.chauffeur_id
        OR NEW.adjustment_definition_id
            IS DISTINCT FROM OLD.adjustment_definition_id THEN

            RAISE EXCEPTION
                'Chauffeur and adjustment definition cannot be changed on an existing assignment.'
                USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
    END;
    $$;

    /* Enforce stable assignment ownership and definition identity. */
    CREATE TRIGGER trg_protect_chauffeur_adjustment_assignment_identity
    BEFORE UPDATE
    ON public.chauffeur_adjustment_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_chauffeur_adjustment_assignment_identity();

    /* Restrict direct execution of the trigger function. */
    REVOKE ALL ON FUNCTION public.protect_chauffeur_adjustment_assignment_identity()
    FROM PUBLIC, anon, authenticated;

    /* ============================================================
    DEPLOYMENT SECTION 2 — CHAUFFEUR FINANCIAL HISTORY

    Create financial periods, historical audit records,
    constraints, and protection triggers.
    ============================================================ */
   /* ------------------------------------------------------------
    SECTION 1: FINANCIAL ADJUSTMENT PERIODS

    Multiple different adjustments may apply simultaneously.
    Effective dates are inclusive.
    ------------------------------------------------------------ */

    CREATE TABLE public.chauffeur_adjustment_financial_periods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        /* Original assignment and definition identities. */
        assignment_id UUID NOT NULL
            REFERENCES public.chauffeur_adjustment_assignments(id)
            ON DELETE RESTRICT,

        chauffeur_id UUID NOT NULL
            REFERENCES public.chauffeurs(id)
            ON DELETE RESTRICT,

        adjustment_definition_id UUID NOT NULL
            REFERENCES public.chauffeur_adjustment_definitions(id)
            ON DELETE RESTRICT,

        /* Historical financial definition snapshot. */
        adjustment_name TEXT NOT NULL,
        adjustment_type TEXT NOT NULL,
        value_type TEXT NOT NULL,
        adjustment_value NUMERIC(14,4) NOT NULL,
        currency_code VARCHAR(3),

        /* Period during which this financial version applies. */
        effective_from DATE NOT NULL,
        effective_until DATE,

        /* Financial period lifecycle.
        Applicable periods may be current, historical, or scheduled.
        Cancelled periods remain stored but never affect commissions. */
        period_status TEXT NOT NULL DEFAULT 'applicable',

        /* Historical recording information. */
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

        /* Restrict financial periods to recognized lifecycle states. */
        CONSTRAINT chauffeur_financial_period_status_valid
            CHECK (period_status IN ('applicable', 'cancelled')),

        /* Financial validation. */
        CONSTRAINT chauffeur_financial_period_type_valid
            CHECK (adjustment_type IN ('discount', 'surcharge')),

        CONSTRAINT chauffeur_financial_period_value_type_valid
            CHECK (value_type IN ('percentage', 'fixed')),

        CONSTRAINT chauffeur_financial_period_value_valid
            CHECK (adjustment_value > 0),

        CONSTRAINT chauffeur_financial_period_percentage_valid
            CHECK (
                value_type <> 'percentage'
                OR adjustment_type <> 'discount'
                OR adjustment_value <= 100
            ),

        CONSTRAINT chauffeur_financial_period_currency_valid
            CHECK (
                currency_code IS NULL
                OR currency_code ~ '^[A-Z]{3}$'
            ),

        CONSTRAINT chauffeur_financial_period_fixed_currency_valid
            CHECK (
                value_type <> 'fixed'
                OR currency_code IS NOT NULL
            ),

        CONSTRAINT chauffeur_financial_period_dates_valid
            CHECK (
                effective_until IS NULL
                OR effective_until >= effective_from
            )
    );

    /* Prevent duplicate applicable periods starting on the same day.
    Cancelled periods remain available for historical auditing. */
    CREATE UNIQUE INDEX chauffeur_financial_period_unique_start
        ON public.chauffeur_adjustment_financial_periods (
            assignment_id,
            effective_from
        )
        WHERE period_status = 'applicable';
    /* ------------------------------------------------------------
    SECTION 2: PREVENT OVERLAPPING FINANCIAL PERIODS

    Prevent overlapping applicable periods for one assignment.
    Cancelled periods remain stored for historical auditing
    but do not block new financial periods. 
    ------------------------------------------------------------ */

    ALTER TABLE public.chauffeur_adjustment_financial_periods
        ADD CONSTRAINT chauffeur_financial_period_no_overlap
        EXCLUDE USING gist (
            assignment_id WITH =,
            daterange(effective_from, effective_until, '[]') WITH &&
        )
        WHERE (period_status = 'applicable');

    /* ------------------------------------------------------------
    SECTION 3: PROTECT FINANCIAL HISTORY RELATIONSHIPS

    Ensure each financial period references an assignment
    belonging to the same chauffeur and adjustment definition.
    ------------------------------------------------------------ */

    ALTER TABLE public.chauffeur_adjustment_financial_periods
        ADD CONSTRAINT chauffeur_financial_period_assignment_identity_fkey
        FOREIGN KEY (
            assignment_id,
            chauffeur_id,
            adjustment_definition_id
        )
        REFERENCES public.chauffeur_adjustment_assignments (
            id,
            chauffeur_id,
            adjustment_definition_id
        )
        ON DELETE RESTRICT;

    /* ------------------------------------------------------------
    SECTION 4: PROTECT HISTORICAL FINANCIAL VALUES

    Prevent modification of financial values and identities.
    Only effective_until may be changed by a future controlled
    financial-period management workflow.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION
        public.protect_chauffeur_adjustment_financial_period()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = ''
    AS $function$
    BEGIN
        /* Historical financial periods cannot be deleted. */
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION
                'Historical chauffeur financial periods cannot be deleted.'
                USING ERRCODE = '23514';
        END IF;
        
        /* Cancelled financial periods are permanent historical records.
        Their values, dates and status must never change. */
        IF OLD.period_status = 'cancelled' THEN
            RAISE EXCEPTION
                'Cancelled financial periods cannot be modified.'
                USING ERRCODE = '23514';
        END IF;

        /* Preserve the original financial identity and values. */
        IF ROW(
            NEW.id,
            NEW.assignment_id,
            NEW.chauffeur_id,
            NEW.adjustment_definition_id,
            NEW.adjustment_name,
            NEW.adjustment_type,
            NEW.value_type,
            NEW.adjustment_value,
            NEW.currency_code,
            NEW.effective_from,
            NEW.created_at
        ) IS DISTINCT FROM ROW(
            OLD.id,
            OLD.assignment_id,
            OLD.chauffeur_id,
            OLD.adjustment_definition_id,
            OLD.adjustment_name,
            OLD.adjustment_type,
            OLD.value_type,
            OLD.adjustment_value,
            OLD.currency_code,
            OLD.effective_from,
            OLD.created_at
        ) THEN
            RAISE EXCEPTION
                'Historical chauffeur financial values cannot be modified.'
                USING ERRCODE = '23514';
        END IF;

        /* --------------------------------------------------------
        Protect financial period cancellation.

        Only future applicable periods may become cancelled.
        Cancellation preserves the complete financial record.
        -------------------------------------------------------- */

        IF NEW.period_status IS DISTINCT FROM OLD.period_status THEN

            /* A cancelled period cannot be restored by changing
            its status. Reactivation requires a new period. */
            IF OLD.period_status <> 'applicable'
            OR NEW.period_status <> 'cancelled' THEN
                RAISE EXCEPTION
                    'Invalid financial period status transition.'
                    USING ERRCODE = '23514';
            END IF;

            /* Only periods starting after today can be cancelled. */
            IF OLD.effective_from <=
                (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE
            THEN
                RAISE EXCEPTION
                    'Only future financial periods can be cancelled.'
                    USING ERRCODE = '23514';
            END IF;

            /* Cancellation must not alter the financial end date. */
            IF NEW.effective_until IS DISTINCT FROM OLD.effective_until THEN
                RAISE EXCEPTION
                    'Financial period cancellation cannot change effective dates.'
                    USING ERRCODE = '23514';
            END IF;

        END IF;

        /* ----------------------------------------------------------------
        Protect financial period closure.

        A period may only be shortened prospectively.
        Previously closed periods cannot be extended or reopened. 
        ------------------------------------------------------------------*/
        IF NEW.effective_until IS DISTINCT FROM OLD.effective_until THEN

            /* Prevent reopening or extending an existing closure. */
            IF OLD.effective_until IS NOT NULL
            AND (
                NEW.effective_until IS NULL
                OR NEW.effective_until > OLD.effective_until
            ) THEN
                RAISE EXCEPTION
                    'Closed financial periods cannot be reopened or extended.'
                    USING ERRCODE = '23514';
            END IF;

            /* Prevent removing a historical closure or shortening
            a period into an already completed calendar day. */
            IF NEW.effective_until IS NULL
            OR NEW.effective_until <
                (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE
            THEN
                RAISE EXCEPTION
                    'Financial periods cannot be closed retroactively.'
                    USING ERRCODE = '23514';
            END IF;
        END IF;

        RETURN NEW;
    END;
    $function$;

    /* Enforce financial snapshot protection. */
    CREATE TRIGGER trg_protect_chauffeur_adjustment_financial_period
    BEFORE UPDATE OR DELETE
    ON public.chauffeur_adjustment_financial_periods
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_chauffeur_adjustment_financial_period();
    /* ------------------------------------------------------------
    SECTION 5: FINANCIAL HISTORY ACCESS SECURITY

    Restrict financial history to trusted server-side access.
    Public users and ordinary authenticated users cannot
    directly access or modify financial periods.
    ------------------------------------------------------------ */

    /* Enable Row Level Security. */
    ALTER TABLE public.chauffeur_adjustment_financial_periods
        ENABLE ROW LEVEL SECURITY;

    /* Remove direct access from ordinary application roles. */
    REVOKE ALL ON TABLE public.chauffeur_adjustment_financial_periods
        FROM PUBLIC, anon, authenticated;

    /* Allow trusted server-side inspection of financial history.
    Creation and closure will use protected database functions. */
    GRANT SELECT
        ON TABLE public.chauffeur_adjustment_financial_periods
        TO service_role;

    /* Prevent direct financial-history changes by application code. */
    REVOKE INSERT, UPDATE
        ON TABLE public.chauffeur_adjustment_financial_periods
        FROM service_role;

    /* Historical periods cannot be deleted or truncated. */
    REVOKE DELETE, TRUNCATE
        ON TABLE public.chauffeur_adjustment_financial_periods
        FROM service_role;

    /* Optimize historical financial eligibility lookups. */
    CREATE INDEX idx_chauffeur_adjustment_financial_periods_lookup
        ON public.chauffeur_adjustment_financial_periods (
            chauffeur_id,
            effective_from,
            effective_until
        );

    /* ------------------------------------------------------------
    SECTION 6: FINANCIAL PERIOD AUDIT HISTORY

    Preserve creation and modification history for chauffeur
    financial periods without changing historical records.
    ------------------------------------------------------------ */

    CREATE TABLE public.chauffeur_adjustment_financial_period_audit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        financial_period_id UUID NOT NULL
            REFERENCES public.chauffeur_adjustment_financial_periods(id)
            ON DELETE RESTRICT,

        action TEXT NOT NULL,
        old_values JSONB,
        new_values JSONB NOT NULL,

        changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        changed_by_role TEXT NOT NULL DEFAULT current_user,

        /* Record creation, closure, and cancellation events. */
        CONSTRAINT chauffeur_financial_period_audit_action_valid
            CHECK (action IN ('created', 'closed', 'cancelled')),

        /* Creation has no previous state.
        Closure and cancellation must preserve previous values. */
        CONSTRAINT chauffeur_financial_period_audit_values_valid
            CHECK (
                (action = 'created' AND old_values IS NULL)
                OR
                (
                    action IN ('closed', 'cancelled')
                    AND old_values IS NOT NULL
                )
            )
    );
    
    /* ------------------------------------------------------------
    SECTION 7: AUTOMATIC FINANCIAL PERIOD AUDITING

    Record new financial periods and changes to their end dates.
    Historical audit records will be protected separately.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION
        public.audit_chauffeur_adjustment_financial_period()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
    BEGIN
        /* Record the creation of a financial period. */
        IF TG_OP = 'INSERT' THEN
            INSERT INTO public.chauffeur_adjustment_financial_period_audit (
                financial_period_id,
                action,
                old_values,
                new_values
            )
            VALUES (
                NEW.id,
                'created',
                NULL,
                pg_catalog.to_jsonb(NEW)
            );

            RETURN NEW;
        END IF;

        /* Record cancellation of a future financial period.
        Preserve both previous and new lifecycle states. */
        IF NEW.period_status IS DISTINCT FROM OLD.period_status THEN
            INSERT INTO public.chauffeur_adjustment_financial_period_audit (
                financial_period_id,
                action,
                old_values,
                new_values
            )
            VALUES (
                NEW.id,
                'cancelled',
                pg_catalog.to_jsonb(OLD),
                pg_catalog.to_jsonb(NEW)
            );

            RETURN NEW;
        END IF;

        /* Ignore updates that do not change the financial end date. */
        IF NEW.effective_until IS NOT DISTINCT FROM OLD.effective_until THEN
            RETURN NEW;
        END IF;

        /* Preserve the previous and new period values. */
        INSERT INTO public.chauffeur_adjustment_financial_period_audit (
            financial_period_id,
            action,
            old_values,
            new_values
        )
        VALUES (
            NEW.id,
            'closed',
            pg_catalog.to_jsonb(OLD),
            pg_catalog.to_jsonb(NEW)
        );

        RETURN NEW;
    END;
    $function$;

    /* Automatically record financial period changes. */
    CREATE TRIGGER trg_audit_chauffeur_adjustment_financial_period
    AFTER INSERT OR UPDATE
    ON public.chauffeur_adjustment_financial_periods
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_chauffeur_adjustment_financial_period();

    /* Restrict direct execution of the audit function. */
    REVOKE ALL ON FUNCTION
        public.audit_chauffeur_adjustment_financial_period()
    FROM PUBLIC, anon, authenticated;

    /* ------------------------------------------------------------
    SECTION 8: FINANCIAL AUDIT RECORD SECURITY

    Allow trusted server-side reading of audit history.
    Prevent updates and deletions of historical audit records.
    ------------------------------------------------------------ */

    /* Enable Row Level Security. */
    ALTER TABLE public.chauffeur_adjustment_financial_period_audit
        ENABLE ROW LEVEL SECURITY;

    /* Remove access from ordinary application roles. */
    REVOKE ALL ON TABLE public.chauffeur_adjustment_financial_period_audit
        FROM PUBLIC, anon, authenticated;

    /* Permit trusted server-side audit inspection. */
    GRANT SELECT
        ON TABLE public.chauffeur_adjustment_financial_period_audit
        TO service_role;

    /* Prevent direct audit record modification. */
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE
        ON TABLE public.chauffeur_adjustment_financial_period_audit
        FROM service_role;

    /* Protect audit history even from ordinary privileged writes. */
    CREATE OR REPLACE FUNCTION
        public.protect_chauffeur_adjustment_financial_period_audit()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = ''
    AS $function$
    BEGIN
        RAISE EXCEPTION
            'Historical chauffeur financial audit records cannot be modified or deleted.'
            USING ERRCODE = '23514';
    END;
    $function$;

    /* Block changes to existing audit records. */
    CREATE TRIGGER trg_protect_chauffeur_adjustment_financial_period_audit
    BEFORE UPDATE OR DELETE
    ON public.chauffeur_adjustment_financial_period_audit
    FOR EACH ROW
    EXECUTE FUNCTION
        public.protect_chauffeur_adjustment_financial_period_audit();

    /* Restrict direct execution. */
    REVOKE ALL ON FUNCTION
        public.protect_chauffeur_adjustment_financial_period_audit()
    FROM PUBLIC, anon, authenticated;

    /* Speed up retrieval of a financial period's audit history. */
    CREATE INDEX idx_chauffeur_financial_period_audit_history
        ON public.chauffeur_adjustment_financial_period_audit (
            financial_period_id,
            changed_at
        );

    /* ------------------------------------------------------------
    SECTION 9: INITIAL FINANCIAL BASELINE

    Initialize financial history from currently active chauffeur
    assignments and definitions.

    Preserve the current financial values and the intersection
    of their effective-date ranges.

    Existing administrative audit history remains unchanged.
    ------------------------------------------------------------ */

    INSERT INTO public.chauffeur_adjustment_financial_periods (
        assignment_id,
        chauffeur_id,
        adjustment_definition_id,
        adjustment_name,
        adjustment_type,
        value_type,
        adjustment_value,
        currency_code,
        effective_from,
        effective_until
    )
    SELECT
        a.id,
        a.chauffeur_id,
        d.id,
        d.name,
        d.adjustment_type,
        d.value_type,
        d.value,
        d.currency_code,

        /* Use the later of the two starting dates. */
        GREATEST(a.effective_from, d.effective_from),

        /* Use the earlier ending date; NULL means unlimited. */
        NULLIF(
            LEAST(
                COALESCE(a.effective_until, 'infinity'::DATE),
                COALESCE(d.effective_until, 'infinity'::DATE)
            ),
            'infinity'::DATE
        )

    FROM public.chauffeur_adjustment_assignments AS a
    JOIN public.chauffeur_adjustment_definitions AS d
        ON d.id = a.adjustment_definition_id

    WHERE a.is_active = TRUE
    AND d.is_active = TRUE

    /* Only initialize assignments with valid date intersections. */
    AND GREATEST(a.effective_from, d.effective_from)
        <= LEAST(
            COALESCE(a.effective_until, 'infinity'::DATE),
            COALESCE(d.effective_until, 'infinity'::DATE)
        );

    /* ------------------------------------------------------------
    SECTION 10: PREVENT RETROACTIVE FINANCIAL PERIOD CREATION

    The initial historical baseline has already been inserted.
    New financial periods must start after the current Amsterdam
    calendar day to protect previously completed journeys.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION
        public.protect_chauffeur_financial_period_creation()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = ''
    AS $function$
    BEGIN
        /* Future financial versions cannot apply retroactively. */
        IF NEW.effective_from <=
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE
        THEN
            RAISE EXCEPTION
                'New financial periods must start on a future date.'
                USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
    END;
    $function$;

    /* Apply the rule to financial periods created after initialization. */
    CREATE TRIGGER trg_protect_chauffeur_financial_period_creation
    BEFORE INSERT
    ON public.chauffeur_adjustment_financial_periods
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_chauffeur_financial_period_creation();

    /* Restrict direct execution. */
    REVOKE ALL ON FUNCTION
        public.protect_chauffeur_financial_period_creation()
    FROM PUBLIC, anon, authenticated;

    /* ============================================================
        DEPLOYMENT SECTION 3 — FINANCIAL MANAGEMENT FUNCTIONS

        Manage chauffeur adjustment assignments and definitions
        through protected functions, preserving financial history.
    ============================================================ */
    /* ------------------------------------------------------------
    SECTION 1: CREATE CHAUFFEUR ADJUSTMENT ASSIGNMENT

    Create the assignment and its historical financial period
    atomically.

    The existing database triggers remain responsible for
    assignment date validation and auditing.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION
        public.create_chauffeur_adjustment_assignment_financial(
            p_chauffeur_id UUID,
            p_adjustment_definition_id UUID,
            p_effective_from DATE,
            p_effective_until DATE DEFAULT NULL
        )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
    DECLARE
        v_assignment_id UUID;
        v_definition RECORD;
        v_financial_start DATE;
        v_today DATE;
    BEGIN
        /* SECTION 1A: Validate the requested assignment. */
        IF p_chauffeur_id IS NULL
        OR p_adjustment_definition_id IS NULL
        OR p_effective_from IS NULL THEN
            RAISE EXCEPTION
                'Chauffeur, adjustment definition and start date are required.'
                USING ERRCODE = '22023';
        END IF;

        IF p_effective_until IS NOT NULL
        AND p_effective_until < p_effective_from THEN
            RAISE EXCEPTION
                'Assignment end date cannot precede its start date.'
                USING ERRCODE = '22023';
        END IF;

        /* New financial periods begin no earlier than tomorrow.
        The initial historical baseline is handled separately. */
        v_today :=
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE;

        v_financial_start :=
            GREATEST(p_effective_from, v_today + 1);

        /* The assignment must have an eligible future day. */
        IF p_effective_until IS NOT NULL
        AND p_effective_until < v_financial_start THEN
            RAISE EXCEPTION
                'Assignment must include a future financial effective date.'
                USING ERRCODE = '23514';
        END IF;

        /* SECTION 1B: Lock and validate the adjustment definition.
        Prevent concurrent changes while creating its assignment
        and historical financial period. */
        SELECT
            id,
            name,
            adjustment_type,
            value_type,
            value,
            currency_code,
            effective_from,
            effective_until,
            is_active
        INTO v_definition
        FROM public.chauffeur_adjustment_definitions
        WHERE id = p_adjustment_definition_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Adjustment definition not found.'
                USING ERRCODE = 'P0002';
        END IF;

        IF v_definition.is_active IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION
                'Inactive adjustment definitions cannot be assigned.'
                USING ERRCODE = '23514';
        END IF;

        /* Ensure the assignment fits within the definition period. */
        IF p_effective_from < v_definition.effective_from
        OR (
            v_definition.effective_until IS NOT NULL
            AND (
                p_effective_until IS NULL
                OR p_effective_until > v_definition.effective_until
            )
        ) THEN
            RAISE EXCEPTION
                'Assignment dates must remain within the definition period.'
                USING ERRCODE = '23514';
        END IF;

        /* Confirm that a future financial period remains available. */
        IF v_definition.effective_until IS NOT NULL
        AND v_definition.effective_until < v_financial_start THEN
            RAISE EXCEPTION
                'Adjustment definition has no eligible future financial dates.'
                USING ERRCODE = '23514';
        END IF;

        /* SECTION 1C: Create the chauffeur adjustment assignment.
        Existing database triggers validate the assignment dates
        and record the administrative audit history. */
        INSERT INTO public.chauffeur_adjustment_assignments (
            chauffeur_id,
            adjustment_definition_id,
            effective_from,
            effective_until,
            is_active
        )
        VALUES (
            p_chauffeur_id,
            p_adjustment_definition_id,
            p_effective_from,
            p_effective_until,
            TRUE
        )
        RETURNING id INTO v_assignment_id;

        /* SECTION 1D: Create the initial financial history record.
        Preserve the definition values used for future commission
        calculations, independently of later definition changes. */
        INSERT INTO public.chauffeur_adjustment_financial_periods (
            assignment_id,
            chauffeur_id,
            adjustment_definition_id,
            adjustment_name,
            adjustment_type,
            value_type,
            adjustment_value,
            currency_code,
            effective_from,
            effective_until
        )
        VALUES (
            v_assignment_id,
            p_chauffeur_id,
            p_adjustment_definition_id,
            v_definition.name,
            v_definition.adjustment_type,
            v_definition.value_type,
            v_definition.value,
            v_definition.currency_code,
            v_financial_start,
            p_effective_until
        );

        /* SECTION 1E: Return the newly created assignment.
        Both inserts must succeed within the same transaction. */
        RETURN v_assignment_id;
    END;
    $function$;

    /* ------------------------------------------------------------
    SECTION 2: SECURE ASSIGNMENT CREATION

    Only trusted server-side operations may execute this
    SECURITY DEFINER function.

    The Admin API remains responsible for verifying the
    authenticated administrator before invoking this RPC.
    ------------------------------------------------------------ */

    /* Remove PostgreSQL's default public execution permission. */
    REVOKE ALL ON FUNCTION
        public.create_chauffeur_adjustment_assignment_financial(
            UUID, UUID, DATE, DATE
        )
    FROM PUBLIC, anon, authenticated;

    /* Permit the trusted server-side Supabase role. */
    GRANT EXECUTE ON FUNCTION
        public.create_chauffeur_adjustment_assignment_financial(
            UUID, UUID, DATE, DATE
        )
    TO service_role;

    /* ------------------------------------------------------------
    SECTION 3: PROSPECTIVE ASSIGNMENT DEACTIVATION

    Deactivate an assignment and close its active financial
    period without changing completed journeys.

    Existing assignment and financial audit triggers remain active.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION
        public.deactivate_chauffeur_adjustment_assignment_financial(
            p_assignment_id UUID
        )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
    DECLARE
        v_assignment RECORD;
        v_period RECORD;
        v_today DATE;
    BEGIN
        /* SECTION 3A: Lock the definition before the assignment.
        Use consistent locking order for financial operations. */
        IF p_assignment_id IS NULL THEN
            RAISE EXCEPTION 'Assignment ID is required.'
                USING ERRCODE = '22023';
        END IF;

        /* Find the related definition without locking the assignment. */
        SELECT adjustment_definition_id
        INTO v_assignment
        FROM public.chauffeur_adjustment_assignments
        WHERE id = p_assignment_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Chauffeur adjustment assignment not found.'
                USING ERRCODE = 'P0002';
        END IF;

        /* Lock the definition first. */
        PERFORM 1
        FROM public.chauffeur_adjustment_definitions
        WHERE id = v_assignment.adjustment_definition_id
        FOR UPDATE;

        /* Then lock the assignment. */
        SELECT *
        INTO v_assignment
        FROM public.chauffeur_adjustment_assignments
        WHERE id = p_assignment_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Chauffeur adjustment assignment not found.'
                USING ERRCODE = 'P0002';
        END IF;

        /* Repeated deactivation must not change financial history. */
        IF v_assignment.is_active IS FALSE THEN
            RETURN p_assignment_id;
        END IF;

        v_today :=
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE;

        /* SECTION 3B: Lock the currently open financial period. */
        /* Lock only an applicable financial period.
        Cancelled historical schedules must never be modified. */
        SELECT id, effective_from, effective_until
        INTO v_period
        FROM public.chauffeur_adjustment_financial_periods
        WHERE assignment_id = p_assignment_id
        AND period_status = 'applicable'
        AND effective_from <= v_today
        AND (
            effective_until IS NULL
            OR effective_until > v_today
        )
        ORDER BY effective_from DESC
        LIMIT 1
        FOR UPDATE;

        /* SECTION 3B.1: Cancel future scheduled financial periods.
        Preserve the records and their audit history.
        Cancelled periods must never affect commission calculations. */
        UPDATE public.chauffeur_adjustment_financial_periods
        SET period_status = 'cancelled'
        WHERE assignment_id = p_assignment_id
        AND period_status = 'applicable'
        AND effective_from > v_today;

        /* SECTION 3C: Close the period at the end of today.
        The adjustment remains applicable to today's journeys. */
        IF v_period.id IS NOT NULL THEN
            UPDATE public.chauffeur_adjustment_financial_periods
            SET effective_until = v_today
            WHERE id = v_period.id;
        END IF;

        /* SECTION 3D: Deactivate the assignment.
        The existing assignment audit trigger records the change. */
        UPDATE public.chauffeur_adjustment_assignments
        SET is_active = FALSE
        WHERE id = p_assignment_id;

        RETURN p_assignment_id;
    END;
    $function$;

    /* Restrict execution to trusted server-side operations. */
    REVOKE ALL ON FUNCTION
        public.deactivate_chauffeur_adjustment_assignment_financial(UUID)
    FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE ON FUNCTION
        public.deactivate_chauffeur_adjustment_assignment_financial(UUID)
    TO service_role;

    /* ------------------------------------------------------------
    SECTION 4: PROSPECTIVE ASSIGNMENT REACTIVATION

    Reactivate an existing assignment without reopening or
    modifying its historical financial periods.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION
        public.reactivate_chauffeur_adjustment_assignment_financial(
            p_assignment_id UUID
        )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
    DECLARE
        v_assignment RECORD;
        v_definition RECORD;
        v_financial_start DATE;
        v_today DATE;
    BEGIN
        /* SECTION 4A: Identify the assignment and lock its definition first.
        Use a consistent locking order across financial operations. */
        IF p_assignment_id IS NULL THEN
            RAISE EXCEPTION 'Assignment ID is required.'
                USING ERRCODE = '22023';
        END IF;

        SELECT adjustment_definition_id
        INTO v_assignment
        FROM public.chauffeur_adjustment_assignments
        WHERE id = p_assignment_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Chauffeur adjustment assignment not found.'
                USING ERRCODE = 'P0002';
        END IF;

        /* Lock the definition before locking the assignment. */
        SELECT *
        INTO v_definition
        FROM public.chauffeur_adjustment_definitions
        WHERE id = v_assignment.adjustment_definition_id
        FOR UPDATE;

        /* SECTION 4B: Lock and validate the assignment. */
        SELECT *
        INTO v_assignment
        FROM public.chauffeur_adjustment_assignments
        WHERE id = p_assignment_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Chauffeur adjustment assignment not found.'
                USING ERRCODE = 'P0002';
        END IF;

        IF v_assignment.adjustment_definition_id
        IS DISTINCT FROM v_definition.id THEN
            RAISE EXCEPTION 'Assignment definition changed.'
                USING ERRCODE = '40001';
        END IF;

        /* An already active assignment requires no changes. */
        IF v_assignment.is_active THEN
            RETURN p_assignment_id;
        END IF;

        IF v_definition.is_active IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION
                'An active adjustment definition is required.'
                USING ERRCODE = '23514';
        END IF;

        /* SECTION 4C: Determine the new financial start date. */
        v_today :=
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE;

        v_financial_start := GREATEST(
            v_today + 1,
            v_assignment.effective_from,
            v_definition.effective_from
        );

        /* The assignment and definition must cover the new period. */
        IF (
            v_assignment.effective_until IS NOT NULL
            AND v_assignment.effective_until < v_financial_start
        ) OR (
            v_definition.effective_until IS NOT NULL
            AND v_definition.effective_until < v_financial_start
        ) THEN
            RAISE EXCEPTION
                'No future financial period is available for this assignment.'
                USING ERRCODE = '23514';
        END IF;

        /* Only applicable financial periods can block reactivation.
        Cancelled future periods remain preserved for auditing. */
        IF EXISTS (
            SELECT 1
            FROM public.chauffeur_adjustment_financial_periods
            WHERE assignment_id = p_assignment_id
            AND period_status = 'applicable'
            AND (
                effective_until IS NULL
                OR effective_until >= v_financial_start
                OR effective_from >= v_financial_start
            )
        ) THEN
            RAISE EXCEPTION
                'An existing financial period conflicts with reactivation.'
                USING ERRCODE = '23514';
        END IF;

        /* SECTION 4D: Create a new historical financial version. */
        INSERT INTO public.chauffeur_adjustment_financial_periods (
            assignment_id,
            chauffeur_id,
            adjustment_definition_id,
            adjustment_name,
            adjustment_type,
            value_type,
            adjustment_value,
            currency_code,
            effective_from,
            effective_until
        )
        VALUES (
            v_assignment.id,
            v_assignment.chauffeur_id,
            v_assignment.adjustment_definition_id,
            v_definition.name,
            v_definition.adjustment_type,
            v_definition.value_type,
            v_definition.value,
            v_definition.currency_code,
            v_financial_start,
            NULLIF(
                LEAST(
                    COALESCE(v_assignment.effective_until, 'infinity'::DATE),
                    COALESCE(v_definition.effective_until, 'infinity'::DATE)
                ),
                'infinity'::DATE
            )

        );

        /* SECTION 4E: Reactivate the original assignment.
        Its existing audit trigger records the status change. */
        UPDATE public.chauffeur_adjustment_assignments
        SET is_active = TRUE
        WHERE id = p_assignment_id;

        RETURN p_assignment_id;
    END;
    $function$;

    /* Restrict execution to trusted server-side operations. */
    REVOKE ALL ON FUNCTION
        public.reactivate_chauffeur_adjustment_assignment_financial(UUID)
    FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE ON FUNCTION
        public.reactivate_chauffeur_adjustment_assignment_financial(UUID)
    TO service_role;

    /* ------------------------------------------------------------
    SECTION 5: UPDATE CHAUFFEUR ADJUSTMENT DEFINITIONS

    Coordinate financial definition changes with historical
    financial periods.

    Previous financial values remain preserved for completed
    journeys. New values apply prospectively.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION
        public.update_chauffeur_adjustment_definition_financial(
            p_definition_id UUID,
            p_name TEXT,
            p_description TEXT,
            p_adjustment_type TEXT,
            p_value_type TEXT,
            p_value NUMERIC(14,4),
            p_currency_code VARCHAR(3),
            p_effective_from DATE,
            p_effective_until DATE
        )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
    DECLARE
        v_definition RECORD;
        v_today DATE;
        v_new_start DATE;
        v_financial_changed BOOLEAN;
        /* Individual financial periods requiring a new version. */
        v_period RECORD;
    BEGIN
        /* SECTION 5A: Validate and lock the existing definition. */
        IF p_definition_id IS NULL THEN
            RAISE EXCEPTION
                'Adjustment definition ID is required.'
                USING ERRCODE = '22023';
        END IF;

        SELECT *
        INTO v_definition
        FROM public.chauffeur_adjustment_definitions
        WHERE id = p_definition_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Chauffeur adjustment definition not found.'
                USING ERRCODE = 'P0002';
        END IF;

        /* SECTION 5B: Validate the new adjustment values. */
        IF NULLIF(BTRIM(p_name), '') IS NULL
        OR LENGTH(BTRIM(p_name)) > 150 THEN
            RAISE EXCEPTION
                'Enter a valid adjustment name.'
                USING ERRCODE = '22023';
        END IF;

        IF p_adjustment_type IS NULL
        OR p_adjustment_type NOT IN ('discount', 'surcharge')
        OR p_value_type IS NULL
        OR p_value_type NOT IN ('percentage', 'fixed')
        OR p_value IS NULL
        OR p_value <= 0
        OR p_value > 9999999999.9999 THEN
            RAISE EXCEPTION
                'Invalid chauffeur adjustment values.'
                USING ERRCODE = '22023';
        END IF;

        IF p_adjustment_type = 'discount'
        AND p_value_type = 'percentage'
        AND p_value > 100 THEN
            /* Escape the literal percent sign in the exception message. */
            RAISE EXCEPTION
                'Percentage discounts cannot exceed 100%%.'
                USING ERRCODE = '22023';
        END IF;

        IF p_value_type = 'fixed'
        AND (
            p_currency_code IS NULL
            OR p_currency_code !~ '^[A-Z]{3}$'
        ) THEN
            RAISE EXCEPTION
                'Fixed adjustments require a valid currency.'
                USING ERRCODE = '22023';
        END IF;

        IF p_effective_from IS NULL
        OR (
            p_effective_until IS NOT NULL
            AND p_effective_until < p_effective_from
        ) THEN
            RAISE EXCEPTION
                'Invalid adjustment effective dates.'
                USING ERRCODE = '22023';
        END IF;

        /* SECTION 5C: Identify financial changes.
        These require historical versioning. */
        v_financial_changed :=
            ROW(
                v_definition.name,
                v_definition.adjustment_type,
                v_definition.value_type,
                v_definition.value,
                v_definition.currency_code
            ) IS DISTINCT FROM ROW(
                p_name,
                p_adjustment_type,
                p_value_type,
                p_value,
                CASE
                    WHEN p_value_type = 'fixed'
                    THEN p_currency_code
                    ELSE NULL
                END
            );

        v_today :=
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE;

        v_new_start := v_today + 1;
        
        /* SECTION 5D: Protect and lock existing financial history.
        Serialize changes to historical versions of this definition. */
        IF v_financial_changed THEN
            PERFORM 1
            FROM public.chauffeur_adjustment_financial_periods
            WHERE adjustment_definition_id = p_definition_id
            ORDER BY id
            FOR UPDATE;
        END IF;

        /* SECTION 5E: Replace future financial values atomically.
        Existing periods retain their values through today.
        Future scheduled versions are cancelled and replaced. */
        IF v_financial_changed THEN

            /* Financial value and date changes must be separate. */
            IF p_effective_from IS DISTINCT FROM v_definition.effective_from
            OR p_effective_until IS DISTINCT FROM v_definition.effective_until
            THEN
                RAISE EXCEPTION
                    'Change effective dates separately from financial values.'
                    USING ERRCODE = '23514';
            END IF;

            /* Process every applicable period covering a future day.
            Preserve the original end dates and assignment identities. */
            FOR v_period IN
                SELECT
                    fp.id,
                    fp.assignment_id,
                    fp.chauffeur_id,
                    fp.effective_from,
                    fp.effective_until
                FROM public.chauffeur_adjustment_financial_periods AS fp
                JOIN public.chauffeur_adjustment_assignments AS a
                    ON a.id = fp.assignment_id
                WHERE fp.adjustment_definition_id = p_definition_id
                AND fp.period_status = 'applicable'
                AND a.is_active = TRUE
                AND (
                    fp.effective_until IS NULL
                    OR fp.effective_until >= v_new_start
                )
                ORDER BY fp.assignment_id, fp.effective_from
            LOOP

                IF v_period.effective_from <= v_today THEN

                    /* Close a started version at the end of today. */
                    UPDATE public.chauffeur_adjustment_financial_periods
                    SET effective_until = v_today
                    WHERE id = v_period.id;

                ELSE

                    /* Cancel an unstarted version, preserving audit history. */
                    UPDATE public.chauffeur_adjustment_financial_periods
                    SET period_status = 'cancelled'
                    WHERE id = v_period.id;

                END IF;

                /* Create the replacement using the new financial values.
                Preserve the old ending date and any later start date. */
                INSERT INTO public.chauffeur_adjustment_financial_periods (
                    assignment_id,
                    chauffeur_id,
                    adjustment_definition_id,
                    adjustment_name,
                    adjustment_type,
                    value_type,
                    adjustment_value,
                    currency_code,
                    effective_from,
                    effective_until
                )
                VALUES (
                    v_period.assignment_id,
                    v_period.chauffeur_id,
                    p_definition_id,
                    BTRIM(p_name),
                    p_adjustment_type,
                    p_value_type,
                    p_value,
                    CASE
                        WHEN p_value_type = 'fixed'
                        THEN p_currency_code
                        ELSE NULL
                    END,
                    GREATEST(v_new_start, v_period.effective_from),
                    v_period.effective_until
                );

            END LOOP;
        END IF;

        /* SECTION 5F: Protect definition effective dates.
        Date changes require a separate historical workflow.
        This also protects description-only updates. */
        IF p_effective_from IS DISTINCT FROM v_definition.effective_from
        OR p_effective_until IS DISTINCT FROM v_definition.effective_until
        THEN
            RAISE EXCEPTION
                'Effective-date changes require the protected date-management workflow.'
                USING ERRCODE = '23514';
        END IF;

        /* SECTION 5G: Update the reusable adjustment definition.
        Historical financial values have already been preserved
        when a financial change was detected. */
        UPDATE public.chauffeur_adjustment_definitions
        SET
            name = BTRIM(p_name),
            description = NULLIF(BTRIM(p_description), ''),
            adjustment_type = p_adjustment_type,
            value_type = p_value_type,
            value = p_value,
            currency_code = CASE
                WHEN p_value_type = 'fixed'
                THEN p_currency_code
                ELSE NULL
            END
        WHERE id = p_definition_id;

        /* SECTION 5H: Return the updated definition identifier. */
        RETURN p_definition_id;
    END;
    $function$;

    /* ------------------------------------------------------------
    SECTION 6: SECURE DEFINITION FINANCIAL UPDATES

    The protected Admin API will verify administrator access.
    Ordinary users cannot execute this financial function.
    ------------------------------------------------------------ */

    REVOKE ALL ON FUNCTION
        public.update_chauffeur_adjustment_definition_financial(
            UUID, TEXT, TEXT, TEXT, TEXT,
            NUMERIC, VARCHAR, DATE, DATE
        )
    FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE ON FUNCTION
        public.update_chauffeur_adjustment_definition_financial(
            UUID, TEXT, TEXT, TEXT, TEXT,
            NUMERIC, VARCHAR, DATE, DATE
        )
    TO service_role;

    /* ------------------------------------------------------------
    SECTION 7: PROSPECTIVE DEFINITION DEACTIVATION

    Deactivate a reusable adjustment definition and preserve
    the financial history of every affected chauffeur.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION
        public.deactivate_chauffeur_adjustment_definition_financial(
            p_definition_id UUID
        )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
    DECLARE
        v_definition RECORD;
        v_today DATE;
    BEGIN
        /* SECTION 7A: Validate and lock the definition. */
        IF p_definition_id IS NULL THEN
            RAISE EXCEPTION 'Adjustment definition ID is required.'
                USING ERRCODE = '22023';
        END IF;

        SELECT id, is_active
        INTO v_definition
        FROM public.chauffeur_adjustment_definitions
        WHERE id = p_definition_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Chauffeur adjustment definition not found.'
                USING ERRCODE = 'P0002';
        END IF;

        /* Repeated deactivation must not change financial history. */
        IF v_definition.is_active IS FALSE THEN
            RETURN p_definition_id;
        END IF;

        v_today :=
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE;

        /* SECTION 7B: Lock the affected financial periods. */
        PERFORM 1
        FROM public.chauffeur_adjustment_financial_periods
        WHERE adjustment_definition_id = p_definition_id
        AND period_status = 'applicable'
        ORDER BY id
        FOR UPDATE;

        /* SECTION 7C: Cancel periods that have not started.
        Cancellation preserves their records and audit history. */
        UPDATE public.chauffeur_adjustment_financial_periods
        SET period_status = 'cancelled'
        WHERE adjustment_definition_id = p_definition_id
        AND period_status = 'applicable'
        AND effective_from > v_today;

        /* SECTION 7D: Close periods covering future days.
        Today's completed journeys retain their eligibility. */
        UPDATE public.chauffeur_adjustment_financial_periods
        SET effective_until = v_today
        WHERE adjustment_definition_id = p_definition_id
        AND period_status = 'applicable'
        AND effective_from <= v_today
        AND (
            effective_until IS NULL
            OR effective_until > v_today
        );

        /* SECTION 7E: Deactivate the reusable definition. */
        UPDATE public.chauffeur_adjustment_definitions
        SET is_active = FALSE
        WHERE id = p_definition_id;

        RETURN p_definition_id;
    END;
    $function$;

    /* Restrict execution to the trusted server-side role. */
    REVOKE ALL ON FUNCTION
        public.deactivate_chauffeur_adjustment_definition_financial(UUID)
    FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE ON FUNCTION
        public.deactivate_chauffeur_adjustment_definition_financial(UUID)
    TO service_role;

    /* ------------------------------------------------------------
    SECTION 8: PROSPECTIVE DEFINITION REACTIVATION

    Reactivate a reusable adjustment definition and create new
    financial periods for eligible active chauffeur assignments.

    Preserve all previous financial history.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION
        public.reactivate_chauffeur_adjustment_definition_financial(
            p_definition_id UUID
        )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
    DECLARE
        v_definition RECORD;
        v_assignment RECORD;
        v_today DATE;
        v_new_start DATE;
        v_new_end DATE;
    BEGIN
        /* SECTION 8A: Validate and lock the definition. */
        IF p_definition_id IS NULL THEN
            RAISE EXCEPTION 'Adjustment definition ID is required.'
                USING ERRCODE = '22023';
        END IF;

        SELECT *
        INTO v_definition
        FROM public.chauffeur_adjustment_definitions
        WHERE id = p_definition_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Chauffeur adjustment definition not found.'
                USING ERRCODE = 'P0002';
        END IF;

        /* Repeated activation must not duplicate financial periods. */
        IF v_definition.is_active = TRUE THEN
            RETURN p_definition_id;
        END IF;

        v_today :=
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE;

        /* SECTION 8B: Process eligible active chauffeur assignments. */
        FOR v_assignment IN
            SELECT *
            FROM public.chauffeur_adjustment_assignments
            WHERE adjustment_definition_id = p_definition_id
            AND is_active = TRUE
            ORDER BY id
            FOR UPDATE
        LOOP

            /* The new version cannot begin before tomorrow. */
            v_new_start := GREATEST(
                v_today + 1,
                v_assignment.effective_from,
                v_definition.effective_from
            );

            /* Respect assignment and definition expiry dates. */
            v_new_end := NULLIF(
                LEAST(
                    COALESCE(v_assignment.effective_until, 'infinity'::DATE),
                    COALESCE(v_definition.effective_until, 'infinity'::DATE)
                ),
                'infinity'::DATE
            );

            /* Expired assignments do not receive new periods. */
            IF v_new_end IS NOT NULL
            AND v_new_end < v_new_start THEN
                CONTINUE;
            END IF;

            /* SECTION 8C: Prevent conflicting applicable periods.
            Cancelled periods remain preserved for auditing. */
            IF EXISTS (
                SELECT 1
                FROM public.chauffeur_adjustment_financial_periods
                WHERE assignment_id = v_assignment.id
                AND period_status = 'applicable'
                AND (
                    effective_until IS NULL
                    OR effective_until >= v_new_start
                )
            ) THEN
                RAISE EXCEPTION
                    'An applicable financial period conflicts with definition reactivation.'
                    USING ERRCODE = '23514';
            END IF;

            /* SECTION 8D: Create a new historical financial version.
            Never modify previously closed or cancelled periods. */
            INSERT INTO public.chauffeur_adjustment_financial_periods (
                assignment_id,
                chauffeur_id,
                adjustment_definition_id,
                adjustment_name,
                adjustment_type,
                value_type,
                adjustment_value,
                currency_code,
                effective_from,
                effective_until
            )
            VALUES (
                v_assignment.id,
                v_assignment.chauffeur_id,
                p_definition_id,
                v_definition.name,
                v_definition.adjustment_type,
                v_definition.value_type,
                v_definition.value,
                v_definition.currency_code,
                v_new_start,
                v_new_end
            );

        END LOOP;

        /* SECTION 8E: Reactivate the reusable definition.
        All related financial periods are created atomically. */
        UPDATE public.chauffeur_adjustment_definitions
        SET is_active = TRUE
        WHERE id = p_definition_id;

        RETURN p_definition_id;
    END;
    $function$;

    /* Restrict execution to trusted server-side operations. */
    REVOKE ALL ON FUNCTION
        public.reactivate_chauffeur_adjustment_definition_financial(UUID)
    FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE ON FUNCTION
        public.reactivate_chauffeur_adjustment_definition_financial(UUID)
    TO service_role;

    /* ------------------------------------------------------------
    SECTION 9: UPDATE FUTURE ASSIGNMENT DATES

    Allow changes to assignments that have not started.
    Preserve cancelled financial schedules for audit.
    Historical assignment date changes are deferred.
    ------------------------------------------------------------ */

    CREATE OR REPLACE FUNCTION
        public.update_chauffeur_adjustment_assignment_dates_financial(
            p_assignment_id UUID,
            p_effective_from DATE,
            p_effective_until DATE
        )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
    DECLARE
        v_assignment RECORD;
        v_definition RECORD;
        v_today DATE;
    BEGIN
        /* SECTION 9A: Validate input. */
        IF p_assignment_id IS NULL OR p_effective_from IS NULL
        OR (p_effective_until IS NOT NULL
            AND p_effective_until < p_effective_from) THEN
            RAISE EXCEPTION 'Invalid assignment dates.'
                USING ERRCODE = '22023';
        END IF;

        v_today :=
            (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Amsterdam')::DATE;

        /* Only future assignments can be rescheduled. */
        IF p_effective_from <= v_today THEN
            RAISE EXCEPTION
                'New assignment start date must be in the future.'
                USING ERRCODE = '23514';
        END IF;

        /* SECTION 9B: Locate the referenced definition. */
        SELECT adjustment_definition_id
        INTO v_assignment
        FROM public.chauffeur_adjustment_assignments
        WHERE id = p_assignment_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Assignment not found.'
                USING ERRCODE = 'P0002';
        END IF;

        /* Lock definition before assignment. */
        SELECT *
        INTO v_definition
        FROM public.chauffeur_adjustment_definitions
        WHERE id = v_assignment.adjustment_definition_id
        FOR UPDATE;

        SELECT *
        INTO v_assignment
        FROM public.chauffeur_adjustment_assignments
        WHERE id = p_assignment_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Assignment not found.'
                USING ERRCODE = 'P0002';
        END IF;

        /* Reject changes to assignments that already started. */
        IF v_assignment.effective_from <= v_today THEN
            RAISE EXCEPTION
                'Started assignments cannot have their dates edited.'
                USING ERRCODE = '23514';
        END IF;

        /* Confirm the definition has not changed during locking. */
        IF v_assignment.adjustment_definition_id
        IS DISTINCT FROM v_definition.id THEN
            RAISE EXCEPTION 'Assignment definition changed.'
                USING ERRCODE = '40001';
        END IF;

        /* Validate the requested dates against the definition. */
        IF p_effective_from < v_definition.effective_from
        OR (
            v_definition.effective_until IS NOT NULL
            AND (
                p_effective_until IS NULL
                OR p_effective_until > v_definition.effective_until
            )
        ) THEN
            RAISE EXCEPTION
                'Assignment dates must remain within definition dates.'
                USING ERRCODE = '23514';
        END IF;

        /* SECTION 9C: Preserve previous scheduled versions. */
        UPDATE public.chauffeur_adjustment_financial_periods
        SET period_status = 'cancelled'
        WHERE assignment_id = p_assignment_id
        AND period_status = 'applicable'
        AND effective_from > v_today;

        /* SECTION 9D: Update the original assignment.
        Existing assignment audit triggers remain active. */
        UPDATE public.chauffeur_adjustment_assignments
        SET effective_from = p_effective_from,
            effective_until = p_effective_until
        WHERE id = p_assignment_id;

        /* SECTION 9E: Create the replacement financial schedule.
        Inactive assignments receive no applicable period. */
        IF v_assignment.is_active
        AND v_definition.is_active THEN

            INSERT INTO public.chauffeur_adjustment_financial_periods (
                assignment_id,
                chauffeur_id,
                adjustment_definition_id,
                adjustment_name,
                adjustment_type,
                value_type,
                adjustment_value,
                currency_code,
                effective_from,
                effective_until
            )
            VALUES (
                p_assignment_id,
                v_assignment.chauffeur_id,
                v_assignment.adjustment_definition_id,
                v_definition.name,
                v_definition.adjustment_type,
                v_definition.value_type,
                v_definition.value,
                v_definition.currency_code,
                p_effective_from,
                p_effective_until
            );
        END IF;

        RETURN p_assignment_id;
    END;
    $function$;

    /* Allow execution only from the trusted server-side role. */
    REVOKE ALL ON FUNCTION
        public.update_chauffeur_adjustment_assignment_dates_financial(
            UUID, DATE, DATE
        )
    FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE ON FUNCTION
        public.update_chauffeur_adjustment_assignment_dates_financial(
            UUID, DATE, DATE
        )
    TO service_role;
    /* =============================================================
    DEPLOYMENT SECTION 4 — COMMISSION GENERATION

    Calculate chauffeur service fees using historical
    financial periods and frozen adjustment snapshots.
    ============================================================ */
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

    /* ============================================================
    DEPLOYMENT SECTION 5A — CHAUFFEUR INVOICE DRAFT INTEGRATION

    Invoice drafts and issuance use the final frozen
    commission after discounts and surcharges.
    ============================================================ */
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

    /* ============================================================
    DEPLOYMENT SECTION 5B — CHAUFFEUR INVOICE INTEGRATION
    ============================================================ */
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

    /* ============================================================
    DEPLOYMENT SECTION 6 — FINANCIAL ACCESS PROTECTION

    Prevent direct changes to chauffeur adjustments that
    bypass protected financial management functions.
    ============================================================ */

    /* Definitions may be created directly, but financial updates
    must use the historical version-management functions. */
    REVOKE UPDATE
    ON TABLE public.chauffeur_adjustment_definitions
    FROM service_role;

    /* Assignment creation and updates must use protected RPCs
    to preserve financial periods and audit history. */
    REVOKE INSERT, UPDATE
    ON TABLE public.chauffeur_adjustment_assignments
    FROM service_role;
/* ============================================================
   END VOYA TAXI — CHAUFFEUR FINANCIAL INTEGRATION DEPLOYMENT
============================================================ */

COMMIT;