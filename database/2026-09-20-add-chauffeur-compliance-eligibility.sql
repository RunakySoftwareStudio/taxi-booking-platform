
/* ============================================================
   CHAUFFEUR COMPLIANCE ELIGIBILITY

   Purpose:
   Checks whether a chauffeur meets the compliance requirements
   for receiving or claiming a booking.

   Required:
   - Overall compliance status is verified.
   - Driving licence is verified and valid.
   - Chauffeurskaart is verified and valid.

   Both documents must be valid today and on the pickup date.

   This function does not modify any chauffeur or booking data.
============================================================ */

CREATE OR REPLACE FUNCTION public.is_chauffeur_compliance_eligible(
    p_chauffeur_id UUID,
    p_pickup_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.chauffeur_compliance AS cc
        WHERE cc.chauffeur_id = p_chauffeur_id
          AND p_pickup_date IS NOT NULL
          AND cc.verification_status = 'verified'

          /* ===== Driving licence eligibility ===== */
          AND EXISTS (
              SELECT 1
              FROM public.chauffeur_documents AS d
              WHERE d.chauffeur_id = cc.chauffeur_id
                AND d.document_type = 'driving_license'
                AND d.verification_status = 'verified'
                AND d.valid_until >= CURRENT_DATE
                AND d.valid_until >= p_pickup_date
          )

          /* ===== Chauffeurskaart eligibility ===== */
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
$$;

/* ============================================================
   FUNCTION SECURITY

   Prevent direct execution through ordinary browser roles.
   The trusted database booking functions will reuse this check.
============================================================ */

REVOKE ALL
ON FUNCTION public.is_chauffeur_compliance_eligible(UUID, DATE)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.is_chauffeur_compliance_eligible(UUID, DATE)
TO service_role;

/* =================================================================================================
     End CHAUFFEUR COMPLIANCE ELIGIBILITY
 =================================================================================================*/