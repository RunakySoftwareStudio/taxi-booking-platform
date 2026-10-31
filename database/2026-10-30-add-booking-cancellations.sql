/* ============================================================
   VOYA TAXI — BOOKING CANCELLATIONS
   Date: 2026-10-30

   Purpose:
   Store permanent booking cancellation information.

   Rules:
   - Each booking can have only one permanent cancellation.
   - Client cancellation reason is optional.
   - Admin cancellation reason is mandatory.
   - Chauffeur withdrawal is NOT a booking cancellation.
   - Cancellation records preserve the previously assigned chauffeur.
============================================================ */

CREATE TABLE IF NOT EXISTS public.booking_cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL
        REFERENCES public.bookings(id) ON DELETE RESTRICT,
    cancelled_by TEXT NOT NULL
        CHECK (cancelled_by IN ('client', 'admin', 'system')),
    cancelled_by_user_id UUID NULL
        REFERENCES auth.users(id) ON DELETE NO ACTION,
    previous_chauffeur_id UUID NULL
        REFERENCES public.chauffeurs(id) ON DELETE SET NULL,
    cancellation_reason TEXT NULL,
    cancelled_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    /* One permanent cancellation per booking. */
    CONSTRAINT booking_cancellations_booking_unique UNIQUE (booking_id),

    /* Administrators must provide a meaningful reason. */
    CONSTRAINT booking_cancellations_admin_reason_required
        CHECK (cancelled_by <> 'admin' OR NULLIF(BTRIM(cancellation_reason), '') IS NOT NULL)
);

/* ============================================================
   BOOKING CANCELLATIONS — SECURITY

   Purpose:
   - Enable Row Level Security.
   - Prevent anonymous and authenticated browser users
     from directly reading or modifying cancellation records.
   - Allow the trusted server-side service_role to access
     cancellation history through protected operations.
============================================================ */

-- Enable Row Level Security.
ALTER TABLE public.booking_cancellations
ENABLE ROW LEVEL SECURITY;

-- Block direct access from ordinary application roles.
REVOKE ALL ON TABLE public.booking_cancellations
FROM PUBLIC, anon, authenticated;

-- Explicitly allow trusted server-side operations.
GRANT SELECT, INSERT
ON TABLE public.booking_cancellations
TO service_role;
/* ======================================================================================================================
    END BOOKING CANCELLATIONS
======================================================================================================================*/