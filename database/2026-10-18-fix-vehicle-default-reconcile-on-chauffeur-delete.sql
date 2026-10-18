/* ============================================================
   FIX VEHICLE DEFAULT RECONCILIATION DURING CHAUFFEUR DELETE

   When a chauffeur is deleted, their vehicles are removed through
   ON DELETE CASCADE.

   The vehicle DELETE trigger must not try to reconcile the default
   vehicle for a chauffeur that is itself being deleted.
============================================================ */

CREATE OR REPLACE FUNCTION public.reconcile_vehicle_defaults_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    /* After creating a vehicle, check the chauffeur's default-vehicle state. */
    IF TG_OP = 'INSERT' THEN
        PERFORM public.ensure_single_vehicle_default(
            NEW.chauffeur_id
        );

        RETURN NEW;
    END IF;

    /* After deleting a vehicle, recheck the previous chauffeur only
    when that chauffeur still exists.

    During chauffeur deletion, vehicles are removed by CASCADE and
    the chauffeur row itself is no longer available for reconciliation. */
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1
            FROM public.chauffeurs
            WHERE id = OLD.chauffeur_id
        ) THEN
            PERFORM public.ensure_single_vehicle_default(
                OLD.chauffeur_id
            );
        END IF;

        RETURN OLD;
    END IF;

    /* When ownership changes, recheck both chauffeurs in a stable
       UUID order to reduce concurrent-transfer deadlock risk. */
    IF OLD.chauffeur_id IS DISTINCT FROM NEW.chauffeur_id THEN
        IF OLD.chauffeur_id::TEXT < NEW.chauffeur_id::TEXT THEN
            PERFORM public.ensure_single_vehicle_default(
                OLD.chauffeur_id
            );

            PERFORM public.ensure_single_vehicle_default(
                NEW.chauffeur_id
            );
        ELSE
            PERFORM public.ensure_single_vehicle_default(
                NEW.chauffeur_id
            );

            PERFORM public.ensure_single_vehicle_default(
                OLD.chauffeur_id
            );
        END IF;

        RETURN NEW;
    END IF;

    /* When operational status changes, recheck the same chauffeur. */
    IF OLD.vehicle_status IS DISTINCT FROM NEW.vehicle_status THEN
        PERFORM public.ensure_single_vehicle_default(
            NEW.chauffeur_id
        );
    END IF;

    RETURN NEW;
END;
$$;
