/* ============================================================
   REVIEW CHAUFFEUR CHANGE REQUEST

   Allows Admin to approve or reject a pending protected-profile
   change request.

   Approved requests update the chauffeur and the request status
   in the same database transaction.

    Pending request
        ↓
    Lock request
        ↓
    Lock chauffeur
        ↓
    Is current value still the one originally requested against?
        ├─ No  → stop safely
        └─ Yes → approve and update
============================================================ */

CREATE OR REPLACE FUNCTION public.review_chauffeur_change_request(
    p_request_id UUID,
    p_review_status TEXT,
    p_admin_note TEXT,
    p_changed_by_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_chauffeur_id UUID;
    v_field_name TEXT;
    v_requested_value TEXT;
    v_current_request_status TEXT;
    v_requested_current_value TEXT;
    v_live_current_value TEXT;
BEGIN
    /* Only a real Admin user may review chauffeur change requests. */
    IF p_changed_by_user_id IS NULL
       OR NOT EXISTS (
            SELECT 1
            FROM public.user_profiles
            WHERE user_id = p_changed_by_user_id
              AND role = 'admin'
       )
    THEN
        RAISE EXCEPTION 'Only an administrator can review chauffeur change requests.'
        USING ERRCODE = '42501';
    END IF;

    /* Only final review decisions are accepted. */
    IF p_review_status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Review status must be approved or rejected.'
        USING ERRCODE = '22023';
    END IF;

    /* Rejected requests require an explanation. */
    IF p_review_status = 'rejected'
       AND NULLIF(trim(COALESCE(p_admin_note, '')), '') IS NULL
    THEN
        RAISE EXCEPTION 'A rejection explanation is required.'
        USING ERRCODE = '22023';
    END IF;

    /* Load and lock the request while Admin reviews it. */
    SELECT
        chauffeur_id,
        field_name,
        current_value,
        requested_value,
        status
    INTO
        v_chauffeur_id,
        v_field_name,
        v_requested_current_value,
        v_requested_value,
        v_current_request_status
    FROM public.chauffeur_change_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Change request could not be found.'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_current_request_status <> 'pending' THEN
        RAISE EXCEPTION 'Only a pending change request can be reviewed.'
        USING ERRCODE = '22023';
    END IF;

    /* Confirm the chauffeur value has not changed since the request was created. */
    IF p_review_status = 'approved' THEN
        SELECT
            CASE
                WHEN v_field_name = 'name' THEN name
                WHEN v_field_name = 'email' THEN email
                WHEN v_field_name = 'address' THEN address
                ELSE NULL
            END
        INTO v_live_current_value
        FROM public.chauffeurs
        WHERE id = v_chauffeur_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Chauffeur could not be found.'
            USING ERRCODE = 'P0002';
        END IF;

        IF v_live_current_value IS DISTINCT FROM v_requested_current_value THEN
            RAISE EXCEPTION 'The chauffeur information changed after this request was submitted. Review the request again.'
            USING ERRCODE = '40001';
        END IF;
    END IF;

    /* Apply the approved protected profile value. */
    IF p_review_status = 'approved' THEN
        IF v_field_name = 'name' THEN
            UPDATE public.chauffeurs
            SET name = trim(v_requested_value)
            WHERE id = v_chauffeur_id;

        ELSIF v_field_name = 'email' THEN
            UPDATE public.chauffeurs
            SET email = lower(trim(v_requested_value))
            WHERE id = v_chauffeur_id;

        ELSIF v_field_name = 'address' THEN
            UPDATE public.chauffeurs
            SET address = trim(v_requested_value)
            WHERE id = v_chauffeur_id;

        ELSE
            RAISE EXCEPTION 'Unsupported chauffeur change-request field.'
            USING ERRCODE = '22023';
        END IF;
    END IF;

    /* Store the final Admin decision and audit information. */
    UPDATE public.chauffeur_change_requests
    SET
        status = p_review_status,
        admin_note = NULLIF(trim(COALESCE(p_admin_note, '')), ''),
        reviewed_by = p_changed_by_user_id,
        reviewed_at = now()
    WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_chauffeur_change_request(
    UUID,
    TEXT,
    TEXT,
    UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.review_chauffeur_change_request(
    UUID,
    TEXT,
    TEXT,
    UUID
) TO service_role;
