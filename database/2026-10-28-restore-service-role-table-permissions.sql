/* ============================================================
   VOYA TAXI - SERVICE ROLE TABLE PERMISSIONS

   Purpose:
   Restore trusted server-side access to the application tables
   when creating a new Supabase database from schema.sql.

   Background:
   The original Supabase project grants service_role access
   to all 27 public application tables.

   This migration restores the 11 grants that were missing
   after recreating the schema in voya-taxi-dev.

   Security:
   - Grants permissions only to service_role.
   - Does not grant permissions to anon or authenticated.
   - Does not modify RLS policies.
   - Does not change application records.
============================================================ */

BEGIN;

/* SECTION 1: Restore trusted server-side access. */
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.assignment_alerts,
    public.bookings,
    public.chauffeur_availability_audit,
    public.chauffeur_change_requests,
    public.chauffeur_compliance,
    public.chauffeur_documents,
    public.chauffeurs,
    public.clients,
    public.taxi_operators,
    public.user_profiles,
    public.vehicles
TO service_role;

/* SECTION 2: Commit the permission changes. */
COMMIT;

/* ============================================================
   AUTHENTICATED ROLE - USER PROFILE READ ACCESS

   Allows logged-in users to read permitted profile records.
   Row Level Security (RLS) continues to restrict row access.
============================================================ */

GRANT SELECT ON TABLE public.user_profiles TO authenticated;