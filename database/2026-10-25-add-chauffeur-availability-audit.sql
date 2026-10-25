-- ============================================================
-- VOYA TAXI: ADMIN CHAUFFEUR AVAILABILITY AUDIT
-- Date: 2026-10-25
-- Purpose: Preserve administrator changes to chauffeur availability.
-- Status: Already applied manually in Supabase.
-- ============================================================

-- Create the audit history table.
CREATE TABLE IF NOT EXISTS public.chauffeur_availability_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chauffeur_id uuid NOT NULL REFERENCES public.chauffeurs(id),
    availability_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
    changed_by_user_id uuid NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    reason text NOT NULL CHECK (length(trim(reason)) > 0),
    old_values jsonb,
    new_values jsonb
);

-- Optimize audit history queries by chauffeur and date.
CREATE INDEX IF NOT EXISTS idx_chauffeur_availability_audit_chauffeur
ON public.chauffeur_availability_audit(chauffeur_id, changed_at DESC);

-- Prevent direct access from ordinary application clients.
ALTER TABLE public.chauffeur_availability_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chauffeur_availability_audit
FROM PUBLIC, anon, authenticated;

-- Preserve a valid reference to the administrator's auth account.
-- The conditional block avoids errors if this migration is rerun.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chauffeur_availability_audit_changed_by_fkey'
          AND conrelid = 'public.chauffeur_availability_audit'::regclass
    ) THEN
        ALTER TABLE public.chauffeur_availability_audit
        ADD CONSTRAINT chauffeur_availability_audit_changed_by_fkey
        FOREIGN KEY (changed_by_user_id)
        REFERENCES auth.users(id)
        ON DELETE NO ACTION;
    END IF;
END;
$$;

/* ============================================================
   VOYA TAXI — ADMIN ADD CHAUFFEUR AVAILABILITY

   Purpose:
   - Create a manual chauffeur availability record.
   - Validate the chauffeur, administrator and input.
   - Record the administrator's reason and changes.
   - Save availability and audit history atomically.

   Security:
   - Callable only with privileged server credentials.
   - Next.js must supply the administrator ID obtained from
     requireAdminUser(), never from browser input.
============================================================ */

CREATE OR REPLACE FUNCTION public.admin_add_chauffeur_availability(
    p_chauffeur_id uuid,
    p_admin_user_id uuid,
    p_available_date date,
    p_start_time time,
    p_end_time time,
    p_status public.availability_status,
    p_notes text,
    p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_availability_id uuid;
    v_new_values jsonb;
BEGIN
    -- Verify that the supplied user is currently an administrator.
    IF NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE user_id = p_admin_user_id
          AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Administrator authorization failed.';
    END IF;

    -- Require an explanation for the administrative change.
    IF NULLIF(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'An administrator reason is required.';
    END IF;

    -- Validate the date, time interval and availability status.
    IF p_available_date IS NULL
       OR p_start_time IS NULL
       OR p_end_time IS NULL
       OR p_start_time >= p_end_time
       OR p_status IS NULL
    THEN
        RAISE EXCEPTION 'Invalid availability details.';
    END IF;

    -- Confirm that the target chauffeur exists.
    IF NOT EXISTS (
        SELECT 1
        FROM public.chauffeurs
        WHERE id = p_chauffeur_id
    ) THEN
        RAISE EXCEPTION 'Chauffeur not found.';
    END IF;

    -- Create a manually managed availability period.
    -- booking_id remains NULL.
    INSERT INTO public.chauffeur_availability (
        chauffeur_id,
        available_date,
        start_time,
        end_time,
        status,
        notes
    )
    VALUES (
        p_chauffeur_id,
        p_available_date,
        p_start_time,
        p_end_time,
        p_status,
        NULLIF(btrim(p_notes), '')
    )
    RETURNING id INTO v_availability_id;

    -- Capture the complete new record for audit history.
    SELECT to_jsonb(a)
    INTO v_new_values
    FROM public.chauffeur_availability AS a
    WHERE a.id = v_availability_id;

    -- Record the administrative intervention.
    INSERT INTO public.chauffeur_availability_audit (
        chauffeur_id,
        availability_id,
        action,
        changed_by_user_id,
        reason,
        old_values,
        new_values
    )
    VALUES (
        p_chauffeur_id,
        v_availability_id,
        'created',
        p_admin_user_id,
        btrim(p_reason),
        NULL,
        v_new_values
    );

    RETURN v_availability_id;
END;
$$;

-- Prevent ordinary application users from calling this RPC.
REVOKE ALL ON FUNCTION public.admin_add_chauffeur_availability(
    uuid, uuid, date, time, time,
    public.availability_status, text, text
) FROM PUBLIC, anon, authenticated;

-- Allow the privileged Next.js server connection to call it.
GRANT EXECUTE ON FUNCTION public.admin_add_chauffeur_availability(
    uuid, uuid, date, time, time,
    public.availability_status, text, text
) TO service_role;

/* ============================================================
   VOYA TAXI — ADMIN UPDATE CHAUFFEUR AVAILABILITY

   Updates a manually entered availability period and records
   its previous and new values in the audit history.

   Availability update and audit insertion are atomic.
   ============================================================ */

CREATE OR REPLACE FUNCTION public.admin_update_chauffeur_availability(
    p_chauffeur_id uuid,
    p_availability_id uuid,
    p_admin_user_id uuid,
    p_available_date date,
    p_start_time time,
    p_end_time time,
    p_status public.availability_status,
    p_notes text,
    p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_old_values jsonb;
    v_new_values jsonb;
BEGIN
    -- Verify the administrator's role.
    IF NOT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = p_admin_user_id AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Administrator authorization failed.';
    END IF;

    -- Require a reason for the correction.
    IF NULLIF(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'An administrator reason is required.';
    END IF;

    -- Validate the submitted availability values.
    IF p_available_date IS NULL
       OR p_start_time IS NULL
       OR p_end_time IS NULL
       OR p_start_time >= p_end_time
       OR p_status IS NULL THEN
        RAISE EXCEPTION 'Invalid availability details.';
    END IF;

    /* Lock and read the original row to prevent concurrent
       modifications while the audit entry is being created. */
    SELECT to_jsonb(a)
    INTO v_old_values
    FROM public.chauffeur_availability AS a
    WHERE a.id = p_availability_id
      AND a.chauffeur_id = p_chauffeur_id
      AND a.booking_id IS NULL
    FOR UPDATE;

    IF v_old_values IS NULL THEN
        RAISE EXCEPTION 'Manual availability record not found or protected.';
    END IF;

    -- Update only the selected manual availability record.
    UPDATE public.chauffeur_availability AS a
    SET available_date = p_available_date,
        start_time = p_start_time,
        end_time = p_end_time,
        status = p_status,
        notes = NULLIF(btrim(p_notes), ''),
        updated_at = now()
    WHERE a.id = p_availability_id
      AND a.chauffeur_id = p_chauffeur_id
      AND a.booking_id IS NULL
    RETURNING to_jsonb(a) INTO v_new_values;

    -- Preserve the original and updated data in the audit history.
    INSERT INTO public.chauffeur_availability_audit (
        chauffeur_id, availability_id, action,
        changed_by_user_id, reason, old_values, new_values
    )
    VALUES (
        p_chauffeur_id, p_availability_id, 'updated',
        p_admin_user_id, btrim(p_reason), v_old_values, v_new_values
    );

    RETURN p_availability_id;
END;
$$;

-- Restrict execution to the trusted server role.
REVOKE ALL ON FUNCTION public.admin_update_chauffeur_availability(
    uuid, uuid, uuid, date, time, time,
    public.availability_status, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_update_chauffeur_availability(
    uuid, uuid, uuid, date, time, time,
    public.availability_status, text, text
) TO service_role;

/* ============================================================
   VOYA TAXI — ADMIN DELETE CHAUFFEUR AVAILABILITY

   Purpose:
   - Delete manually entered chauffeur availability.
   - Protect availability generated from bookings.
   - Preserve deleted record details in the audit history.
   - Perform deletion and auditing in one transaction.
============================================================ */

CREATE OR REPLACE FUNCTION public.admin_delete_chauffeur_availability(
    p_chauffeur_id uuid,
    p_availability_id uuid,
    p_admin_user_id uuid,
    p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_old_values jsonb;
BEGIN
    -- Verify that the supplied user has the administrator role.
    IF NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE user_id = p_admin_user_id
          AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Administrator authorization failed.';
    END IF;

    -- Require an explanation for deleting availability.
    IF NULLIF(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'An administrator reason is required.';
    END IF;

    /* Lock the selected record and capture its original values.
       Booking-generated periods are excluded from deletion. */
    SELECT to_jsonb(a)
    INTO v_old_values
    FROM public.chauffeur_availability AS a
    WHERE a.id = p_availability_id
      AND a.chauffeur_id = p_chauffeur_id
      AND a.booking_id IS NULL
    FOR UPDATE;

    IF v_old_values IS NULL THEN
        RAISE EXCEPTION 'Manual availability record not found or protected.';
    END IF;

    /* Delete only the selected manual availability record.
       The booking_id condition also protects the DELETE operation. */
    DELETE FROM public.chauffeur_availability
    WHERE id = p_availability_id
      AND chauffeur_id = p_chauffeur_id
      AND booking_id IS NULL;

    /* Preserve the deleted record in the audit history.
       new_values is NULL because the record no longer exists. */
    INSERT INTO public.chauffeur_availability_audit (
        chauffeur_id,
        availability_id,
        action,
        changed_by_user_id,
        reason,
        old_values,
        new_values
    )
    VALUES (
        p_chauffeur_id,
        p_availability_id,
        'deleted',
        p_admin_user_id,
        btrim(p_reason),
        v_old_values,
        NULL
    );

    RETURN p_availability_id;
END;
$$;

-- Prevent ordinary clients from invoking this function.
REVOKE ALL ON FUNCTION public.admin_delete_chauffeur_availability(
    uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;

-- Allow execution by the privileged Next.js server connection.
GRANT EXECUTE ON FUNCTION public.admin_delete_chauffeur_availability(
    uuid, uuid, uuid, text
) TO service_role;