/* ============================================================
   SET DEFAULT VEHICLE

   Marks one vehicle as the chauffeur's default vehicle.

   Safety:
   - Confirms that the selected vehicle exists.
   - Only an operationally available vehicle can be selected.
   - Locks the chauffeur row so two simultaneous requests for
     the same chauffeur cannot create a race condition.
   - Removes the previous default before setting the new one.
   - The partial unique index remains the final protection.
   
   serializes default-vehicle changes for the same chauffeur:
   - The first request locks the chauffeur.
   - It removes the old default and sets the new one.
   - The second request waits.
   - After the first finishes, the second safely performs its complete change.
============================================================ */

CREATE OR REPLACE FUNCTION public.set_default_vehicle(
    p_vehicle_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    -- Stores the chauffeur who owns the selected vehicle.
    v_chauffeur_id UUID;

    -- Stores the current operational status of the vehicle.
    v_vehicle_status public.vehicle_operational_status;
BEGIN
    /* Load the selected vehicle. */
    SELECT
        vehicle.chauffeur_id,
        vehicle.vehicle_status
    INTO
        v_chauffeur_id,
        v_vehicle_status
    FROM public.vehicles AS vehicle
    WHERE vehicle.id = p_vehicle_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The selected vehicle could not be found.';
    END IF;

    /* An unavailable vehicle cannot become the default vehicle. */
    IF v_vehicle_status <> 'available' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0001',
                MESSAGE = 'Only an available vehicle can be set as the default vehicle.';
    END IF;

    /*
      Lock this chauffeur during the change.

      Two different vehicle rows belonging to the same chauffeur
      could otherwise be changed at almost the same moment.
    */
    PERFORM 1
    FROM public.chauffeurs AS chauffeur
    WHERE chauffeur.id = v_chauffeur_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The chauffeur connected to this vehicle could not be found.';
    END IF;

    /* Remove the previous default vehicle for this chauffeur. */
    UPDATE public.vehicles
    SET is_default_vehicle = FALSE
    WHERE chauffeur_id = v_chauffeur_id
      AND id <> p_vehicle_id
      AND is_default_vehicle = TRUE;

    /* Set the selected vehicle as the new default. */
    UPDATE public.vehicles
    SET is_default_vehicle = TRUE
    WHERE id = p_vehicle_id
      AND chauffeur_id = v_chauffeur_id;

    RETURN TRUE;
END;
$$;

/*
  Only the server-side Supabase service-role client should call
  this administrative function.
*/
REVOKE ALL
ON FUNCTION public.set_default_vehicle(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.set_default_vehicle(UUID)
TO service_role;

/* ============================================================
   ENSURE SINGLE VEHICLE DEFAULT

   Automatically marks a chauffeur's only vehicle as default,
   but only when that vehicle is operationally available.

   Rules:
   - No vehicles: no action.
   - One available vehicle: make it default.
   - One unavailable vehicle: remove its default status.
   - Multiple vehicles: do not choose automatically.
============================================================ */

CREATE OR REPLACE FUNCTION public.ensure_single_vehicle_default(
    p_chauffeur_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_vehicle_count INTEGER;
    v_only_vehicle_id UUID;
    v_only_vehicle_status public.vehicle_operational_status;
BEGIN
    /*
     * Locks this chauffeur while the default-vehicle rule is
     * evaluated and applied.
     */
    PERFORM 1
    FROM public.chauffeurs AS chauffeur
    WHERE chauffeur.id = p_chauffeur_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The selected chauffeur could not be found.';
    END IF;

    /* Counts every vehicle belonging to the chauffeur. */
    SELECT COUNT(*)
    INTO v_vehicle_count
    FROM public.vehicles AS vehicle
    WHERE vehicle.chauffeur_id = p_chauffeur_id;

    /*
     * With zero or multiple vehicles, the system does not choose
     * a default automatically.
     */
    IF v_vehicle_count <> 1 THEN
        RETURN FALSE;
    END IF;

    /* Loads the chauffeur's only vehicle. */
    SELECT
        vehicle.id,
        vehicle.vehicle_status
    INTO
        v_only_vehicle_id,
        v_only_vehicle_status
    FROM public.vehicles AS vehicle
    WHERE vehicle.chauffeur_id = p_chauffeur_id
    LIMIT 1;

    /*
     * The only vehicle becomes default only when it is available.
     * Otherwise, its default status is removed.
     */
    UPDATE public.vehicles
    SET is_default_vehicle =
        (v_only_vehicle_status = 'available')
    WHERE id = v_only_vehicle_id;

    RETURN v_only_vehicle_status = 'available';
END;
$$;

/*
 * Only trusted server-side code may call this administrative
 * database function.
 */
REVOKE ALL
ON FUNCTION public.ensure_single_vehicle_default(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.ensure_single_vehicle_default(UUID)
TO service_role;