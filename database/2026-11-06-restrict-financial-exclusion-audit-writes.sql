/* ============================================================
   VOYA TAXI — FINANCIAL EXCLUSION AUDIT PROTECTION

   Purpose:
   Restrict service_role to reading and inserting audit
   records. Historical audit records must not be modified
   or deleted through normal application operations.

   The PostgreSQL table owner retains administrative control.
============================================================ */

/* Remove privileges unnecessary for append-only audit history. */
REVOKE UPDATE, DELETE, TRUNCATE
ON TABLE public.booking_financial_exclusion_audit
FROM service_role;

/* Preserve the privileges required by the protected RPC. */
GRANT SELECT, INSERT
ON TABLE public.booking_financial_exclusion_audit
TO service_role;