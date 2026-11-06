/* ============================================================
   VOYA TAXI — BOOKING FINANCIAL EXCLUSION AUDIT

   Purpose:
   Preserve the history of administrative changes to
   booking financial exclusion settings.

   Audit records capture:
   - The affected booking
   - The administrator responsible
   - The action and explanation
   - Previous and updated financial values
   - The exact change timestamp

   Financial audit records must be append-only.
============================================================ */

CREATE TABLE public.booking_financial_exclusion_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    /* Preserve the booking reference for financial history. */
    booking_id UUID NOT NULL
        REFERENCES public.bookings(id) ON DELETE RESTRICT,

    /* Identifies whether exclusion was enabled, removed or revised. */
    action TEXT NOT NULL
        CHECK (action IN ('excluded', 'included', 'reason_updated')),

    /* Authenticated administrator responsible for the change. */
    changed_by_user_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE RESTRICT,

    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    /* Explanation associated with the financial decision. */
    reason TEXT NOT NULL
        CHECK (LENGTH(TRIM(reason)) > 0),

    /* Preserve both versions of the financial exclusion settings. */
    old_values JSONB NOT NULL,
    new_values JSONB NOT NULL
);

/* ============================================================
   SECURITY — FINANCIAL EXCLUSION AUDIT

   Only trusted service-role operations may access the table.
   No UPDATE or DELETE privileges are granted to service_role.
============================================================ */

ALTER TABLE public.booking_financial_exclusion_audit
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.booking_financial_exclusion_audit
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT
ON TABLE public.booking_financial_exclusion_audit
TO service_role;

/* Document the table directly in PostgreSQL. */
COMMENT ON TABLE public.booking_financial_exclusion_audit IS
'Append-only history of administrative financial exclusion changes,
including previous values, new values, administrator identity and reason.';