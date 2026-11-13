/* ============================================================
   VOYA TAXI — CHAUFFEUR ADJUSTMENT FINANCIAL HISTORY

   Preserve the historical financial conditions applicable
   to completed journeys.

   Each record stores a snapshot of an adjustment definition
   and its assignment for a specific effective period.

   Historical commission generation must use these records
   instead of current activation status and adjustment values.
============================================================ */

BEGIN;

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
COMMIT;