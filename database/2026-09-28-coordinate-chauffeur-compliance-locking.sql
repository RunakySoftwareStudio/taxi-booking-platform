/* ============================================================
   COORDINATE CHAUFFEUR COMPLIANCE LOCKING

   Purpose:
   Uses the chauffeur_compliance row as the shared coordination
   lock for booking eligibility and compliance changes.

   This prevents a booking assignment from checking an old
   compliance state while Admin is changing that same chauffeur's
   compliance information.

    Admin authorization
            ↓
    lock chauffeur_compliance
            ↓
    lock selected chauffeur_document
            ↓
    validate document
            ↓
    update document
            ↓
    update compliance metadata
            ↓
    supersede previous verified document

============================================================ */


/* ============================================================
   CHAUFFEUR COMPLIANCE ELIGIBILITY

   Lock the chauffeur's compliance row before checking the
   whole-chauffeur status and required verified documents.

   Document-review operations will use the same compliance row
   lock, so document changes and booking eligibility checks
   cannot run past each other for the same chauffeur.
============================================================ */

CREATE OR REPLACE FUNCTION public.is_chauffeur_compliance_eligible(
    p_chauffeur_id UUID,
    p_pickup_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    /* Missing input can never produce an eligible chauffeur. */
    IF p_chauffeur_id IS NULL OR p_pickup_date IS NULL THEN
        RETURN FALSE;
    END IF;

    /* ========================================================
       SHARED COMPLIANCE LOCK

       Every operation that changes or relies on chauffeur
       compliance coordinates through this row.

       FOR UPDATE keeps the row locked until the surrounding
       transaction finishes.
    ======================================================== */
    PERFORM 1
    FROM public.chauffeur_compliance
    WHERE chauffeur_id = p_chauffeur_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    /* ========================================================
       ELIGIBILITY CHECK

       Required:
       - whole-chauffeur status is verified;
       - verified Driving licence is valid today and pickup date;
       - verified Chauffeurskaart is valid today and pickup date.
    ======================================================== */
    RETURN EXISTS (
        SELECT 1
        FROM public.chauffeur_compliance AS cc
        WHERE cc.chauffeur_id = p_chauffeur_id
          AND cc.verification_status = 'verified'

          AND EXISTS (
              SELECT 1
              FROM public.chauffeur_documents AS d
              WHERE d.chauffeur_id = cc.chauffeur_id
                AND d.document_type = 'driving_license'
                AND d.verification_status = 'verified'
                AND d.valid_until >= CURRENT_DATE
                AND d.valid_until >= p_pickup_date
          )

          AND EXISTS (
              SELECT 1
              FROM public.chauffeur_documents AS d
              WHERE d.chauffeur_id = cc.chauffeur_id
                AND d.document_type = 'chauffeur_card'
                AND d.verification_status = 'verified'
                AND d.valid_until >= CURRENT_DATE
                AND d.valid_until >= p_pickup_date
          )
    );
END;
$$;


/* ============================================================
   FUNCTION SECURITY

   Preserve the existing access model:
   ordinary browser roles cannot execute this helper directly.
============================================================ */

REVOKE ALL
ON FUNCTION public.is_chauffeur_compliance_eligible(UUID, DATE)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.is_chauffeur_compliance_eligible(UUID, DATE)
TO service_role;

/* =================================================================================================
    End CHAUFFEUR COMPLIANCE ELIGIBILITY
 ===================================================================================================*/

/* =================================================================================================
   REVIEW CHAUFFEUR DOCUMENT - DRIVING LICENCE NUMBER AND VALIDITY

   Nine-parameter RPC used by the current Admin document-review workflow.

   Extends Driving licence verification with:
   - Driving licence number
   - Driving licence valid-until date
   - Driving licence checked-at timestamp

   The verified document and structured chauffeur_compliance data
   are updated together inside one PostgreSQL transaction.

   Older overloads are temporarily retained for compatibility.
================================================================================================= */
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
    SHARED COMPLIANCE LOCK

    Lock the chauffeur's compliance row before locking or
    changing any document used by booking eligibility.

    Booking eligibility and whole-chauffeur verification use
    this same row as their coordination lock.
    ========================================================= */

    PERFORM 1
    FROM public.chauffeur_compliance
    WHERE chauffeur_id = p_chauffeur_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Chauffeur compliance record was not found.'
        USING ERRCODE = 'P0002';
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
/* =================================================================================================
     End REVIEW CHAUFFEUR DOCUMENT - DRIVING LICENCE NUMBER AND VALIDITY
 =================================================================================================*/