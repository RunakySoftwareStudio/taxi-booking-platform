    /* ============================================================
    VOYA TAXI — BOOKING FINANCIAL EXCLUSION RPC

    Purpose:
    Allow trusted Admin API operations to update financial
    exclusion settings and record an audit entry atomically.

    Business rules:
    - Exclusion requires a meaningful reason.
    - Removing exclusion clears the stored reason.
    - Completed bookings remain operationally unchanged.
    - Unchanged values do not create duplicate audit entries.
    - Existing commission records must be protected.
    ============================================================ */

    CREATE OR REPLACE FUNCTION public.update_booking_financial_exclusion(
        p_booking_id UUID,
        p_is_financially_excluded BOOLEAN,
        p_financial_exclusion_reason TEXT,
        p_changed_by_user_id UUID
    )
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $function$
    DECLARE
        v_previous_excluded BOOLEAN;
        v_previous_reason TEXT;
        v_new_reason TEXT;
        v_action TEXT;
        v_commission_exists BOOLEAN;
    BEGIN
        /* SECTION 1: Validate input and administrator identity. */
        IF p_booking_id IS NULL
        OR p_is_financially_excluded IS NULL
        OR p_changed_by_user_id IS NULL THEN
            RAISE EXCEPTION 'Invalid financial exclusion request.'
            USING ERRCODE = '22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.user_profiles
            WHERE user_id = p_changed_by_user_id
            AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Administrator identity is invalid.'
            USING ERRCODE = '22023';
        END IF;

        /* SECTION 2: Validate and normalize the exclusion reason. */
        v_new_reason := NULLIF(BTRIM(p_financial_exclusion_reason), '');

        IF p_is_financially_excluded AND v_new_reason IS NULL THEN
            RAISE EXCEPTION 'Financial exclusion requires a reason.'
            USING ERRCODE = '22023';
        END IF;

        IF NOT p_is_financially_excluded THEN
            v_new_reason := NULL;
        END IF;

        /* SECTION 3: Lock the booking against concurrent updates. */
        SELECT is_financially_excluded, financial_exclusion_reason
        INTO v_previous_excluded, v_previous_reason
        FROM public.bookings
        WHERE id = p_booking_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Booking was not found.'
            USING ERRCODE = 'P0002';
        END IF;

        /* SECTION 4: Skip unchanged values without writing an audit. */
        IF v_previous_excluded = p_is_financially_excluded
        AND v_previous_reason IS NOT DISTINCT FROM v_new_reason THEN
            RETURN FALSE;
        END IF;

        /* SECTION 5: Protect bookings with existing commissions.

        The commission table will be introduced later.
        Once it exists, financial exclusion changes are
        blocked for bookings with commission records.
        */
        IF TO_REGCLASS('public.chauffeur_booking_commissions') IS NOT NULL THEN
            EXECUTE
                'SELECT EXISTS (
                    SELECT 1
                    FROM public.chauffeur_booking_commissions
                    WHERE booking_id = $1
                )'
            INTO v_commission_exists
            USING p_booking_id;

            IF v_commission_exists THEN
                RAISE EXCEPTION
                    'Financial exclusion cannot be changed after commission creation.'
                USING ERRCODE = '22023';
            END IF;
        END IF;

        /* SECTION 6: Determine the financial audit action. */
        v_action := CASE
            WHEN NOT v_previous_excluded AND p_is_financially_excluded
                THEN 'excluded'
            WHEN v_previous_excluded AND NOT p_is_financially_excluded
                THEN 'included'
            ELSE 'reason_updated'
        END;

        /* SECTION 7: Update financial fields only. */
        UPDATE public.bookings
        SET
            is_financially_excluded = p_is_financially_excluded,
            financial_exclusion_reason = v_new_reason
        WHERE id = p_booking_id;

        /* SECTION 8: Record the change within the same transaction. */
        INSERT INTO public.booking_financial_exclusion_audit (
            booking_id,
            action,
            changed_by_user_id,
            reason,
            old_values,
            new_values
        )
        VALUES (
            p_booking_id,
            v_action,
            p_changed_by_user_id,
            CASE
                WHEN v_action = 'included'
                    THEN 'Financial exclusion removed by administrator.'
                ELSE v_new_reason
            END,
            JSONB_BUILD_OBJECT(
                'is_financially_excluded', v_previous_excluded,
                'financial_exclusion_reason', v_previous_reason
            ),
            JSONB_BUILD_OBJECT(
                'is_financially_excluded', p_is_financially_excluded,
                'financial_exclusion_reason', v_new_reason
            )
        );

        RETURN TRUE;
    END;
    $function$;

    /* Restrict execution to trusted server-side operations. */
    REVOKE ALL ON FUNCTION public.update_booking_financial_exclusion(
        UUID, BOOLEAN, TEXT, UUID
    ) FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE ON FUNCTION public.update_booking_financial_exclusion(
        UUID, BOOLEAN, TEXT, UUID
    ) TO service_role;
    /* ===========================================================
        END update_booking_financial_exclusion
    =============================================================*/