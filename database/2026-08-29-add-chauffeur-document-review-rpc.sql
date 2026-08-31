/* ============================================================
   REVIEW CHAUFFEUR DOCUMENT

   Purpose:
   Allows an administrator to verify or reject one uploaded
   chauffeur compliance document.

   Important:
   - Rejection requires a reason.
   - Verification records verified_at / verified_by.
   - When a document is verified, other verified documents of the same type become superseded.
   - This does NOT change chauffeur account_status, operational_status or chauffeur verification_status.
============================================================ */

CREATE OR REPLACE FUNCTION public.review_chauffeur_document(
    p_chauffeur_id UUID,
    p_document_id UUID,
    p_verification_status public.chauffeur_document_verification_status,
    p_status_reason TEXT,
    p_changed_by_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_current_status public.chauffeur_document_verification_status;
    v_document_type public.chauffeur_document_type;
BEGIN
    /* ===== Validate administrator ===== */
    IF p_changed_by_user_id IS NULL
    OR NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE user_id = p_changed_by_user_id
          AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Only an administrator can review chauffeur documents.'
        USING ERRCODE = '42501';
    END IF;

    /* ===== Read and lock document ===== */
    SELECT verification_status, document_type
    INTO v_current_status, v_document_type
    FROM public.chauffeur_documents
    WHERE id = p_document_id
      AND chauffeur_id = p_chauffeur_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Chauffeur document was not found.'
        USING ERRCODE = 'P0002';
    END IF;

    /* ===== Validate requested status ===== */
    IF p_verification_status NOT IN ('verified', 'rejected') THEN
        RAISE EXCEPTION 'Document review status must be verified or rejected.'
        USING ERRCODE = '22023';
    END IF;

    IF v_current_status <> 'pending_review' THEN
        RAISE EXCEPTION 'Only a pending review document can be reviewed.'
        USING ERRCODE = '22023';
    END IF;

    /* ===== Rejection requires a reason ===== */
    IF p_verification_status = 'rejected'
    AND NULLIF(trim(COALESCE(p_status_reason, '')), '') IS NULL THEN
        RAISE EXCEPTION 'A rejection reason is required.'
        USING ERRCODE = '22023';
    END IF;

    /* ===== Update reviewed document ===== */
    UPDATE public.chauffeur_documents
    SET
        verification_status = p_verification_status,
        verification_reason = CASE
            WHEN p_verification_status = 'rejected'
                THEN NULLIF(trim(COALESCE(p_status_reason, '')), '')
            ELSE NULL
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
    WHERE id = p_document_id;

    /* ===== Supersede other verified versions ===== */
    IF p_verification_status = 'verified' THEN
        UPDATE public.chauffeur_documents
        SET
            verification_status = 'superseded',
            verification_reason = 'Replaced by a newer verified document.',
            verification_status_changed_at = now(),
            verification_status_changed_by = p_changed_by_user_id
        WHERE chauffeur_id = p_chauffeur_id
          AND document_type = v_document_type
          AND id <> p_document_id
          AND verification_status = 'verified';
    END IF;
END;
$$;


/* ============================================================
   FUNCTION SECURITY
============================================================ */

REVOKE ALL
ON FUNCTION public.review_chauffeur_document(
    UUID,
    UUID,
    public.chauffeur_document_verification_status,
    TEXT,
    UUID
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.review_chauffeur_document(
    UUID,
    UUID,
    public.chauffeur_document_verification_status,
    TEXT,
    UUID
)
TO service_role;