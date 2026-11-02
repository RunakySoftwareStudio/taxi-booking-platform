/* ============================================================
   VOYA TAXI — BOOKING COMPLETION METADATA

   Purpose:
   Record when a booking is officially confirmed completed
   and whether completion was initiated by Admin, Chauffeur,
   or the System.

   This migration does not update historical booking statuses.
============================================================ */

ALTER TABLE public.bookings
    ADD COLUMN completed_at TIMESTAMPTZ NULL,
    ADD COLUMN completed_by TEXT NULL;

/* Restrict completion source to the supported actor types. */
ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_completed_by_valid
    CHECK (
        completed_by IS NULL
        OR completed_by IN ('admin', 'chauffeur', 'system')
    );

/* Ensure both completion fields are provided together. */
ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_completion_metadata_pair
    CHECK (
        (completed_at IS NULL AND completed_by IS NULL)
        OR
        (completed_at IS NOT NULL AND completed_by IS NOT NULL)
    );

/* ============================================================
   COMPLETION STATUS CONSISTENCY

   Completed bookings must have a completion timestamp
   and source. All other statuses must have neither.
============================================================ */
ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_completion_status_consistent
    CHECK (
        (status = 'completed'
            AND completed_at IS NOT NULL
            AND completed_by IS NOT NULL)
        OR
        (status <> 'completed'
            AND completed_at IS NULL
            AND completed_by IS NULL)
    );

/* Document the meaning of the new columns. */
COMMENT ON COLUMN public.bookings.completed_at IS
'Timestamp when the booking was officially confirmed completed, not necessarily when the journey physically ended.';

COMMENT ON COLUMN public.bookings.completed_by IS
'Completion initiator: admin, chauffeur, or system.';