/* ============================================================
   CHAUFFEUR COMPLIANCE MONITORING

   Provides a live, read-only monitoring layer for the two
   chauffeur documents currently required by Voya Taxi V1:

   - Driving licence
   - Chauffeurskaart

   The view derives its state from the Admin-verified structured
   compliance data. It does not expose sensitive document numbers,
   BSN, identity information, or other private compliance fields.

   Warning threshold:
   - expires_soon = 30 days or less from CURRENT_DATE

   This monitoring view does not replace booking eligibility.
   is_chauffeur_compliance_eligible(...) remains the enforcement
   layer used when a chauffeur is assigned to a booking.
============================================================ */

CREATE OR REPLACE VIEW public.chauffeur_compliance_monitoring
WITH (security_invoker = true)
AS
SELECT
    chauffeur.id AS chauffeur_id,
    chauffeur.name AS chauffeur_name,

    /* Existing chauffeur state is useful when Admin investigates an alert. */
    chauffeur.account_status,
    chauffeur.operational_status,

    /* NULL also tells Admin that the compliance record itself is missing. */
    compliance.verification_status,

    /* ========================================================
       DRIVING LICENCE EXPIRY
    ======================================================== */

    compliance.driving_license_valid_until,

    CASE
        WHEN compliance.driving_license_valid_until IS NULL THEN NULL
        ELSE compliance.driving_license_valid_until - CURRENT_DATE
    END AS driving_license_days_remaining,

    CASE
        WHEN compliance.driving_license_valid_until IS NULL
            THEN 'missing'
        WHEN compliance.driving_license_valid_until < CURRENT_DATE
            THEN 'expired'
        WHEN compliance.driving_license_valid_until <= CURRENT_DATE + 30
            THEN 'expires_soon'
        ELSE 'valid'
    END AS driving_license_monitoring_status,

    /* ========================================================
       CHAUFFEURSKAART EXPIRY
    ======================================================== */

    compliance.chauffeur_card_valid_until,

    CASE
        WHEN compliance.chauffeur_card_valid_until IS NULL THEN NULL
        ELSE compliance.chauffeur_card_valid_until - CURRENT_DATE
    END AS chauffeur_card_days_remaining,

    CASE
        WHEN compliance.chauffeur_card_valid_until IS NULL
            THEN 'missing'
        WHEN compliance.chauffeur_card_valid_until < CURRENT_DATE
            THEN 'expired'
        WHEN compliance.chauffeur_card_valid_until <= CURRENT_DATE + 30
            THEN 'expires_soon'
        ELSE 'valid'
    END AS chauffeur_card_monitoring_status,

    /* ========================================================
       NEXT REQUIRED DOCUMENT EXPIRY
    ======================================================== */

    CASE
        WHEN compliance.driving_license_valid_until IS NULL
         AND compliance.chauffeur_card_valid_until IS NULL
            THEN NULL

        WHEN compliance.driving_license_valid_until IS NULL
            THEN compliance.chauffeur_card_valid_until

        WHEN compliance.chauffeur_card_valid_until IS NULL
            THEN compliance.driving_license_valid_until

        ELSE LEAST(
            compliance.driving_license_valid_until,
            compliance.chauffeur_card_valid_until
        )
    END AS next_expiry_date,

    CASE
        WHEN compliance.driving_license_valid_until IS NULL
         AND compliance.chauffeur_card_valid_until IS NULL
            THEN NULL

        WHEN compliance.driving_license_valid_until IS NULL
            THEN compliance.chauffeur_card_valid_until - CURRENT_DATE

        WHEN compliance.chauffeur_card_valid_until IS NULL
            THEN compliance.driving_license_valid_until - CURRENT_DATE

        ELSE LEAST(
            compliance.driving_license_valid_until,
            compliance.chauffeur_card_valid_until
        ) - CURRENT_DATE
    END AS days_until_next_expiry,

    /* ========================================================
       REQUIRED DOCUMENTS WAITING FOR ADMIN REVIEW

       This does not change compliance eligibility. It simply
       helps Admin see that a new required document is waiting.
    ======================================================== */

    (
        SELECT COUNT(*)::INTEGER
        FROM public.chauffeur_documents AS document
        WHERE document.chauffeur_id = chauffeur.id
          AND document.document_type IN (
              'driving_license',
              'chauffeur_card'
          )
          AND document.verification_status = 'pending_review'
    ) AS required_documents_pending_review_count,

    /* ========================================================
       OVERALL MONITORING STATUS

       critical:
       - compliance record missing;
       - whole-chauffeur compliance is not verified;
       - Driving licence missing or expired;
       - Chauffeurskaart missing or expired.

       warning:
       - chauffeur is verified and required documents are valid,
         but at least one expires within 30 days.

       ok:
       - chauffeur is verified and both required documents remain
         valid for more than 30 days.
    ======================================================== */

    CASE
        WHEN compliance.chauffeur_id IS NULL
            THEN 'critical'

        WHEN compliance.verification_status <> 'verified'
            THEN 'critical'

        WHEN compliance.driving_license_valid_until IS NULL
          OR compliance.chauffeur_card_valid_until IS NULL
            THEN 'critical'

        WHEN compliance.driving_license_valid_until < CURRENT_DATE
          OR compliance.chauffeur_card_valid_until < CURRENT_DATE
            THEN 'critical'

        WHEN compliance.driving_license_valid_until <= CURRENT_DATE + 30
          OR compliance.chauffeur_card_valid_until <= CURRENT_DATE + 30
            THEN 'warning'

        ELSE 'ok'
    END AS monitoring_status

FROM public.chauffeurs AS chauffeur

LEFT JOIN public.chauffeur_compliance AS compliance
    ON compliance.chauffeur_id = chauffeur.id;


/* ============================================================
   VIEW SECURITY

   The monitoring view is intended for trusted server-side/Admin
   use. Browser roles must not query it directly.
============================================================ */

REVOKE ALL
ON public.chauffeur_compliance_monitoring
FROM PUBLIC, anon, authenticated;

GRANT SELECT
ON public.chauffeur_compliance_monitoring
TO service_role;
/*===========================================================================================
-- End CHAUFFEUR COMPLIANCE MONITORING
===========================================================================================*/