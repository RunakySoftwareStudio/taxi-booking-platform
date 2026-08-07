/* ============================================================
   VOYA TAXI — ACTIVATE PRICING PROFILE DRAFT

   PURPOSE

   Activates one draft pricing version and archives the currently
   active version of the same pricing-profile family.

   Example:

       Version 1 → active
       Version 2 → draft

   Admin activates Version 2:

       Version 1 → archived
       Version 2 → active

   Both changes use exactly the same database timestamp.

   This creates a continuous pricing timeline:

       Version 1 ----------------|
                                 |---------------- Version 2
                         same activation moment

   IMPORTANT

   The draft creation date is NOT the date customers started using
   the new prices.

   Therefore, when the draft becomes active:

       effective_from = actual activation timestamp

   The old active version receives:

       effective_until = same activation timestamp

   This entire operation is atomic. If any part fails, PostgreSQL
   rolls back all changes.
============================================================ */

BEGIN;


/* ============================================================
   ACTIVATE PRICING PROFILE DRAFT FUNCTION

   Parameters:

   p_pricing_profile_id
       UUID of the draft profile that must become active.

   p_activated_by_user_id
       UUID of the authenticated administrator performing
       the activation.

   Returns:

       UUID of the newly activated pricing profile.
============================================================ */

CREATE OR REPLACE FUNCTION public.activate_pricing_profile_draft(
    p_pricing_profile_id UUID,
    p_activated_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* Stores the pricing-profile code before locking the family. */
    v_pricing_profile_code TEXT;

    /* Stores the draft that will become active. */
    v_draft_profile public.pricing_profiles%ROWTYPE;

    /* Stores the currently active version that will be archived. */
    v_active_profile public.pricing_profiles%ROWTYPE;

    /*
     * NOW() returns the same transaction timestamp throughout
     * this function.

     * Therefore both versions receive exactly the same transition
     * time.
     */
    v_activation_time TIMESTAMPTZ := NOW();

    /* Used to verify that the draft contains pricing rates. */
    v_rate_exists BOOLEAN;
BEGIN
    /* Both IDs are required. */
    IF p_pricing_profile_id IS NULL
        OR p_activated_by_user_id IS NULL
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing profile ID and administrator user ID are required.';
    END IF;


    /*
     * Load the profile code first.

     * The code identifies the complete pricing family,
     * for example:

         NL_DAYTIME_STANDARD
    */
    SELECT pricing_profile.pricing_profile_code
    INTO v_pricing_profile_code
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_pricing_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing profile could not be found.';
    END IF;


    /*
     * Lock this complete pricing-profile family.

     * This prevents two administrators from activating competing
     * versions of the same pricing family at the same moment.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_pricing_profile_code, 0)
    );


    /* Reload and lock the draft after obtaining the family lock. */
    SELECT pricing_profile.*
    INTO v_draft_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_pricing_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing profile could not be found.';
    END IF;


    /* Only draft profiles may enter the activation workflow. */
    IF v_draft_profile.status <> 'draft' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only a draft pricing profile can be activated.';
    END IF;


    /*
     * The draft must contain its complete pricing_rates record
     * before it can become active.
     */
    SELECT EXISTS (
        SELECT 1
        FROM public.pricing_rates AS pricing_rate
        WHERE pricing_rate.pricing_profile_id = v_draft_profile.id
    )
    INTO v_rate_exists;

    IF NOT v_rate_exists THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The draft pricing profile does not contain pricing rates.';
    END IF;


    /*
     * Find and lock the currently active profile belonging to the
     * same pricing family.

     * Our current workflow creates drafts from an active profile,
     * so one active predecessor must exist.
     */
    SELECT pricing_profile.*
    INTO v_active_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.pricing_profile_code = v_draft_profile.pricing_profile_code
      AND pricing_profile.status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'No active pricing profile exists to replace.';
    END IF;


    /*
     * The old and new versions must describe the same market.

     * Website language is never involved in this decision.
     */
    IF v_active_profile.country_code <> v_draft_profile.country_code
        OR v_active_profile.currency_code <> v_draft_profile.currency_code
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The draft pricing market does not match the active pricing market.';
    END IF;


    /*
     * The old active profile must be able to end at the activation
     * timestamp without creating an invalid effective period.
     */
    IF v_activation_time <= v_active_profile.effective_from THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The activation time must be later than the active profile effective start.';
    END IF;


    /*
     * STEP 1 — ARCHIVE THE CURRENT ACTIVE VERSION

     * We archive it first because the database contains a unique
     * partial index allowing only one active version per profile
     * code.

     * effective_until and archived_at use exactly the same
     * transition timestamp.
     */
    UPDATE public.pricing_profiles
    SET
        status = 'archived',
        effective_until = v_activation_time,
        archived_by_user_id = p_activated_by_user_id,
        archived_at = v_activation_time
    WHERE id = v_active_profile.id;


    /*
     * STEP 2 — ACTIVATE THE DRAFT

     * Its previous effective_from value represented the time when
     * the draft was created.

     * That is replaced with the real moment when customers start
     * using this pricing version.
     */
    UPDATE public.pricing_profiles
    SET
        status = 'active',
        effective_from = v_activation_time,
        effective_until = NULL,
        activated_by_user_id = p_activated_by_user_id,
        archived_by_user_id = NULL,
        activated_at = v_activation_time,
        archived_at = NULL
    WHERE id = v_draft_profile.id;


    /* Return the newly activated profile for redirecting. */
    RETURN v_draft_profile.id;
END;
$$;


/* ============================================================
   FUNCTION PERMISSIONS

   Browser users must never call this financial transition
   directly.

   The Next.js server action will first execute:

       const adminUser = await requireAdminUser();

   It then calls this function through supabaseAdmin and passes:

       adminUser.id

   for both the activation and archive audit trail.
============================================================ */

REVOKE ALL
ON FUNCTION public.activate_pricing_profile_draft(UUID, UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.activate_pricing_profile_draft(UUID, UUID)
TO service_role;


COMMENT ON FUNCTION public.activate_pricing_profile_draft(UUID, UUID)
IS 'Atomically archives the current active pricing version and activates one draft using the same transition timestamp.';


COMMIT;