/* ============================================================
   VOYA TAXI — BOOKING FINANCIAL EXCLUSION PROTECTION

   Purpose:
   Prevent changes to financial exclusion settings once
   a booking has a frozen chauffeur commission.

   Preserve the existing Admin RPC and financial audit workflow.
============================================================ */

BEGIN;

/* SECTION 1: Protect financial exclusion fields. */
CREATE OR REPLACE FUNCTION public.protect_booking_financial_exclusion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    /*
        Allow unrelated booking updates and unchanged
        financial exclusion values.
    */
    IF NEW.is_financially_excluded IS NOT DISTINCT FROM OLD.is_financially_excluded
       AND NEW.financial_exclusion_reason IS NOT DISTINCT FROM OLD.financial_exclusion_reason
    THEN
        RETURN NEW;
    END IF;

    /*
        Reject financial exclusion changes when the booking
        already has a frozen chauffeur commission.
    */
    IF EXISTS (
        SELECT 1
        FROM public.chauffeur_booking_commissions
        WHERE booking_id = OLD.id
    ) THEN
        RAISE EXCEPTION
            'Financial exclusion cannot be changed after commission creation.'
            USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$function$;

/* SECTION 2: Register the booking protection trigger. */
CREATE TRIGGER protect_booking_financial_exclusion
BEFORE UPDATE OF is_financially_excluded, financial_exclusion_reason
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.protect_booking_financial_exclusion();

/* SECTION 3: Restrict direct execution of the trigger function. */
REVOKE ALL ON FUNCTION public.protect_booking_financial_exclusion()
FROM PUBLIC, anon, authenticated, service_role;

/* SECTION 4: Document the protection. */
COMMENT ON FUNCTION public.protect_booking_financial_exclusion() IS
'Prevents changes to booking financial exclusion settings after a frozen chauffeur commission exists.';

COMMIT;