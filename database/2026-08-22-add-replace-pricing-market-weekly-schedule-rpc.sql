
/* ================================================================================================================
   PRICING MARKET WEEKLY SCHEDULE VALIDATION + ATOMIC REPLACEMENT

   Purpose:
   Allows an administrator to review and replace the complete recurring
   weekly pricing schedule of a pricing market while the market is still
   under review.

   Important architecture:

       template schedule
              ↓
       starting configuration only
              ↓
       administrator reviews/corrects schedule
              ↓
       replace_pricing_market_weekly_schedule()
              ↓
       database validates complete 7-day coverage
              ↓
       valid schedule stored atomically

   A valid weekly schedule must:

   - belong to an existing pricing market;
   - contain all seven ISO weekdays (1-7);
   - start every day at 00:00;
   - end every day at 24:00;
   - contain no gaps;
   - contain no overlaps;
   - reference pricing-profile families belonging to the same country
     and currency.

   Schedule periods follow the same half-open convention used by the
   quote resolver:

       start_local_time <= pickup time
       end_local_time   >  pickup time

   Example:

       00:00-06:00
       06:00-22:00
       22:00-24:00

   The replacement operation is atomic:
   if the proposed schedule is invalid, PostgreSQL rolls back the entire
   replacement and the previous schedule remains unchanged.
================================================================================================================ */


/* ================================================================================================================
   VALIDATE CURRENT WEEKLY SCHEDULE

   This function validates the schedule currently stored in
   public.pricing_schedules for one pricing market.

   It is intentionally reusable.

   Later mark_pricing_market_ready() can call this same validator instead
   of relying on the temporary rule "exactly 17 schedule rows".
================================================================================================================ */

CREATE OR REPLACE FUNCTION public.validate_pricing_market_weekly_schedule(
    p_country_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_country_code TEXT;
    v_market public.pricing_markets%ROWTYPE;
    v_schedule_count INTEGER;
    v_day_count INTEGER;
BEGIN

    /* ------------------------------------------------------------------------------------------------------------
       NORMALIZE + VALIDATE COUNTRY
    ------------------------------------------------------------------------------------------------------------ */

    v_country_code := UPPER(TRIM(COALESCE(p_country_code, '')));

    IF v_country_code !~ '^[A-Z]{2}$' THEN
        RAISE EXCEPTION 'Country code must contain exactly two letters.'
            USING ERRCODE = '22023';
    END IF;


    /* ------------------------------------------------------------------------------------------------------------
       SERIALIZE FINANCIAL CHANGES FOR THIS MARKET
    ------------------------------------------------------------------------------------------------------------ */

    PERFORM pg_advisory_xact_lock(
        hashtextextended('pricing_market|' || v_country_code, 0)
    );


    /* ------------------------------------------------------------------------------------------------------------
       LOAD PRICING MARKET

       The market determines the authoritative:
       - service category;
       - currency.
    ------------------------------------------------------------------------------------------------------------ */

    SELECT *
    INTO v_market
    FROM public.pricing_markets
    WHERE country_code = v_country_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pricing market % does not exist.', v_country_code
            USING ERRCODE = '22023';
    END IF;


    /* ------------------------------------------------------------------------------------------------------------
       REQUIRE SCHEDULE ROWS
    ------------------------------------------------------------------------------------------------------------ */

    SELECT
        COUNT(*),
        COUNT(DISTINCT schedule.day_of_week)
    INTO
        v_schedule_count,
        v_day_count
    FROM public.pricing_schedules schedule
    WHERE schedule.country_code = v_country_code
      AND schedule.service_category = v_market.service_category;

    IF v_schedule_count = 0 THEN
        RAISE EXCEPTION 'Pricing market % has no weekly pricing schedule.', v_country_code
            USING ERRCODE = '22023';
    END IF;

    IF v_day_count <> 7 THEN
        RAISE EXCEPTION 'Weekly pricing schedule must contain all seven days.'
            USING ERRCODE = '22023';
    END IF;


    /* ------------------------------------------------------------------------------------------------------------
       VALIDATE PRICING-PROFILE FAMILIES

       pricing_schedules stores a profile FAMILY code such as:

           DE_DAYTIME_STANDARD

       It deliberately does not store a profile version.

       V1, V2, V3 etc. can therefore change through the pricing-profile
       lifecycle without rewriting the weekly schedule.
    ------------------------------------------------------------------------------------------------------------ */

    IF EXISTS (
        SELECT 1
        FROM public.pricing_schedules schedule
        WHERE schedule.country_code = v_country_code
          AND schedule.service_category = v_market.service_category
          AND NOT EXISTS (
              SELECT 1
              FROM public.pricing_profiles pricing_profile
              WHERE pricing_profile.pricing_profile_code = schedule.pricing_profile_code
                AND pricing_profile.country_code = v_country_code
                AND pricing_profile.currency_code = v_market.currency_code
          )
    ) THEN
        RAISE EXCEPTION 'Weekly pricing schedule references a pricing-profile family that does not belong to this market.'
            USING ERRCODE = '22023';
    END IF;


    /* ------------------------------------------------------------------------------------------------------------
       EVERY DAY MUST START AT 00:00
    ------------------------------------------------------------------------------------------------------------ */

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT
                schedule.day_of_week,
                MIN(schedule.start_local_time) AS first_start_local_time
            FROM public.pricing_schedules schedule
            WHERE schedule.country_code = v_country_code
              AND schedule.service_category = v_market.service_category
            GROUP BY schedule.day_of_week
        ) day_schedule
        WHERE day_schedule.first_start_local_time <> TIME '00:00'
    ) THEN
        RAISE EXCEPTION 'Every weekly pricing day must start at 00:00.'
            USING ERRCODE = '22023';
    END IF;


    /* ------------------------------------------------------------------------------------------------------------
       EVERY DAY MUST END AT 24:00
    ------------------------------------------------------------------------------------------------------------ */

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT
                schedule.day_of_week,
                MAX(schedule.end_local_time) AS last_end_local_time
            FROM public.pricing_schedules schedule
            WHERE schedule.country_code = v_country_code
              AND schedule.service_category = v_market.service_category
            GROUP BY schedule.day_of_week
        ) day_schedule
        WHERE day_schedule.last_end_local_time <> TIME '24:00'
    ) THEN
        RAISE EXCEPTION 'Every weekly pricing day must end at 24:00.'
            USING ERRCODE = '22023';
    END IF;


    /* ------------------------------------------------------------------------------------------------------------
       NO GAPS / NO OVERLAPS

       For every period after the first period of a day:

           current.start_local_time
                    must equal
           previous.end_local_time

       Examples:

       VALID
           00:00-06:00
           06:00-22:00

       GAP
           00:00-06:00
           07:00-22:00

       OVERLAP
           00:00-08:00
           07:00-22:00
    ------------------------------------------------------------------------------------------------------------ */

    IF EXISTS (
        WITH ordered_schedule AS (
            SELECT
                schedule.day_of_week,
                schedule.start_local_time,
                schedule.end_local_time,

                LAG(schedule.end_local_time) OVER (
                    PARTITION BY schedule.day_of_week
                    ORDER BY
                        schedule.start_local_time,
                        schedule.end_local_time
                ) AS previous_end_local_time

            FROM public.pricing_schedules schedule
            WHERE schedule.country_code = v_country_code
              AND schedule.service_category = v_market.service_category
        )
        SELECT 1
        FROM ordered_schedule
        WHERE previous_end_local_time IS NOT NULL
          AND start_local_time <> previous_end_local_time
    ) THEN
        RAISE EXCEPTION 'Weekly pricing schedule contains a gap or overlapping period.'
            USING ERRCODE = '22023';
    END IF;

END;
$$;


/* ================================================================================================================
   ATOMICALLY REPLACE WEEKLY SCHEDULE

   Expected p_schedule JSON example:

   [
       {
           "day_of_week": 1,
           "start_local_time": "00:00",
           "end_local_time": "06:00",
           "pricing_profile_code": "DE_NIGHT_STANDARD"
       },
       {
           "day_of_week": 1,
           "start_local_time": "06:00",
           "end_local_time": "22:00",
           "pricing_profile_code": "DE_DAYTIME_STANDARD"
       },
       {
           "day_of_week": 1,
           "start_local_time": "22:00",
           "end_local_time": "24:00",
           "pricing_profile_code": "DE_NIGHT_STANDARD"
       }
   ]

   The JSON must contain the complete seven-day schedule.
================================================================================================================ */

CREATE OR REPLACE FUNCTION public.replace_pricing_market_weekly_schedule(
    p_country_code TEXT,
    p_schedule JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_country_code TEXT;
    v_market public.pricing_markets%ROWTYPE;
    v_inserted_count INTEGER;
BEGIN

    /* ------------------------------------------------------------------------------------------------------------
       NORMALIZE + VALIDATE INPUT
    ------------------------------------------------------------------------------------------------------------ */

    v_country_code := UPPER(TRIM(COALESCE(p_country_code, '')));

    IF v_country_code !~ '^[A-Z]{2}$' THEN
        RAISE EXCEPTION 'Country code must contain exactly two letters.'
            USING ERRCODE = '22023';
    END IF;

    IF p_schedule IS NULL
       OR jsonb_typeof(p_schedule) <> 'array'
       OR jsonb_array_length(p_schedule) = 0 THEN
        RAISE EXCEPTION 'Weekly pricing schedule must be a non-empty JSON array.'
            USING ERRCODE = '22023';
    END IF;


    /* ------------------------------------------------------------------------------------------------------------
       SERIALIZE FINANCIAL CHANGES FOR THIS MARKET

       Uses the same market-level advisory lock as create_pricing_market().
    ------------------------------------------------------------------------------------------------------------ */

    PERFORM pg_advisory_xact_lock(
        hashtextextended('pricing_market|' || v_country_code, 0)
    );


    /* ------------------------------------------------------------------------------------------------------------
       LOAD + LOCK MARKET
    ------------------------------------------------------------------------------------------------------------ */

    SELECT *
    INTO v_market
    FROM public.pricing_markets
    WHERE country_code = v_country_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pricing market % does not exist.', v_country_code
            USING ERRCODE = '22023';
    END IF;


    /* ------------------------------------------------------------------------------------------------------------
       ONLY MARKETS UNDER REVIEW MAY CHANGE THEIR INITIAL WEEKLY SCHEDULE

       Ready/live markets must later use a controlled versioned lifecycle
       rather than silently rewriting financial configuration.
    ------------------------------------------------------------------------------------------------------------ */

    IF v_market.configuration_status <> 'review_required' THEN
        RAISE EXCEPTION 'Only review-required pricing markets may replace their initial weekly schedule.'
            USING ERRCODE = '22023';
    END IF;

    IF v_market.pricing_enabled THEN
        RAISE EXCEPTION 'Pricing must remain disabled while the initial weekly schedule is being reviewed.'
            USING ERRCODE = '22023';
    END IF;


    /* ------------------------------------------------------------------------------------------------------------
       VALIDATE JSON ROW SHAPE BEFORE REPLACING THE EXISTING SCHEDULE
    ------------------------------------------------------------------------------------------------------------ */

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_schedule) AS proposed_schedule (
            day_of_week SMALLINT,
            start_local_time TIME,
            end_local_time TIME,
            pricing_profile_code TEXT
        )
        WHERE proposed_schedule.day_of_week IS NULL
           OR proposed_schedule.start_local_time IS NULL
           OR proposed_schedule.end_local_time IS NULL
           OR NULLIF(TRIM(proposed_schedule.pricing_profile_code), '') IS NULL
    ) THEN
        RAISE EXCEPTION 'Every weekly schedule row requires day, start time, end time and pricing-profile code.'
            USING ERRCODE = '22023';
    END IF;


    /* ------------------------------------------------------------------------------------------------------------
       REPLACE COMPLETE SCHEDULE

       DELETE + INSERT occur inside the same PostgreSQL transaction.

       If the later validator raises an exception, the DELETE and INSERT
       are both rolled back automatically.
    ------------------------------------------------------------------------------------------------------------ */

    DELETE FROM public.pricing_schedules
    WHERE country_code = v_country_code
      AND service_category = v_market.service_category;


    INSERT INTO public.pricing_schedules (
        country_code,
        service_category,
        day_of_week,
        start_local_time,
        end_local_time,
        pricing_profile_code
    )
    SELECT
        v_country_code,
        v_market.service_category,
        proposed_schedule.day_of_week,
        proposed_schedule.start_local_time,
        proposed_schedule.end_local_time,
        UPPER(TRIM(proposed_schedule.pricing_profile_code))
    FROM jsonb_to_recordset(p_schedule) AS proposed_schedule (
        day_of_week SMALLINT,
        start_local_time TIME,
        end_local_time TIME,
        pricing_profile_code TEXT
    );

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;


    /* ------------------------------------------------------------------------------------------------------------
       VALIDATE THE COMPLETE NEW SCHEDULE

       Any exception raised here rolls the complete replacement back.
    ------------------------------------------------------------------------------------------------------------ */

    PERFORM public.validate_pricing_market_weekly_schedule(v_country_code);


    /* ------------------------------------------------------------------------------------------------------------
       RETURN NUMBER OF STORED PERIODS
    ------------------------------------------------------------------------------------------------------------ */

    RETURN v_inserted_count;

END;
$$;


/* ================================================================================================================
   SECURITY
================================================================================================================ */

REVOKE ALL
ON FUNCTION public.validate_pricing_market_weekly_schedule(TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.validate_pricing_market_weekly_schedule(TEXT)
TO service_role;


REVOKE ALL
ON FUNCTION public.replace_pricing_market_weekly_schedule(TEXT, JSONB)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.replace_pricing_market_weekly_schedule(TEXT, JSONB)
TO service_role;


/* ================================================================================================================
   DOCUMENTATION
================================================================================================================ */

COMMENT ON FUNCTION public.validate_pricing_market_weekly_schedule(TEXT)
IS 'Validates that one pricing market has complete continuous seven-day recurring pricing coverage, without gaps or overlaps, using valid pricing-profile families belonging to the same market.';


COMMENT ON FUNCTION public.replace_pricing_market_weekly_schedule(TEXT, JSONB)
IS 'Atomically replaces the complete recurring weekly pricing schedule of a review-required pricing market and validates seven-day coverage, continuity and pricing-profile references before the transaction may complete.';