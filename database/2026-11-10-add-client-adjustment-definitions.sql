/* ============================================================
   VOYA TAXI — CLIENT ADJUSTMENT DEFINITIONS

   Reusable client discounts and surcharges.
   No client assignments or booking price calculations yet.
============================================================ */

BEGIN;

/* SECTION 1: Store reusable financial adjustment definitions. */
CREATE TABLE public.client_adjustment_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NULL,
    adjustment_type TEXT NOT NULL,
    value_type TEXT NOT NULL,
    value NUMERIC(14,4) NOT NULL,
    currency_code VARCHAR(3) NULL,
    effective_from DATE NOT NULL,
    effective_until DATE NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT client_adjustment_name_required
        CHECK (LENGTH(TRIM(name)) > 0),

    CONSTRAINT client_adjustment_type_valid
        CHECK (adjustment_type IN ('discount', 'surcharge')),

    CONSTRAINT client_adjustment_value_type_valid
        CHECK (value_type IN ('percentage', 'fixed')),

    CONSTRAINT client_adjustment_value_valid
        CHECK (value > 0),

    CONSTRAINT client_adjustment_percentage_valid
        CHECK (value_type <> 'percentage' OR
              (value <= 100 OR adjustment_type = 'surcharge')),

    CONSTRAINT client_adjustment_currency_valid
        CHECK (
            (value_type = 'percentage' AND currency_code IS NULL)
            OR
            (value_type = 'fixed' AND currency_code IS NOT NULL
             AND currency_code ~ '^[A-Z]{3}$')
        ),

    CONSTRAINT client_adjustment_period_valid
        CHECK (effective_until IS NULL OR effective_from IS NULL
               OR effective_until >= effective_from)
);

/* SECTION 2: Document the financial purpose. */
COMMENT ON TABLE public.client_adjustment_definitions IS
'Reusable client discount and surcharge definitions. Client assignments and pricing integration are implemented separately.';

/* SECTION 3: Automatically maintain modification timestamps. */
CREATE TRIGGER update_client_adjustment_definitions_updated_at
BEFORE UPDATE ON public.client_adjustment_definitions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

/* SECTION 4: Restrict access to trusted server-side operations. */
ALTER TABLE public.client_adjustment_definitions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_adjustment_definitions
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.client_adjustment_definitions TO service_role;

/* Definitions are deactivated rather than permanently deleted. */
REVOKE DELETE, TRUNCATE
ON TABLE public.client_adjustment_definitions FROM service_role;

COMMIT;