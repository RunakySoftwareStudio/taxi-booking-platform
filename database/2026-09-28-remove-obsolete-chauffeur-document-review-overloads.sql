/* ============================================================
   REMOVE OBSOLETE CHAUFFEUR DOCUMENT REVIEW OVERLOADS

   The Admin application now uses only the current 9-parameter
   review_chauffeur_document(...) RPC.

   These older overloads are no longer used and do not participate
   in the current shared chauffeur_compliance locking design.

   Removing them reduces maintenance risk and prevents old service-
   role code from accidentally calling an outdated review workflow.

   The current 9-parameter overload is intentionally preserved.
============================================================ */


/* ============================================================
   REMOVE 5-PARAMETER OVERLOAD
============================================================ */

DROP FUNCTION IF EXISTS public.review_chauffeur_document(
    UUID,
    UUID,
    public.chauffeur_document_verification_status,
    TEXT,
    UUID
);


/* ============================================================
   REMOVE 7-PARAMETER OVERLOAD
============================================================ */

DROP FUNCTION IF EXISTS public.review_chauffeur_document(
    UUID,
    UUID,
    public.chauffeur_document_verification_status,
    TEXT,
    UUID,
    TEXT,
    DATE
);


/* ============================================================
   REMOVE 8-PARAMETER OVERLOAD
============================================================ */

DROP FUNCTION IF EXISTS public.review_chauffeur_document(
    UUID,
    UUID,
    public.chauffeur_document_verification_status,
    TEXT,
    UUID,
    TEXT,
    DATE,
    DATE
);