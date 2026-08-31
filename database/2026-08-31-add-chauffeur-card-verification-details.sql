/* ============================================================
   CHAUFFEUR DOCUMENT REVIEW WITH STRUCTURED CARD DETAILS

   Extends chauffeur document verification so that verifying a
   Chauffeurskaart also stores its structured compliance data.

   During Chauffeurskaart verification:
   - card number is required;
   - valid-until date is required;
   - the uploaded document becomes verified;
   - chauffeur_compliance receives the card number and expiry;
   - chauffeur_card_checked_at records when Admin checked it.

   All changes happen in one PostgreSQL transaction.
   If one validation or update fails, nothing is saved.

   The existing five-parameter RPC is temporarily kept so the
   currently deployed application continues working until the
   new application code has been deployed.
============================================================ */

CREATE OR REPLACE FUNCTION public.review_chauffeur_document(
    p_chauffeur_id UUID,
    p_document_id UUID,
    p_verification_status public.chauffeur_document_verification_status,
    p_status_reason TEXT,
    p_changed_by_user_id UUID,
    p_chauffeur_card_number TEXT,
    p_chauffeur_card_valid_until DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_current_status public.chauffeur_document_verification_status;
    v_document_type public.chauffeur_document_type;
    v_card_number TEXT;
BEGIN
    /* =========================================================
       ADMIN AUTHORIZATION

       The supplied user must exist in user_profiles as Admin.
       The function itself is executable only by service_role.
    ========================================================= */
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

    /* =========================================================
       DOCUMENT LOOKUP AND LOCK

       Locks the selected document so two review operations cannot
       modify the same document simultaneously.
    ========================================================= */
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

    /* =========================================================
       REVIEW STATUS VALIDATION

       Only pending documents can receive one final Admin review
       decision: verified or rejected.
    ========================================================= */
    /* A review decision is required and must be one of the two allowed final states. */
    IF p_verification_status IS NULL
    OR p_verification_status NOT IN ('verified', 'rejected') THEN
        RAISE EXCEPTION 'Document review status must be verified or rejected.'
        USING ERRCODE = '22023';
    END IF;

    IF v_current_status <> 'pending_review' THEN
        RAISE EXCEPTION 'Only a pending review document can be reviewed.'
        USING ERRCODE = '22023';
    END IF;

    /* Rejected documents require an audit explanation. */
    IF p_verification_status = 'rejected'
    AND NULLIF(trim(COALESCE(p_status_reason, '')), '') IS NULL THEN
        RAISE EXCEPTION 'A rejection reason is required.'
        USING ERRCODE = '22023';
    END IF;

    /* =========================================================
       CHAUFFEURSKAART VALIDATION

       A Chauffeurskaart may only be verified when Admin records
       both its card number and its expiry date.
    ========================================================= */
    IF p_verification_status = 'verified'
    AND v_document_type = 'chauffeur_card' THEN

        v_card_number := NULLIF(trim(COALESCE(p_chauffeur_card_number, '')), '');

        IF v_card_number IS NULL THEN
            RAISE EXCEPTION 'Chauffeurskaart number is required before verification.'
            USING ERRCODE = '22023';
        END IF;

        IF p_chauffeur_card_valid_until IS NULL THEN
            RAISE EXCEPTION 'Chauffeurskaart valid-until date is required before verification.'
            USING ERRCODE = '22023';
        END IF;

        /* The card must still be valid on the day Admin verifies it. */
        IF p_chauffeur_card_valid_until < CURRENT_DATE THEN
            RAISE EXCEPTION 'An expired Chauffeurskaart cannot be verified.'
            USING ERRCODE = '22023';
        END IF;
    END IF;

    /* =========================================================
       DOCUMENT REVIEW UPDATE

       Saves the Admin decision and audit information.
       Chauffeurskaart expiry is also stored on the document row
       so the uploaded document carries its own validity history.
    ========================================================= */
    UPDATE public.chauffeur_documents
    SET
        verification_status = p_verification_status,
        verification_reason = CASE
            WHEN p_verification_status = 'rejected'
                THEN NULLIF(trim(COALESCE(p_status_reason, '')), '')
            ELSE NULL
        END,
        valid_until = CASE
            WHEN p_verification_status = 'verified'
             AND v_document_type = 'chauffeur_card'
                THEN p_chauffeur_card_valid_until
            ELSE valid_until
        END,
        verification_status_changed_at = now(),
        verification_status_changed_by = p_changed_by_user_id,
        verified_at = CASE
            WHEN p_verification_status = 'verified' THEN now()
            ELSE verified_at
        END,
        verified_by = CASE
            WHEN p_verification_status = 'verified'
                THEN p_changed_by_user_id
            ELSE verified_by
        END
    WHERE id = p_document_id;

    /* =========================================================
       STRUCTURED CHAUFFEUR COMPLIANCE UPDATE

       A successfully verified Chauffeurskaart becomes the current
       structured card information used by future eligibility and
       expiry checks.
    ========================================================= */
    IF p_verification_status = 'verified'
    AND v_document_type = 'chauffeur_card' THEN

        UPDATE public.chauffeur_compliance
        SET
            chauffeur_card_number = v_card_number,
            chauffeur_card_valid_until = p_chauffeur_card_valid_until,
            chauffeur_card_checked_at = now()
        WHERE chauffeur_id = p_chauffeur_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Chauffeur compliance record was not found.'
            USING ERRCODE = 'P0002';
        END IF;
    END IF;

    /* =========================================================
       SUPERSEDE PREVIOUS VERIFIED DOCUMENT

       Only one document of the same type remains current.
       Older verified versions stay stored as compliance history.
    ========================================================= */
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

   Browser roles cannot execute this RPC directly.
   Voya Taxi calls it only through the protected Admin API route.
============================================================ */

REVOKE ALL
ON FUNCTION public.review_chauffeur_document(
    UUID,
    UUID,
    public.chauffeur_document_verification_status,
    TEXT,
    UUID,
    TEXT,
    DATE
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.review_chauffeur_document(
    UUID,
    UUID,
    public.chauffeur_document_verification_status,
    TEXT,
    UUID,
    TEXT,
    DATE
)
TO service_role;