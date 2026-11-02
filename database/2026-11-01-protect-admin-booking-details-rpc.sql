/* ============================================================
   VOYA TAXI — PROTECT ADMIN BOOKING DETAILS RPC

   Purpose:
   Restrict Admin booking updates to server-side operations.

   Applied manually to Supabase on 2026-11-01.
============================================================ */

REVOKE ALL ON FUNCTION public.update_booking_admin_details(
    uuid, text, text, text, text, text,
    date, time without time zone,
    integer, integer, public.trip_type, text, boolean,
    integer, integer, integer, boolean,
    public.wheelchair_requirement_type, integer,
    boolean, boolean,
    uuid, uuid, public.booking_status
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_booking_admin_details(
    uuid, text, text, text, text, text,
    date, time without time zone,
    integer, integer, public.trip_type, text, boolean,
    integer, integer, integer, boolean,
    public.wheelchair_requirement_type, integer,
    boolean, boolean,
    uuid, uuid, public.booking_status
) TO service_role;