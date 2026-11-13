/*=========================================================================
    VOYA TAXI — CHAUFFEUR FINANCIAL HISTORY MANAGEMENT

    Coordinate chauffeur adjustment definitions, assignments,
    and historical financial periods.

    Responsibilities:
    - Create financial history for new assignments.
    - Close financial periods prospectively.
    - Create new periods when adjustments are reactivated.
    - Preserve previous financial values when definitions change.
    - Protect completed journeys from retroactive changes.
    - Keep assignment audit history intact.
    - Perform related changes atomically.

    Dependencies:
    - 2026-11-11-add-chauffeur-commission-adjustments.sql
    - 2026-11-12-add-chauffeur-adjustment-financial-periods.sql

    All financial changes must use protected database operations.
==========================================================================*/
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