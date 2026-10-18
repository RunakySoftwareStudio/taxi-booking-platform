/* ============================================================
   ENFORCE CHAUFFEUR APPROVAL COMPLIANCE

   A chauffeur may enter the approved account state only when
   the required compliance record and documents are verified
   and currently valid.

   Existing approved chauffeurs are not blocked from ordinary
   profile edits because the rule only checks a transition INTO
   the approved state.
============================================================ */

CREATE OR REPLACE FUNCTION public.enforce_chauffeur_approval_compliance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    /* A newly inserted chauffeur can never already be approved.
       Compliance documents can only exist after the chauffeur exists. */
    IF TG_OP = 'INSERT' AND NEW.account_status = 'approved' THEN
        RAISE EXCEPTION
            'Chauffeur cannot be approved before compliance verification is complete.'
        USING ERRCODE = '23514';
    END IF;

    /* Only check when an existing chauffeur transitions INTO approved.
       Keeping an already-approved status during an unrelated edit does
       not trigger another compliance approval check. */
    IF TG_OP = 'UPDATE'
       AND NEW.account_status = 'approved'
       AND OLD.account_status IS DISTINCT FROM 'approved'
       AND NOT public.is_chauffeur_compliance_eligible(NEW.id, CURRENT_DATE)
    THEN
        RAISE EXCEPTION
            'Chauffeur cannot be approved because required compliance documents are missing, unverified, or expired.'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;


/* Apply the approval rule whenever a chauffeur is created or
   the account status is changed. */
DROP TRIGGER IF EXISTS enforce_chauffeur_approval_compliance
ON public.chauffeurs;

CREATE TRIGGER enforce_chauffeur_approval_compliance
BEFORE INSERT OR UPDATE OF account_status
ON public.chauffeurs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_chauffeur_approval_compliance();
