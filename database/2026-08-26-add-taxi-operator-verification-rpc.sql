
/* ============================================================
   UPDATE TAXI OPERATOR VERIFICATION STATUS

   Purpose:
   Changes the verification status of one taxi operator and
   records who made the change and when.

   Important:
   This function changes only the taxi operator.
   It does NOT change the account_status of any chauffeur
   belonging to that operator.
============================================================ */

CREATE OR REPLACE FUNCTION public.update_taxi_operator_verification_status(
    p_operator_id UUID,
    p_verification_status public.taxi_operator_verification_status,
    p_status_reason TEXT,
    p_changed_by_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_current_status public.taxi_operator_verification_status;
    v_p_number TEXT;
BEGIN
    /* ===== Validate administrator ===== */
    IF p_changed_by_user_id IS NULL
    OR NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE user_id = p_changed_by_user_id
          AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Only an administrator can change taxi operator verification status.'
        USING ERRCODE = '42501';
    END IF;


    /* ===== Read and lock taxi operator ===== */
    SELECT
        verification_status,
        p_number
    INTO
        v_current_status,
        v_p_number
    FROM public.taxi_operators
    WHERE id = p_operator_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Taxi operator was not found.'
        USING ERRCODE = 'P0002';
    END IF;

    /* ===== Validate requested verification status ===== */
    IF p_verification_status IS NULL THEN
        RAISE EXCEPTION 'Verification status is required.'
        USING ERRCODE = '22023';
    END IF;


    /* ===== Require operator permit before verification ===== */
    IF p_verification_status = 'verified'
    AND NULLIF(trim(COALESCE(v_p_number, '')), '') IS NULL THEN
        RAISE EXCEPTION
            'A taxi operator cannot be verified without a P-number.'
        USING ERRCODE = '22023';
    END IF;

    /* ===== Prevent unnecessary status update ===== */
    IF v_current_status = p_verification_status THEN
        RAISE EXCEPTION 'Taxi operator already has this verification status.'
        USING ERRCODE = '22023';
    END IF;


    /* ===== Update verification status and audit information ===== */
    UPDATE public.taxi_operators
    SET
        verification_status = p_verification_status,
        verification_status_reason =
            NULLIF(trim(COALESCE(p_status_reason, '')), ''),
        verification_status_changed_at = now(),
        verification_status_changed_by = p_changed_by_user_id,

        /* A successful verification receives its own audit record. */
        verified_at = CASE
            WHEN p_verification_status = 'verified' THEN now()
            ELSE verified_at
        END,

        verified_by = CASE
            WHEN p_verification_status = 'verified' THEN p_changed_by_user_id
            ELSE verified_by
        END
    WHERE id = p_operator_id;
END;
$$;


/* ============================================================
   FUNCTION SECURITY

   Normal anonymous/authenticated users cannot call this RPC
   directly. Voya Taxi calls it through controlled server-side
   administrator functionality.
============================================================ */

REVOKE ALL
ON FUNCTION public.update_taxi_operator_verification_status(
    UUID,
    public.taxi_operator_verification_status,
    TEXT,
    UUID
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.update_taxi_operator_verification_status(
    UUID,
    public.taxi_operator_verification_status,
    TEXT,
    UUID
)
TO service_role;