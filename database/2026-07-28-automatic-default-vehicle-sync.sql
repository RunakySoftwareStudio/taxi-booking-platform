/* ============================================================
   AUTOMATIC DEFAULT-VEHICLE SYNCHRONIZATION

   Keeps default vehicles consistent when a vehicle is:

   - created;
   - moved to another chauffeur;
   - made available or unavailable;
   - deleted.

   The existing ensure_single_vehicle_default(...) function
   performs the actual single-vehicle check.
============================================================ */


/* ------------------------------------------------------------
   BEFORE CHANGE

   Prevents a vehicle from remaining default when:

   - it moves to another chauffeur;
   - it becomes operationally unavailable.
------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.prepare_vehicle_default_before_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    /*
     * An unavailable vehicle may never remain or become the
     * chauffeur's default vehicle.
     */
    IF NEW.vehicle_status <> 'available' THEN
        NEW.is_default_vehicle := FALSE;
    END IF;

    /*
     * A vehicle moved to another chauffeur must not silently
     * become that chauffeur's default vehicle.
     */
    IF TG_OP = 'UPDATE' THEN
        IF OLD.chauffeur_id IS DISTINCT FROM NEW.chauffeur_id THEN
            NEW.is_default_vehicle := FALSE;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    vehicles_prepare_default_before_change
ON public.vehicles;

CREATE TRIGGER vehicles_prepare_default_before_change
BEFORE INSERT OR UPDATE OF
    chauffeur_id,
    vehicle_status,
    is_default_vehicle
ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.prepare_vehicle_default_before_change();


/* ------------------------------------------------------------
   AFTER CHANGE

   Rechecks the affected chauffeur or chauffeurs after the
   vehicle change has been completed.
------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.reconcile_vehicle_defaults_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    /*
     * After creating a vehicle, check whether it is the
     * chauffeur's only available vehicle.
     */
    IF TG_OP = 'INSERT' THEN
        PERFORM public.ensure_single_vehicle_default(
            NEW.chauffeur_id
        );

        RETURN NEW;
    END IF;

    /*
     * After deleting a vehicle, recheck the chauffeur who
     * previously owned it.
     */
    IF TG_OP = 'DELETE' THEN
        PERFORM public.ensure_single_vehicle_default(
            OLD.chauffeur_id
        );

        RETURN OLD;
    END IF;

    /*
     * When ownership changes, both chauffeurs must be checked:
     *
     * - the old chauffeur may now have only one vehicle;
     * - the new chauffeur may now have their first vehicle.
     *
     * UUID order gives both chauffeur locks a consistent order
     * and reduces the risk of concurrent-transfer deadlocks.
     */
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

    /*
     * When the vehicle's operational status changes, recheck
     * the chauffeur's remaining/default vehicle situation.
     */
    IF OLD.vehicle_status IS DISTINCT FROM NEW.vehicle_status THEN
        PERFORM public.ensure_single_vehicle_default(
            NEW.chauffeur_id
        );
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    vehicles_reconcile_defaults_after_change
ON public.vehicles;

CREATE TRIGGER vehicles_reconcile_defaults_after_change
AFTER INSERT OR DELETE OR UPDATE OF
    chauffeur_id,
    vehicle_status
ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_vehicle_defaults_after_change();


/*
 * These trigger functions are internal database functions.
 * They should not be called directly by website users.
 */
REVOKE ALL
ON FUNCTION public.prepare_vehicle_default_before_change()
FROM PUBLIC, anon, authenticated;

REVOKE ALL
ON FUNCTION public.reconcile_vehicle_defaults_after_change()
FROM PUBLIC, anon, authenticated;