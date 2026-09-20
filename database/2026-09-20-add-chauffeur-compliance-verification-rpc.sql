
/* ========================================================================================================================================
   WHOLE-CHAUFFEUR COMPLIANCE VERIFICATION

   Purpose:
    Allows Admin to verify, suspend or deactivate a chauffeur's
    professional compliance approval.
    The function changes only the whole-chauffeur compliance status.
    It enforces the two required qualifications in the database, so the Admin interface cannot bypass them simply by sending a verification request.
    It also preserves the existing distinction between document verification and whole-chauffeur verification.

    Document verification remains independent.
    Account and operational statuses are never changed.
=================================================================================================================================================== */

CREATE OR REPLACE FUNCTION public.update_chauffeur_compliance_verification(
    p_chauffeur_id UUID,
    p_verification_status public.chauffeur_verification_status,
    p_status_reason TEXT,
    p_changed_by_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_current_status public.chauffeur_verification_status;
BEGIN

    /* =========================================================
       ADMIN AUTHORIZATION

       Only a registered Admin may change chauffeur compliance.
       Execution permission is restricted to service_role below.
    ========================================================= */

    IF p_changed_by_user_id IS NULL
    OR NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE user_id = p_changed_by_user_id
          AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Only an administrator can change chauffeur compliance.'
        USING ERRCODE = '42501';
    END IF;

    /* =========================================================
       CHAUFFEUR COMPLIANCE LOOKUP

       Lock the compliance record during this status change.
    ========================================================= */

    SELECT verification_status
    INTO v_current_status
    FROM public.chauffeur_compliance
    WHERE chauffeur_id = p_chauffeur_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Chauffeur compliance record was not found.'
        USING ERRCODE = 'P0002';
    END IF;

    /* =========================================================
       REQUESTED STATUS VALIDATION

       Admin can verify, suspend or deactivate a chauffeur.
       Pending verification is not an Admin action.
    ========================================================= */

    IF p_verification_status IS NULL
    OR p_verification_status NOT IN ('verified', 'suspended', 'inactive') THEN
        RAISE EXCEPTION 'Invalid chauffeur verification status.'
        USING ERRCODE = '22023';
    END IF;

    /* Avoid recording a status change when nothing has changed. */
    IF v_current_status = p_verification_status THEN
        RAISE EXCEPTION 'Chauffeur already has the requested verification status.'
        USING ERRCODE = '22023';
    END IF;

    /* =========================================================
       SUSPENSION AND DEACTIVATION REASON

       Both actions require an explanation for the audit record.
    ========================================================= */

    IF p_verification_status IN ('suspended', 'inactive')
    AND NULLIF(trim(COALESCE(p_status_reason, '')), '') IS NULL THEN
        RAISE EXCEPTION 'A reason is required for suspension or deactivation.'
        USING ERRCODE = '22023';
    END IF;

    /* =========================================================
       REQUIRED QUALIFICATIONS

       Voya V1 requires two currently verified documents:
       1. Driving licence
       2. Chauffeurskaart

       Expiry dates must be present and cannot be in the past.
       These checks also apply when restoring a suspended or
       inactive chauffeur to verified status.
    ========================================================= */

    IF p_verification_status = 'verified' THEN

        /* Check the currently verified driving licence. */
        IF NOT EXISTS (
            SELECT 1
            FROM public.chauffeur_documents
            WHERE chauffeur_id = p_chauffeur_id
              AND document_type = 'driving_license'
              AND verification_status = 'verified'
              AND valid_until >= CURRENT_DATE
        ) THEN
            RAISE EXCEPTION 'A valid verified driving licence is required.'
            USING ERRCODE = '22023';
        END IF;

        /* Check the currently verified Chauffeurskaart. */
        IF NOT EXISTS (
            SELECT 1
            FROM public.chauffeur_documents
            WHERE chauffeur_id = p_chauffeur_id
              AND document_type = 'chauffeur_card'
              AND verification_status = 'verified'
              AND valid_until >= CURRENT_DATE
        ) THEN
            RAISE EXCEPTION 'A valid verified Chauffeurskaart is required.'
            USING ERRCODE = '22023';
        END IF;

    END IF;

    /* =========================================================
       UPDATE WHOLE-CHAUFFEUR COMPLIANCE

       Record every actual status change and the responsible Admin.

       Successful verification updates verified_at and verified_by.
       Suspension or deactivation preserves the last successful
       verification details for reference.

       No chauffeur account or operational fields are modified.
    ========================================================= */

    UPDATE public.chauffeur_compliance
    SET
        verification_status = p_verification_status,

        verification_status_reason = CASE
            WHEN p_verification_status = 'verified' THEN NULL
            ELSE trim(p_status_reason)
        END,

        verification_status_changed_at = now(),
        verification_status_changed_by = p_changed_by_user_id,

        verified_at = CASE
            WHEN p_verification_status = 'verified' THEN now()
            ELSE verified_at
        END,

        verified_by = CASE
            WHEN p_verification_status = 'verified' THEN p_changed_by_user_id
            ELSE verified_by
        END

    WHERE chauffeur_id = p_chauffeur_id;

END;
$$;

/* ============================================================
   FUNCTION SECURITY

   Browser roles cannot execute this RPC directly.
   Only the protected server-side Admin API may call it using
   the service_role database credentials.
============================================================ */

REVOKE ALL
ON FUNCTION public.update_chauffeur_compliance_verification(
    UUID,
    public.chauffeur_verification_status,
    TEXT,
    UUID
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.update_chauffeur_compliance_verification(
    UUID,
    public.chauffeur_verification_status,
    TEXT,
    UUID
)
TO service_role;

/* =================================================================================================
     End WHOLE-CHAUFFEUR COMPLIANCE VERIFICATION
 =================================================================================================*/