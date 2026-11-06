    /* ============================================================
    VOYA TAXI — CHAUFFEUR BOOKING COMMISSIONS

    Purpose:
    Store one historical service-fee commission per
    completed and financially eligible booking.

    Financial rules:
    - One commission record per booking.
    - Commission basis excludes passenger VAT.
    - Applied percentage and amounts are frozen snapshots.
    - Historical financial references cannot be deleted.
    - Commission generation requires a protected RPC.
    - Financially excluded bookings must never generate
        commissions.

    This migration creates the table only.
    It does not generate commission records.
    ============================================================ */

    CREATE TABLE public.chauffeur_booking_commissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        /* One commission per completed booking. */
        booking_id UUID NOT NULL UNIQUE
            REFERENCES public.bookings(id) ON DELETE RESTRICT,

        /* Preserve the chauffeur responsible for the service fee. */
        chauffeur_id UUID NOT NULL
            REFERENCES public.chauffeurs(id) ON DELETE RESTRICT,

        /* Reference the accepted journey quotation. */
        journey_quote_id UUID NOT NULL
            REFERENCES public.journey_quotes(quote_id) ON DELETE RESTRICT,

        /* Reference the applicable historical service-fee rate. */
        service_fee_rate_id UUID NOT NULL
            REFERENCES public.financial_service_fee_rates(id) ON DELETE RESTRICT,

        /* Official completion timestamp used for rate selection. */
        completed_at TIMESTAMPTZ NOT NULL,

        /* Frozen journey amount excluding passenger VAT. */
        journey_amount_excluding_vat NUMERIC(12,4) NOT NULL,

        /* Frozen service-fee percentage applied to the journey. */
        applied_percentage NUMERIC(7,4) NOT NULL,

        /* Frozen calculated chauffeur service fee, excluding invoice VAT. */
        commission_amount NUMERIC(12,4) NOT NULL,

        /* Preserve the currency from the accepted quotation. */
        currency_code VARCHAR(3) NOT NULL,

        /* Timestamp when the commission record was generated. */
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        /* --------------------------------------------------------
        FINANCIAL VALIDATION CONSTRAINTS
        -------------------------------------------------------- */

        CONSTRAINT chauffeur_booking_commissions_journey_amount_valid
            CHECK (journey_amount_excluding_vat >= 0),

        CONSTRAINT chauffeur_booking_commissions_percentage_valid
            CHECK (applied_percentage BETWEEN 0 AND 100),

        CONSTRAINT chauffeur_booking_commissions_amount_valid
            CHECK (commission_amount >= 0),

        CONSTRAINT chauffeur_booking_commissions_currency_valid
            CHECK (currency_code ~ '^[A-Z]{3}$')
    );

    /* Improve financial reporting by chauffeur and completion date. */
    CREATE INDEX chauffeur_booking_commissions_chauffeur_date_idx
    ON public.chauffeur_booking_commissions (
        chauffeur_id,
        completed_at
    );

    /* ============================================================
    SECURITY — CHAUFFEUR BOOKING COMMISSIONS

    Commission records are created by trusted server-side
    operations. Historical snapshots must not be silently
    modified or deleted by application database roles.
    ============================================================ */

    ALTER TABLE public.chauffeur_booking_commissions
    ENABLE ROW LEVEL SECURITY;

    /* Deny direct access to ordinary application users. */
    REVOKE ALL ON TABLE public.chauffeur_booking_commissions
    FROM PUBLIC, anon, authenticated;

    /* Limit service_role to reading and inserting commissions. */
    REVOKE ALL ON TABLE public.chauffeur_booking_commissions
    FROM service_role;

    GRANT SELECT, INSERT
    ON TABLE public.chauffeur_booking_commissions
    TO service_role;

    /* Document the financial purpose directly in PostgreSQL. */
    COMMENT ON TABLE public.chauffeur_booking_commissions IS
    'Historical chauffeur service-fee commissions for completed,
    financially eligible bookings. Each record preserves the applied rate,
    VAT-exclusive journey amount and calculated commission.';

    COMMENT ON COLUMN public.chauffeur_booking_commissions.commission_amount IS
    'Frozen chauffeur service fee calculated from the journey amount
    excluding passenger VAT. Does not include VAT potentially
    charged on the Voya Taxi service-fee invoice.';
    /* ===========================================================
        END VOYA TAXI — CHAUFFEUR BOOKING COMMISSIONS
    =============================================================*/