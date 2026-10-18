/* ============================================================
   ADD ADDRESS TO CHAUFFEUR CHANGE REQUESTS

   Address becomes a protected chauffeur profile field that can
   be changed only after administrator review.

   Legacy company_name and license_number values remain allowed
   in the database so historical change requests stay valid.
   New requests are restricted by the application to:
   name, email and address.
============================================================ */

ALTER TABLE public.chauffeur_change_requests
DROP CONSTRAINT IF EXISTS chauffeur_change_requests_field_name_check;

ALTER TABLE public.chauffeur_change_requests
ADD CONSTRAINT chauffeur_change_requests_field_name_check
CHECK (
    field_name IN (
        'name',
        'email',
        'address',
        'company_name',
        'license_number'
    )
);
