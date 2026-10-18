/* ============================================================
   RESTRICT CHAUFFEUR CHANGE REQUEST FIELDS

   The generic chauffeur profile-change workflow now supports
   only protected personal account information:
   name, email and address.

   Company and licence information are handled outside this
   generic profile-change workflow.
============================================================ */

ALTER TABLE public.chauffeur_change_requests
DROP CONSTRAINT IF EXISTS chauffeur_change_requests_field_name_check;

ALTER TABLE public.chauffeur_change_requests
ADD CONSTRAINT chauffeur_change_requests_field_name_check
CHECK (
    field_name IN (
        'name',
        'email',
        'address'
    )
);
