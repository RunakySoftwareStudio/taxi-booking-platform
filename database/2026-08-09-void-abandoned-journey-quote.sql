/*
================================================================
START: VOID ABANDONED JOURNEY QUOTE

Purpose:
Voids one exact active journey quote when the customer abandons
or cancels an unfinished booking.

Security rules:
- the quote ID must match;
- the booking session ID must match;
- accepted or used quotes can never be voided;
- only the secure service role may execute this function.

exact quote_id + exact booking_session_id + still active + not accepted/used → void this one quote
================================================================
*/

CREATE OR REPLACE FUNCTION public.void_abandoned_journey_quote(
    p_quote_id UUID,
    p_booking_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quote public.journey_quotes%ROWTYPE;

BEGIN

    /*
        STEP 1: LOCK THIS BOOKING SESSION

        This uses the same session-level lock as the replacement
        quote function, so cancellation and quote replacement cannot
        modify the same unfinished booking session simultaneously.
    */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_booking_session_id::TEXT, 0)
    );


    /*
        STEP 2: LOAD AND LOCK THE EXACT QUOTE

        FOR UPDATE prevents another transaction from changing this
        quote while we decide whether it may be voided.
    */
    SELECT *
    INTO v_quote
    FROM public.journey_quotes
    WHERE quote_id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Journey quote was not found.';
    END IF;


    /*
        STEP 3: VERIFY BOOKING SESSION OWNERSHIP

        The browser must provide both:
        - the exact quote ID;
        - the booking session ID belonging to that quote.
    */
    IF v_quote.booking_session_id IS NULL
        OR v_quote.booking_session_id IS DISTINCT FROM p_booking_session_id THEN
            RAISE EXCEPTION 'Journey quote does not belong to this booking session.';
    END IF;


    /*
        STEP 4: NEVER VOID AN ACCEPTED OR USED QUOTE

        Once a quote has been accepted by a booking, cancellation
        belongs to the future booking/refund workflow instead.
    */
    IF v_quote.status = 'accepted'
       OR v_quote.used_at IS NOT NULL
       OR v_quote.accepted_at IS NOT NULL THEN
            RAISE EXCEPTION 'Accepted journey quotes cannot be voided.';
    END IF;


    /*
        If the quote was already voided, there is nothing more to do.

        Returning FALSE makes this operation safe if the cancel action
        accidentally reaches the server more than once.
    */
    IF v_quote.status = 'voided' THEN
        RETURN FALSE;
    END IF;


    /*
        STEP 5: VOID THE ACTIVE QUOTE
    */
    IF v_quote.status <> 'active' THEN
        RAISE EXCEPTION 'Journey quote is not active.';
    END IF;

    UPDATE public.journey_quotes
    SET
        status = 'voided',
        voided_at = clock_timestamp()
    WHERE quote_id = p_quote_id;

    RETURN TRUE;

END;
$$;


/*
================================================================
SECURITY
================================================================
*/

REVOKE ALL
ON FUNCTION public.void_abandoned_journey_quote(UUID, UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.void_abandoned_journey_quote(UUID, UUID)
TO service_role;


/*
================================================================
END: VOID ABANDONED JOURNEY QUOTE
================================================================
*/