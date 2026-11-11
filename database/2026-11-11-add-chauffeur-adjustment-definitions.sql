/* ============================================================
   VOYA TAXI — CHAUFFEUR ADJUSTMENT DEFINITIONS

   Reusable discounts and surcharges applied to chauffeur
   service fees, independently of passenger booking prices.
============================================================ */

BEGIN;

    /* SECTION 1: Create reusable chauffeur adjustment definitions. */
    CREATE TABLE public.chauffeur_adjustment_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        name TEXT NOT NULL,
        description TEXT,

        adjustment_type TEXT NOT NULL,
        value_type TEXT NOT NULL,
        value NUMERIC(14,4) NOT NULL,
        currency_code VARCHAR(3),

        effective_from DATE NOT NULL,
        effective_until DATE,

        is_active BOOLEAN NOT NULL DEFAULT TRUE,

        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

        /* SECTION 2: Validate adjustment values and periods. */
        CONSTRAINT chauffeur_adjustment_name_required
            CHECK (length(trim(name)) > 0),

        CONSTRAINT chauffeur_adjustment_type_valid
            CHECK (adjustment_type IN ('discount', 'surcharge')),

        CONSTRAINT chauffeur_adjustment_value_type_valid
            CHECK (value_type IN ('percentage', 'fixed')),

        CONSTRAINT chauffeur_adjustment_value_valid
            CHECK (value > 0),

        CONSTRAINT chauffeur_adjustment_percentage_valid
            CHECK (value_type <> 'percentage'
                OR value <= 100
                OR adjustment_type = 'surcharge'),

        CONSTRAINT chauffeur_adjustment_currency_valid
            CHECK (
                (value_type = 'percentage' AND currency_code IS NULL)
                OR
                (value_type = 'fixed' AND currency_code IS NOT NULL
                    AND currency_code ~ '^[A-Z]{3}$')
            ),

        CONSTRAINT chauffeur_adjustment_period_valid
            CHECK (effective_until IS NULL OR effective_until >= effective_from)
    );
    /* ------------------------------------------------------------
    SECTION 3: PREVENT OVERLAPPING ADJUSTMENT PERIODS

    Prevent overlapping effective dates within the same type.
    Discounts and surcharges may overlap with each other.
    ------------------------------------------------------------ */

    /* Enable support for equality comparisons in GiST indexes. */
    CREATE EXTENSION IF NOT EXISTS btree_gist;

    /* Enforce non-overlapping periods, including inactive definitions. */
    ALTER TABLE public.chauffeur_adjustment_definitions
    ADD CONSTRAINT chauffeur_adjustment_no_period_overlap
    EXCLUDE USING gist (
        adjustment_type WITH =,
        daterange(effective_from, effective_until, '[]') WITH &&
    );

    /* Document the financial protection rule. */
    COMMENT ON CONSTRAINT chauffeur_adjustment_no_period_overlap
    ON public.chauffeur_adjustment_definitions IS
    'Prevents overlapping periods within the same adjustment type, including inactive definitions. Discounts and surcharges may coexist.';

    /* ------------------------------------------------------------
    SECTION 4: AUTOMATIC UPDATED_AT TIMESTAMP

    Record when a chauffeur adjustment definition is modified.
    ------------------------------------------------------------ */

    /* Update the timestamp whenever a definition changes. */
    CREATE OR REPLACE FUNCTION public.set_chauffeur_adjustment_definition_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
        NEW.updated_at := now();
        RETURN NEW;
    END;
    $$;

    /* Attach the timestamp function to definition updates. */
    CREATE TRIGGER trg_chauffeur_adjustment_definition_updated_at
    BEFORE UPDATE
    ON public.chauffeur_adjustment_definitions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_chauffeur_adjustment_definition_updated_at();

    /* Restrict direct execution by ordinary application roles. */
    REVOKE ALL ON FUNCTION public.set_chauffeur_adjustment_definition_updated_at()
    FROM PUBLIC, anon, authenticated;

    /* ------------------------------------------------------------
    SECTION 5: CHAUFFEUR ADJUSTMENT DEFINITION SECURITY

    Restrict financial definition management to trusted
    server-side operations.
    ------------------------------------------------------------ */

    /* Enable Row Level Security. */
    ALTER TABLE public.chauffeur_adjustment_definitions
    ENABLE ROW LEVEL SECURITY;

    /* Prevent direct access by public and ordinary application users. */
    REVOKE ALL ON TABLE public.chauffeur_adjustment_definitions
    FROM PUBLIC, anon, authenticated;

    /* Permit trusted server-side financial management. */
    GRANT SELECT, INSERT, UPDATE
    ON TABLE public.chauffeur_adjustment_definitions
    TO service_role;

    /* Preserve definitions by preventing direct deletion. */
    REVOKE DELETE, TRUNCATE
    ON TABLE public.chauffeur_adjustment_definitions
    FROM service_role;
COMMIT;