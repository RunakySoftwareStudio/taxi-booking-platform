
/* ============================================================
   CONNECT CHAUFFEURS TO TAXI OPERATORS

   Purpose:
   Adds the taxi operator relationship to chauffeurs.

   operator_id is intentionally nullable during this migration
   so existing chauffeur records can be connected safely before
   the relationship becomes mandatory.
============================================================ */

ALTER TABLE public.chauffeurs
ADD COLUMN operator_id UUID;


/* ============================================================
   FOREIGN KEY

   A chauffeur may reference only an existing taxi operator.

   No ON DELETE CASCADE is used because deleting an operator
   must never automatically delete its chauffeurs.
============================================================ */

ALTER TABLE public.chauffeurs
ADD CONSTRAINT chauffeurs_operator_id_fkey
FOREIGN KEY (operator_id)
REFERENCES public.taxi_operators(id);


/* ============================================================
   INDEX

   Improves queries such as:
   - find all chauffeurs belonging to one operator;
   - join taxi_operators to chauffeurs.
============================================================ */

CREATE INDEX chauffeurs_operator_id_idx
ON public.chauffeurs(operator_id);