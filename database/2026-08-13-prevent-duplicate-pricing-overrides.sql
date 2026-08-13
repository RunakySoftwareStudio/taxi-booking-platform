/*
 * Pricing Version - Process 3
 *
 * Prevents the exact same special pricing override from being
 * stored more than once.
 *
 * The override name is intentionally NOT part of the rule.
 * Renaming an override must not allow duplicate financial rules.
 */


CREATE UNIQUE INDEX IF NOT EXISTS
    pricing_schedule_overrides_exact_unique
ON public.pricing_schedule_overrides (
    country_code,
    service_category,
    start_local_datetime,
    end_local_datetime,
    pricing_profile_code,
    priority
);