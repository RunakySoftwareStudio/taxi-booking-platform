/* ============================================================
VOYA TAXI — CHAUFFEUR ADJUSTMENT ASSIGNMENTS

Assign reusable discounts and surcharges to chauffeurs.
Each assignment has its own effective period.
Preserve assignment records for financial audit purposes.
============================================================ */

BEGIN;

    /* ------------------------------------------------------------
        SECTION 1: Create chauffeur adjustment assignments. 
    ------------------------------------------------------------*/
    CREATE TABLE public.chauffeur_adjustment_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        chauffeur_id UUID NOT NULL
            REFERENCES public.chauffeurs(id) ON DELETE RESTRICT,

        adjustment_definition_id UUID NOT NULL
            REFERENCES public.chauffeur_adjustment_definitions(id) ON DELETE RESTRICT,

        effective_from DATE NOT NULL,
        effective_until DATE,

        is_active BOOLEAN NOT NULL DEFAULT TRUE,

        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT chauffeur_assignment_period_valid
            CHECK (effective_until IS NULL OR effective_until >= effective_from)
    );

    /* ------------------------------------------------------------
        SECTION 2: Optimize searches by chauffeur and definition. 
    ------------------------------------------------------------*/
    CREATE INDEX idx_chauffeur_adjustment_assignments_chauffeur
        ON public.chauffeur_adjustment_assignments(chauffeur_id);

    CREATE INDEX idx_chauffeur_adjustment_assignments_definition
        ON public.chauffeur_adjustment_assignments(adjustment_definition_id);

    /* ------------------------------------------------------------
        SECTION 3: Prevent overlapping assignments of the same definition
        to the same chauffeur, including inactive assignments. 
    ------------------------------------------------------------*/
    CREATE EXTENSION IF NOT EXISTS btree_gist;

    ALTER TABLE public.chauffeur_adjustment_assignments
    ADD CONSTRAINT chauffeur_assignment_no_period_overlap
    EXCLUDE USING gist (
        chauffeur_id WITH =,
        adjustment_definition_id WITH =,
        daterange(effective_from, effective_until, '[]') WITH &&
    );

    /* Document the assignment overlap rule. */
    COMMENT ON CONSTRAINT chauffeur_assignment_no_period_overlap
    ON public.chauffeur_adjustment_assignments IS
    'Prevents overlapping assignment periods for the same chauffeur and adjustment definition, including inactive assignments.';

    /* ------------------------------------------------------------
    SECTION 4: VALIDATE ASSIGNMENT EFFECTIVE PERIOD

    Ensure chauffeur assignments remain within the validity
    period of their reusable adjustment definition.
    ------------------------------------------------------------*/

    CREATE OR REPLACE FUNCTION public.validate_chauffeur_adjustment_assignment()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
        v_from DATE;
        v_until DATE;
    BEGIN
        /* Lock the referenced definition while validating assignment dates. */
        SELECT effective_from, effective_until
        INTO v_from, v_until
        FROM public.chauffeur_adjustment_definitions
        WHERE id = NEW.adjustment_definition_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Adjustment definition not found.';
        END IF;

        /* Reject assignments starting before the definition. */
        IF NEW.effective_from < v_from THEN
            RAISE EXCEPTION
                'Assignment cannot start before the adjustment definition.';
        END IF;

        /* Reject assignments extending beyond the definition. */
        IF v_until IS NOT NULL
        AND (NEW.effective_until IS NULL OR NEW.effective_until > v_until) THEN
            RAISE EXCEPTION
                'Assignment cannot extend beyond the adjustment definition.';
        END IF;

        RETURN NEW;
    END;
    $$;

    /* Validate every new assignment and relevant update. */
    CREATE TRIGGER trg_validate_chauffeur_adjustment_assignment
    BEFORE INSERT OR UPDATE OF adjustment_definition_id, effective_from, effective_until
    ON public.chauffeur_adjustment_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_chauffeur_adjustment_assignment();

    /* ------------------------------------------------------------
    SECTION 5: PROTECT ASSIGNMENTS WHEN DEFINITION DATES CHANGE

    Prevent changes to a reusable definition that would
    invalidate existing chauffeur adjustment assignments.
    -------------------------------------------------------------- */

    CREATE OR REPLACE FUNCTION public.protect_chauffeur_adjustment_definition_period()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
        /* Skip validation when the effective period is unchanged. */
        IF NEW.effective_from IS NOT DISTINCT FROM OLD.effective_from
        AND NEW.effective_until IS NOT DISTINCT FROM OLD.effective_until THEN
            RETURN NEW;
        END IF;

        /* Reject date changes that invalidate an existing assignment. */
        IF EXISTS (
            SELECT 1
            FROM public.chauffeur_adjustment_assignments a
            WHERE a.adjustment_definition_id = NEW.id
            AND (
                a.effective_from < NEW.effective_from
                OR (
                    NEW.effective_until IS NOT NULL
                    AND (
                        a.effective_until IS NULL
                        OR a.effective_until > NEW.effective_until
                    )
                )
            )
        ) THEN
            RAISE EXCEPTION
                'Cannot change definition period: existing chauffeur assignments would become invalid.';
        END IF;

        RETURN NEW;
    END;
    $$;

    /* Validate definition date changes against existing assignments. */
    CREATE TRIGGER trg_protect_chauffeur_adjustment_definition_period
    BEFORE UPDATE OF effective_from, effective_until
    ON public.chauffeur_adjustment_definitions
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_chauffeur_adjustment_definition_period();

    /* ----------------------------------------------------------
    SECTION 6: CHAUFFEUR ADJUSTMENT ASSIGNMENT SECURITY

    Restrict assignment management to trusted server-side
    operations through the service_role.
    ------------------------------------------------------------- */

    /* Enable Row Level Security. */
    ALTER TABLE public.chauffeur_adjustment_assignments
    ENABLE ROW LEVEL SECURITY;

    /* Remove direct public and chauffeur access. */
    REVOKE ALL ON TABLE public.chauffeur_adjustment_assignments
    FROM PUBLIC, anon, authenticated;

    /* Allow trusted server-side assignment management. */
    GRANT SELECT, INSERT, UPDATE
    ON TABLE public.chauffeur_adjustment_assignments
    TO service_role;

    /* Preserve assignment history by prohibiting direct deletion. */
    REVOKE DELETE, TRUNCATE
    ON TABLE public.chauffeur_adjustment_assignments
    FROM service_role;

    /* ----------------------------------------------------------
    SECTION 7: PROTECT FINANCIAL VALIDATION FUNCTIONS

    Trigger functions must execute only through their
    associated database triggers.
    ------------------------------------------------------------- */

    REVOKE ALL ON FUNCTION public.validate_chauffeur_adjustment_assignment()
    FROM PUBLIC, anon, authenticated;

    REVOKE ALL ON FUNCTION public.protect_chauffeur_adjustment_definition_period()
    FROM PUBLIC, anon, authenticated;

    /* ----------------------------------------------------------
    SECTION 8: AUTOMATIC ASSIGNMENT UPDATE TIMESTAMP

    Maintain updated_at whenever an assignment is modified.
    ------------------------------------------------------------- */

    CREATE OR REPLACE FUNCTION public.set_chauffeur_adjustment_assignment_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
        NEW.updated_at := now();
        RETURN NEW;
    END;
    $$;

    /* Update modification timestamp automatically. */
    CREATE TRIGGER trg_chauffeur_adjustment_assignment_updated_at
    BEFORE UPDATE
    ON public.chauffeur_adjustment_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_chauffeur_adjustment_assignment_updated_at();

    /* Restrict direct execution of the trigger function. */
    REVOKE ALL ON FUNCTION public.set_chauffeur_adjustment_assignment_updated_at()
    FROM PUBLIC, anon, authenticated;

    /* ----------------------------------------------------------
    SECTION 9: CHAUFFEUR ADJUSTMENT ASSIGNMENT AUDIT

    Preserve historical assignment changes for financial review.
    ------------------------------------------------------------- */

    CREATE TABLE public.chauffeur_adjustment_assignment_audit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        assignment_id UUID NOT NULL
            REFERENCES public.chauffeur_adjustment_assignments(id)
            ON DELETE RESTRICT,

        action TEXT NOT NULL
            CHECK (action IN ('created', 'updated', 'activated', 'deactivated')),

        old_values JSONB,
        new_values JSONB NOT NULL,

        changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    /* Optimize audit history retrieval by assignment. */
    CREATE INDEX idx_chauffeur_assignment_audit_history
    ON public.chauffeur_adjustment_assignment_audit(assignment_id, changed_at DESC);

    /* Keep audit records inaccessible to ordinary application users. */
    ALTER TABLE public.chauffeur_adjustment_assignment_audit ENABLE ROW LEVEL SECURITY;

    REVOKE ALL ON TABLE public.chauffeur_adjustment_assignment_audit
    FROM PUBLIC, anon, authenticated;

    GRANT SELECT, INSERT
    ON TABLE public.chauffeur_adjustment_assignment_audit TO service_role;

    REVOKE UPDATE, DELETE, TRUNCATE
    ON TABLE public.chauffeur_adjustment_assignment_audit FROM service_role;
    
    /* ----------------------------------------------------------
    SECTION 10: AUTOMATIC CHAUFFEUR ASSIGNMENT AUDIT

    Record assignment creation and changes automatically.
    ------------------------------------------------------------- */

    CREATE OR REPLACE FUNCTION public.audit_chauffeur_adjustment_assignment()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
        v_action TEXT;
    BEGIN
        /* Record newly created assignments. */
        IF TG_OP = 'INSERT' THEN
            INSERT INTO public.chauffeur_adjustment_assignment_audit
                (assignment_id, action, old_values, new_values)
            VALUES
                (NEW.id, 'created', NULL, to_jsonb(NEW));

            RETURN NEW;
        END IF;

        /* Ignore updates that do not change business fields. */
        IF ROW(OLD.chauffeur_id, OLD.adjustment_definition_id,
            OLD.effective_from, OLD.effective_until, OLD.is_active)
        IS NOT DISTINCT FROM
        ROW(NEW.chauffeur_id, NEW.adjustment_definition_id,
            NEW.effective_from, NEW.effective_until, NEW.is_active) THEN
            RETURN NEW;
        END IF;

        /* Distinguish status-only changes from other updates. */
        IF OLD.is_active IS DISTINCT FROM NEW.is_active
        AND ROW(OLD.chauffeur_id, OLD.adjustment_definition_id,
                OLD.effective_from, OLD.effective_until)
            IS NOT DISTINCT FROM
            ROW(NEW.chauffeur_id, NEW.adjustment_definition_id,
                NEW.effective_from, NEW.effective_until) THEN
            v_action := CASE WHEN NEW.is_active THEN 'activated' ELSE 'deactivated' END;
        ELSE
            v_action := 'updated';
        END IF;

        INSERT INTO public.chauffeur_adjustment_assignment_audit
            (assignment_id, action, old_values, new_values)
        VALUES
            (NEW.id, v_action, to_jsonb(OLD), to_jsonb(NEW));

        RETURN NEW;
    END;
    $$;

    /* Audit only completed database changes within the transaction. */
    CREATE TRIGGER trg_audit_chauffeur_adjustment_assignment
    AFTER INSERT OR UPDATE
    ON public.chauffeur_adjustment_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_chauffeur_adjustment_assignment();

    /* Prevent ordinary roles from directly executing the audit function. */
    REVOKE ALL ON FUNCTION public.audit_chauffeur_adjustment_assignment()
    FROM PUBLIC, anon, authenticated;
COMMIT;