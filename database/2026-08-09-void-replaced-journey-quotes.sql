/*
================================================================
START: VOID REPLACED JOURNEY QUOTES

Purpose:
When a new quote has successfully been created for an unfinished
booking session, older active quotes from that same session are
marked as voided.

Important:
- the new quote is kept active;
- accepted quotes are never changed;
- quotes from another booking session are never changed;
- only the secure service role may execute this function.

pg_temp is PostgreSQL's temporary workspace.
PostgreSQL database
│
├── public
│   ├── bookings
│   ├── journey_quotes
│   ├── clients
│   └── ...
│
└── pg_temp
    └── temporary objects

================================================================
*/

CREATE OR REPLACE FUNCTION public.void_replaced_journey_quotes_for_session(
    p_booking_session_id UUID,
    p_keep_quote_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
-- is essentially telling this protected function: “Use our trusted application schema first; temporary objects come only afterward.”
-- pg_temp is PostgreSQL's temporary workspace.
SET search_path = public, pg_temp
AS $$
DECLARE
    v_voided_at TIMESTAMPTZ := clock_timestamp();
    v_voided_count INTEGER;
    v_keep_quote_created_at TIMESTAMPTZ;

BEGIN
    /*
        Lock this booking session for the duration of the transaction.
        Only one quote-replacement operation for the same booking session may run at a time.
        Without that lock, two nearly simultaneous replacement operations could overlap.
       
        Session AAA
        Q2 replacement request ─┐
                            ├─ only one may modify session AAA at a time
        Q3 replacement request ─┘
    */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_booking_session_id::TEXT, 0)
    );

    /*
        STEP 1: VERIFY THE NEW QUOTE

        Load the creation time of the quote that must remain active.

        The quote must:
        - exist;
        - belong to this booking session;
        - still be active.
    */
    
    SELECT created_at
    INTO v_keep_quote_created_at -- this particular SELECT ... INTO is PL/pgSQL syntax for putting query results (created_at) into variables (v_keep_quote_created_at).
    FROM public.journey_quotes
    WHERE quote_id = p_keep_quote_id
    AND booking_session_id = p_booking_session_id
    AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The active journey quote does not belong to this booking session.';
    END IF;

    /*
        STEP 2: VOID OLDER ACTIVE QUOTES
        Only active quotes from the same unfinished booking session are changed.
        The newly created quote identified by p_keep_quote_id remains active.
    */
    UPDATE public.journey_quotes
    SET  
        status = 'voided', voided_at = v_voided_at
    WHERE 
        booking_session_id = p_booking_session_id
        AND quote_id <> p_keep_quote_id
        AND status = 'active'
        AND created_at < v_keep_quote_created_at;
    /*
        Store how many old quotes were actually voided.
    */
    GET DIAGNOSTICS v_voided_count = ROW_COUNT;
    RETURN v_voided_count;

END;
$$;


/*
================================================================
SECURITY
================================================================
*/

REVOKE ALL
ON FUNCTION public.void_replaced_journey_quotes_for_session(UUID, UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.void_replaced_journey_quotes_for_session(UUID, UUID)
TO service_role;

/*
================================================================
END: VOID REPLACED JOURNEY QUOTES
================================================================
*/