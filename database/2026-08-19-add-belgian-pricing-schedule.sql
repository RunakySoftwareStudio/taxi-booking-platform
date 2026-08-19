/*
 * VOYA TAXI - BELGIAN PASSENGER TRANSPORT PRICING SCHEDULE
 *
 * Purpose:
 * Adds the normal weekly Belgian pricing schedule.
 *
 * Belgium currently uses the same business-time structure
 * as the Netherlands:
 *
 * Monday-Friday:
 * 00:00-06:00 -> Night
 * 06:00-22:00 -> Daytime
 * 22:00-24:00 -> Night
 *
 * Saturday-Sunday:
 * 00:00-24:00 -> Weekend
 *
 * Important:
 * Belgium uses its own pricing-profile families:
 *
 * BE_DAYTIME_STANDARD
 * BE_NIGHT_STANDARD
 * BE_WEEKEND_STANDARD
 *
 * These profiles already exist and are active.
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
    /* Monday */
    ('BE', 'passenger_transport', 1, '00:00', '06:00', 'BE_NIGHT_STANDARD'),
    ('BE', 'passenger_transport', 1, '06:00', '22:00', 'BE_DAYTIME_STANDARD'),
    ('BE', 'passenger_transport', 1, '22:00', '24:00', 'BE_NIGHT_STANDARD'),

    /* Tuesday */
    ('BE', 'passenger_transport', 2, '00:00', '06:00', 'BE_NIGHT_STANDARD'),
    ('BE', 'passenger_transport', 2, '06:00', '22:00', 'BE_DAYTIME_STANDARD'),
    ('BE', 'passenger_transport', 2, '22:00', '24:00', 'BE_NIGHT_STANDARD'),

    /* Wednesday */
    ('BE', 'passenger_transport', 3, '00:00', '06:00', 'BE_NIGHT_STANDARD'),
    ('BE', 'passenger_transport', 3, '06:00', '22:00', 'BE_DAYTIME_STANDARD'),
    ('BE', 'passenger_transport', 3, '22:00', '24:00', 'BE_NIGHT_STANDARD'),

    /* Thursday */
    ('BE', 'passenger_transport', 4, '00:00', '06:00', 'BE_NIGHT_STANDARD'),
    ('BE', 'passenger_transport', 4, '06:00', '22:00', 'BE_DAYTIME_STANDARD'),
    ('BE', 'passenger_transport', 4, '22:00', '24:00', 'BE_NIGHT_STANDARD'),

    /* Friday */
    ('BE', 'passenger_transport', 5, '00:00', '06:00', 'BE_NIGHT_STANDARD'),
    ('BE', 'passenger_transport', 5, '06:00', '22:00', 'BE_DAYTIME_STANDARD'),
    ('BE', 'passenger_transport', 5, '22:00', '24:00', 'BE_NIGHT_STANDARD'),

    /* Saturday */
    ('BE', 'passenger_transport', 6, '00:00', '24:00', 'BE_WEEKEND_STANDARD'),

    /* Sunday */
    ('BE', 'passenger_transport', 7, '00:00', '24:00', 'BE_WEEKEND_STANDARD')

ON CONFLICT (
    country_code,
    service_category,
    day_of_week,
    start_local_time,
    end_local_time
)
DO NOTHING;