/* ============================================================
   VOYA TAXI — FINANCIAL MANAGEMENT & INVOICING
   ============================================================

   Purpose:
   Manage financial obligations between Voya Taxi and
   chauffeurs using the booking platform.

   This section includes:
   1. Historical chauffeur service-fee percentages.
   2. Completed journey commission records.
   3. Client and chauffeur financial adjustments.
   4. Chauffeur invoicing and payment tracking.

   Commission calculations use the accepted journey
   quotation amount excluding passenger VAT.

   Only completed bookings are eligible for commission.

   Existing financial history must remain preserved.
============================================================ */
/* ============================================================
   VOYA TAXI — FINANCIAL SERVICE FEE RATES

   Purpose:
   Store historical service-fee percentages for:
   1. All chauffeurs (default rate).
   2. Individual chauffeurs (specific rate).

   A NULL chauffeur_id represents the default rate.

   Rates use inclusive start and exclusive end dates.
   NULL effective_until means no scheduled end.

   Overlapping rate periods are prohibited.
============================================================ */

/*
   SECTION 1 — Enable GiST equality support for UUIDs.

   Required for preventing overlapping chauffeur-specific
   rate periods using an exclusion constraint.
*/
CREATE EXTENSION IF NOT EXISTS btree_gist;

/*
   SECTION 2 — Create the historical service-fee table.

   No default commission percentage is inserted yet.
*/
CREATE TABLE public.financial_service_fee_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    chauffeur_id UUID NULL
        REFERENCES public.chauffeurs(id) ON DELETE RESTRICT,

    percentage NUMERIC(7,4) NOT NULL,

    effective_from DATE NOT NULL,
    effective_until DATE NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT financial_service_fee_percentage_valid CHECK (percentage >= 0 AND percentage <= 100),
    CONSTRAINT financial_service_fee_dates_valid CHECK (effective_until IS NULL OR effective_until > effective_from)
);

/*
   SECTION 3 — Prevent overlapping chauffeur-specific rates.

   For the same chauffeur, only one rate may apply
   to a given calendar date.
*/
ALTER TABLE public.financial_service_fee_rates
ADD CONSTRAINT financial_service_fee_chauffeur_no_overlap
EXCLUDE USING gist (
    chauffeur_id WITH =,
    daterange(effective_from, effective_until,'[)') WITH &&
)
WHERE (chauffeur_id IS NOT NULL);

/*
   SECTION 4 — Prevent overlapping default rates.

   Only one default rate may apply on any date.
*/
ALTER TABLE public.financial_service_fee_rates
ADD CONSTRAINT financial_service_fee_default_no_overlap
EXCLUDE USING gist (
    daterange(effective_from, effective_until,'[)') WITH &&
)
WHERE (chauffeur_id IS NULL);

/*
   SECTION 5 — Enable Row Level Security.

   Financial configuration must not be accessible
   directly to anonymous or authenticated clients.

   Future Admin operations will use an authenticated,
   authorized server-side service.
*/
ALTER TABLE public.financial_service_fee_rates
ENABLE ROW LEVEL SECURITY;

/*
   SECTION 6 — Restrict database permissions.

   Only the service_role receives direct table access.
   The application must verify Admin authorization.
*/
REVOKE ALL ON TABLE public.financial_service_fee_rates
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.financial_service_fee_rates
TO service_role;

/*
   SECTION 7 — Documentation.
*/
COMMENT ON TABLE public.financial_service_fee_rates IS
'Historical default and chauffeur-specific Voya Taxi service-fee rates.';

COMMENT ON COLUMN public.financial_service_fee_rates.chauffeur_id IS
'NULL represents the default rate; otherwise references an individual chauffeur.';

COMMENT ON COLUMN public.financial_service_fee_rates.percentage IS
'Service fee percentage applied to the VAT-exclusive journey fare.';

COMMENT ON COLUMN public.financial_service_fee_rates.effective_until IS
'Exclusive end date. NULL means the rate has no scheduled end.';
/* ======================================================================================================
   END — FINANCIAL MANAGEMENT & INVOICING
   =====================================================================================================*/