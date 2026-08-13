/*
 * Pricing Version - Process 3
 *
 * Stores recurring local-time rules that select
 * the pricing profile for a planned journey.
 *
 * day_of_week uses ISO numbering:
 * 1 = Monday
 * 2 = Tuesday
 * ...
 * 7 = Sunday
 *
 * country_code       = NL
 * service_category   = example: passenger_transport or package transport
 */

CREATE TABLE IF NOT EXISTS public.pricing_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code TEXT NOT NULL,
    service_category TEXT NOT NULL,
    day_of_week SMALLINT NOT NULL,
    start_local_time TIME NOT NULL,
    end_local_time TIME NOT NULL,
    pricing_profile_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_schedules_country_code_valid
        CHECK (LENGTH(country_code) = 2 AND country_code = UPPER(country_code)),

    CONSTRAINT pricing_schedules_day_of_week_valid
        CHECK (day_of_week >= 1 AND day_of_week <= 7),

    CONSTRAINT pricing_schedules_time_period_valid
        CHECK (end_local_time > start_local_time ), 

    CONSTRAINT pricing_schedules_service_category_not_empty
        CHECK (LENGTH(TRIM(service_category)) > 0 ),

    CONSTRAINT pricing_schedules_profile_code_valid
        CHECK (pricing_profile_code ~ '^[A-Z0-9_]+$'),      

    CONSTRAINT pricing_schedules_period_unique
        UNIQUE (
            country_code,
            service_category,
            day_of_week,
            start_local_time,
        end_local_time
    )
);

/* ============================================================
   SPECIAL DATE / TIME PRICING OVERRIDES
   ============================================================ */

/*
 * Stores temporary or exceptional pricing periods.
 *
 * Examples:
 * - Christmas Day
 * - New Year's Eve night
 * - King's Day
 * - special events
 * - temporary seasonal pricing
 *
 * with priority, we have rules for priority over the normal recurring pricing_schedules table.
 * Then later the resolver can use:
        lower number = higher priority
        For example:
        priority 10  → New Year's Eve special
        priority 50  → Christmas / holiday
        priority 100 → general special period

        That gives us a clear rule:
        special overrides found
                ↓
        lowest priority number wins
                ↓
        if none found
                ↓
        normal weekly schedule

 */

CREATE TABLE IF NOT EXISTS public.pricing_schedule_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code TEXT NOT NULL,
    service_category TEXT NOT NULL,
    override_name TEXT NOT NULL,
    start_local_datetime TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    end_local_datetime TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    pricing_profile_code TEXT NOT NULL,
    priority SMALLINT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_schedule_overrides_country_code_valid
        CHECK (LENGTH(country_code) = 2 AND country_code = UPPER(country_code)),

    CONSTRAINT pricing_schedule_overrides_name_not_empty
        CHECK (LENGTH(TRIM(override_name)) > 0 ),

    CONSTRAINT pricing_schedule_overrides_period_valid
        CHECK (end_local_datetime > start_local_datetime),

    CONSTRAINT pricing_schedule_overrides_service_category_not_empty
        CHECK (LENGTH(TRIM(service_category)) > 0),

    CONSTRAINT pricing_schedule_overrides_profile_code_valid
        CHECK (pricing_profile_code ~ '^[A-Z0-9_]+$'),

    CONSTRAINT pricing_schedule_overrides_priority_valid
    CHECK (priority >= 1)
);

/* ============================================================
SECURITY

Pricing schedules are financial configuration.

They must not be read or changed directly by anonymous or
authenticated browser users. Trusted Next.js server operations
use the Supabase service role.
============================================================ */

/* Enable Row Level Security. */
ALTER TABLE public.pricing_schedules
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pricing_schedule_overrides
    ENABLE ROW LEVEL SECURITY;

/* Prevent direct browser access. */
REVOKE ALL
ON TABLE
    public.pricing_schedules,
    public.pricing_schedule_overrides
FROM anon, authenticated;


/* Preserve trusted server-side access. */
GRANT ALL
ON TABLE
    public.pricing_schedules,
    public.pricing_schedule_overrides
TO service_role;

/* ============================================================
   INITIAL NL PASSENGER TRANSPORT SCHEDULE
   ============================================================ */

/*
 * Monday-Friday:
 * 00:00-06:00 = night
 * 06:00-22:00 = daytime
 * 22:00-24:00 = night
 *
 * Saturday-Sunday:
 * full day = weekend
 */

INSERT INTO public.pricing_schedules (
    country_code,
    service_category,
    day_of_week,
    start_local_time,
    end_local_time,
    pricing_profile_code
)
VALUES
    ('NL', 'passenger_transport', 1, '00:00', '06:00', 'NL_NIGHT_STANDARD'),
    ('NL', 'passenger_transport', 1, '06:00', '22:00', 'NL_DAYTIME_STANDARD'),
    ('NL', 'passenger_transport', 1, '22:00', '24:00', 'NL_NIGHT_STANDARD'),

    ('NL', 'passenger_transport', 2, '00:00', '06:00', 'NL_NIGHT_STANDARD'),
    ('NL', 'passenger_transport', 2, '06:00', '22:00', 'NL_DAYTIME_STANDARD'),
    ('NL', 'passenger_transport', 2, '22:00', '24:00', 'NL_NIGHT_STANDARD'),

    ('NL', 'passenger_transport', 3, '00:00', '06:00', 'NL_NIGHT_STANDARD'),
    ('NL', 'passenger_transport', 3, '06:00', '22:00', 'NL_DAYTIME_STANDARD'),
    ('NL', 'passenger_transport', 3, '22:00', '24:00', 'NL_NIGHT_STANDARD'),

    ('NL', 'passenger_transport', 4, '00:00', '06:00', 'NL_NIGHT_STANDARD'),
    ('NL', 'passenger_transport', 4, '06:00', '22:00', 'NL_DAYTIME_STANDARD'),
    ('NL', 'passenger_transport', 4, '22:00', '24:00', 'NL_NIGHT_STANDARD'),

    ('NL', 'passenger_transport', 5, '00:00', '06:00', 'NL_NIGHT_STANDARD'),
    ('NL', 'passenger_transport', 5, '06:00', '22:00', 'NL_DAYTIME_STANDARD'),
    ('NL', 'passenger_transport', 5, '22:00', '24:00', 'NL_NIGHT_STANDARD'),

    ('NL', 'passenger_transport', 6, '00:00', '24:00', 'NL_WEEKEND_STANDARD'),
    ('NL', 'passenger_transport', 7, '00:00', '24:00', 'NL_WEEKEND_STANDARD')
    /*
    This gives us:
        first run
        → 17 schedule rows inserted

        accidental second run
        → existing 17 rows are left alone
        → no duplicates

        It also prevents two different profile codes from being assigned to exactly the same weekly time slot.
    */
    ON CONFLICT (
        country_code,
        service_category,
        day_of_week,
        start_local_time,
        end_local_time
    )
    DO NOTHING;