/* ============================================================
   TAXI OPERATOR VERIFICATION STATUS

   Purpose:
   Describes whether Voya Taxi has verified a taxi operator.
============================================================ */

CREATE TYPE public.taxi_operator_verification_status AS ENUM (
    'pending_verification',
    'verified',
    'suspended',
    'inactive'
);


/* ============================================================
   TAXI OPERATORS

   Purpose:
   Stores the legal taxi business that provides transport.

   Every chauffeur belongs to a taxi operator, including
   a chauffeur who operates as a one-person ZZP business.

   Chauffeurs will be connected to this table in a later
   migration.
============================================================ */

CREATE TABLE public.taxi_operators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_name TEXT NOT NULL
        CHECK (length(trim(company_name)) > 0),

    kvk_number TEXT NOT NULL UNIQUE
        CHECK (length(trim(kvk_number)) > 0),

    vat_number TEXT UNIQUE,
    p_number TEXT UNIQUE,

    /* ===== Contact information ===== */
    contact_email TEXT NOT NULL
        CHECK (length(trim(contact_email)) > 0),

    contact_phone TEXT NOT NULL
        CHECK (length(trim(contact_phone)) > 0),

    /* ===== Registered business address ===== */
    street TEXT,
    house_number TEXT,
    postal_code TEXT,
    city TEXT,
    country_code TEXT NOT NULL DEFAULT 'NL'
        CHECK (
            country_code = upper(country_code)
            AND length(country_code) = 2
        ),

    /* ===== Operator verification ===== */
    verification_status public.taxi_operator_verification_status
        NOT NULL DEFAULT 'pending_verification',

    verification_status_reason TEXT,

    verification_status_changed_at TIMESTAMPTZ
        NOT NULL DEFAULT now(),

    verification_status_changed_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    /* Records the successful verification itself. */
    verified_at TIMESTAMPTZ,

    verified_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    /* ===== System timestamps ===== */
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


/* ============================================================
   INDEXES
============================================================ */

CREATE INDEX taxi_operators_verification_status_idx
ON public.taxi_operators(verification_status);

CREATE INDEX taxi_operators_company_name_idx
ON public.taxi_operators(company_name);


/* ============================================================
   UPDATED_AT TRIGGER
============================================================ */

CREATE TRIGGER update_taxi_operators_updated_at
BEFORE UPDATE ON public.taxi_operators
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* ============================================================
   ROW LEVEL SECURITY

   Normal anonymous/authenticated clients do not receive
   direct access to operator records.

   Controlled application operations use the server-side
   Supabase client.
============================================================ */

ALTER TABLE public.taxi_operators ENABLE ROW LEVEL SECURITY;