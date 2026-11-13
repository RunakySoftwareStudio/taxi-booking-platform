/* ============================================================
   VOYA TAXI — CHAUFFEUR COMMISSION ADJUSTMENTS

   Preserve the original chauffeur service fee and record
   total discounts, surcharges, and the final payable amount.

   Individual adjustment snapshots will be stored separately.
============================================================ */

BEGIN;

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

COMMIT;