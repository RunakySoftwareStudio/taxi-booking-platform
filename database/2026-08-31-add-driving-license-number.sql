/* ============================================================
   ADD DRIVING LICENCE NUMBER TO CHAUFFEUR COMPLIANCE

   Stores the licence number belonging to the currently verified
   Driving licence.

   This field belongs to the compliance model and is kept separate
   from the older chauffeurs.license_number field.

   The value is nullable until Admin verifies a Driving licence.
   UNIQUE prevents the same licence number being assigned to two
   different chauffeurs.
============================================================ */

ALTER TABLE public.chauffeur_compliance
ADD COLUMN driving_license_number TEXT UNIQUE
CHECK (
    driving_license_number IS NULL OR
    length(trim(driving_license_number)) > 0
);
/* ============================================================
   CHAUFFEUR DOCUMENT REVIEW WITH DRIVING LICENCE DETAILS

   Extends the existing document-review workflow so that Admin
   can also store structured Driving licence validity data.

   Chauffeurskaart verification:
   - requires card number;
   - requires valid-until date;
   - blocks expired cards.

   Driving licence verification:
   - requires valid-until date;
   - blocks expired licences.

   Successful verification updates both:
   - chauffeur_documents: document status and validity history;
   - chauffeur_compliance: current structured compliance values.

   All changes happen in one PostgreSQL transaction.
   Older RPC overloads are temporarily kept for compatibility.
============================================================ */

CREATE OR REPLACE FUNCTION public.review_chauffeur_document(
    p_chauffeur_id UUID,
    p_document_id UUID,
    p_verification_status public.chauffeur_document_verification_status,
    p_status_reason TEXT,
    p_changed_by_user_id UUID,
    p_chauffeur_card_number TEXT,
    p_chauffeur_card_valid_until DATE,
    p_driving_license_number TEXT,
    p_driving_license_valid_until DATE
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
    v_driving_license_number TEXT;
BEGIN
    /* =========================================================
       ADMIN AUTHORIZATION

       Only an administrator may review chauffeur documents.
       The function itself is executable only through service_role.
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

       Loads the selected document and locks it while this review
       transaction is running.
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

       Only pending documents can receive a final Admin decision.
    ========================================================= */
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

       Admin must record both the card number and valid-until date.
       An already expired card cannot be verified.
    ========================================================= */
    IF p_verification_status = 'verified'
    AND v_document_type = 'chauffeur_card' THEN

        v_card_number := NULLIF(
            trim(COALESCE(p_chauffeur_card_number, '')),
            ''
        );

        IF v_card_number IS NULL THEN
            RAISE EXCEPTION 'Chauffeurskaart number is required before verification.'
            USING ERRCODE = '22023';
        END IF;

        IF p_chauffeur_card_valid_until IS NULL THEN
            RAISE EXCEPTION 'Chauffeurskaart valid-until date is required before verification.'
            USING ERRCODE = '22023';
        END IF;

        IF p_chauffeur_card_valid_until < CURRENT_DATE THEN
            RAISE EXCEPTION 'An expired Chauffeurskaart cannot be verified.'
            USING ERRCODE = '22023';
        END IF;
    END IF;

    /* =========================================================
       DRIVING LICENCE VALIDATION

       Admin must record the Driving licence expiry date.
       An already expired licence cannot be verified.
    ========================================================= */
    IF p_verification_status = 'verified'
    AND v_document_type = 'driving_license' THEN

        /* Cleans the entered licence number and converts an empty value to NULL. */
        v_driving_license_number :=
            NULLIF(trim(COALESCE(p_driving_license_number, '')), '');

        IF v_driving_license_number IS NULL THEN
            RAISE EXCEPTION 'Driving licence number is required before verification.'
            USING ERRCODE = '22023';
        END IF;

        IF p_driving_license_valid_until IS NULL THEN
            RAISE EXCEPTION 'Driving licence valid-until date is required before verification.'
            USING ERRCODE = '22023';
        END IF;

        IF p_driving_license_valid_until < CURRENT_DATE THEN
            RAISE EXCEPTION 'An expired Driving licence cannot be verified.'
            USING ERRCODE = '22023';
        END IF;
    END IF;

    /* =========================================================
       DOCUMENT REVIEW UPDATE

       Saves the review status and audit information.

       For Chauffeurskaart and Driving licence documents,
       valid_until is also stored on the document itself so its
       historical validity remains attached to that upload.
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

            WHEN p_verification_status = 'verified'
             AND v_document_type = 'driving_license'
                THEN p_driving_license_valid_until

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
       CHAUFFEURSKAART COMPLIANCE UPDATE

       Stores the currently verified Chauffeurskaart information
       used by future expiry and chauffeur-eligibility checks.
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
    DRIVING LICENCE COMPLIANCE UPDATE

    Stores the currently verified Driving licence number and
    expiry date in the chauffeur's structured compliance record.

    driving_license_checked_at records when Admin last checked
    and verified these licence details.
    ========================================================= */
    IF p_verification_status = 'verified'
    AND v_document_type = 'driving_license' THEN

        UPDATE public.chauffeur_compliance
        SET
            driving_license_number = v_driving_license_number,
            driving_license_valid_until = p_driving_license_valid_until,
            driving_license_checked_at = now()
        WHERE chauffeur_id = p_chauffeur_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Chauffeur compliance record was not found.'
            USING ERRCODE = 'P0002';
        END IF;
    END IF;

    /* =========================================================
       SUPERSEDE PREVIOUS VERIFIED DOCUMENT

       Keeps only one current verified document per document type.
       Previous verified versions remain stored as history.
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
   FUNCTION SECURITY SIGNATURE

   Matches the new 9-parameter RPC:
   - Chauffeurskaart number/date
   - Driving licence number/date

   Browser roles cannot call this function directly.
============================================================ */
REVOKE ALL
ON FUNCTION public.review_chauffeur_document(
    UUID,
    UUID,
    public.chauffeur_document_verification_status,
    TEXT,
    UUID,
    TEXT,
    DATE,
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
    DATE,
    TEXT,
    DATE
)
TO service_role;