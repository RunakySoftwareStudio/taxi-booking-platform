/* ============================================================
   ADD CHAUFFEUR ADDRESS

   Stores the chauffeur's private residential/postal address as
   one flexible text value so international address formats are
   not restricted to a country-specific structure.
============================================================ */

ALTER TABLE public.chauffeurs
ADD COLUMN address TEXT;
