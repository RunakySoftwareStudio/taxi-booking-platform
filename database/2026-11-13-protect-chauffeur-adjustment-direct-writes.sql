/* ============================================================
   VOYA TAXI — PROTECT CHAUFFEUR ADJUSTMENT FINANCIAL HISTORY

   Require protected financial RPC functions for changes to
   existing definitions and chauffeur assignments.
============================================================ */

/* Definitions may be created directly, but financial updates
   must use the historical version-management functions. */
REVOKE UPDATE
ON TABLE public.chauffeur_adjustment_definitions
FROM service_role;

/* Assignment creation and updates must use protected RPCs
   to preserve financial periods and audit history. */
REVOKE INSERT, UPDATE
ON TABLE public.chauffeur_adjustment_assignments
FROM service_role;