/* ================================================================================================================
   PRICING MARKET SCHEDULE TEMPLATES

   Purpose:
   Stores reusable weekly pricing schedules for pricing-market templates.

   These rows are NEVER used directly to select pricing for customer journeys.

   When a new country is created:
   1. The weekly template rows are copied into public.pricing_schedules.
   2. The profile suffix is combined with the new country code.

   Example:
   DAYTIME_STANDARD
        ↓
   Country = DE
        ↓
   DE_DAYTIME_STANDARD

   day_of_week uses ISO numbering:
   1 = Monday
   ...
   7 = Sunday
==================================================================================================================== */

CREATE TABLE IF NOT EXISTS public.pricing_market_schedule_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pricing_market_template_id UUID NOT NULL,
    day_of_week SMALLINT NOT NULL,
    start_local_time TIME NOT NULL,
    end_local_time TIME NOT NULL,
    profile_suffix TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    /*
     * Ensures that the referenced profile suffix actually belongs
     * to the same pricing-market template.
     */
    CONSTRAINT pricing_market_schedule_templates_profile_fk
        FOREIGN KEY (
            pricing_market_template_id,
            profile_suffix
        )
        REFERENCES public.pricing_market_profile_templates (
            pricing_market_template_id,
            profile_suffix
        )
        ON DELETE CASCADE,

    CONSTRAINT pricing_market_schedule_templates_day_valid
        CHECK (
            day_of_week >= 1
            AND day_of_week <= 7
        ),

    CONSTRAINT pricing_market_schedule_templates_period_valid
        CHECK (
            end_local_time > start_local_time
        ),

    CONSTRAINT pricing_market_schedule_templates_suffix_valid
        CHECK (
            profile_suffix ~ '^[A-Z0-9_]+$'
        ),

    CONSTRAINT pricing_market_schedule_templates_period_unique
        UNIQUE (
            pricing_market_template_id,
            day_of_week,
            start_local_time,
            end_local_time
        )
);


/* ---------------------------------------------------------------------------------------------------------------
   UPDATED_AT
---------------------------------------------------------------------------------------------------------------- */

DROP TRIGGER IF EXISTS update_pricing_market_schedule_templates_updated_at
ON public.pricing_market_schedule_templates;

CREATE TRIGGER update_pricing_market_schedule_templates_updated_at
BEFORE UPDATE ON public.pricing_market_schedule_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

/* ---------------------------------------------------------------------------------------------------------------
   INITIAL STANDARD PASSENGER-TRANSPORT WEEKLY SCHEDULE

   Monday-Friday:
   00:00-06:00 = NIGHT_STANDARD
   06:00-22:00 = DAYTIME_STANDARD
   22:00-24:00 = NIGHT_STANDARD

   Saturday-Sunday:
   00:00-24:00 = WEEKEND_STANDARD

   Holiday and special-event pricing are deliberately NOT part of
   this recurring weekly schedule. They will use pricing_schedule_overrides.
---------------------------------------------------------------------------------------------------------------- */

INSERT INTO public.pricing_market_schedule_templates (
    pricing_market_template_id,
    day_of_week,
    start_local_time,
    end_local_time,
    profile_suffix
)
SELECT
    template.id,
    schedule.day_of_week,
    schedule.start_local_time,
    schedule.end_local_time,
    schedule.profile_suffix
FROM public.pricing_market_templates template
CROSS JOIN (
    VALUES
        (1, TIME '00:00', TIME '06:00', 'NIGHT_STANDARD'),
        (1, TIME '06:00', TIME '22:00', 'DAYTIME_STANDARD'),
        (1, TIME '22:00', TIME '24:00', 'NIGHT_STANDARD'),

        (2, TIME '00:00', TIME '06:00', 'NIGHT_STANDARD'),
        (2, TIME '06:00', TIME '22:00', 'DAYTIME_STANDARD'),
        (2, TIME '22:00', TIME '24:00', 'NIGHT_STANDARD'),

        (3, TIME '00:00', TIME '06:00', 'NIGHT_STANDARD'),
        (3, TIME '06:00', TIME '22:00', 'DAYTIME_STANDARD'),
        (3, TIME '22:00', TIME '24:00', 'NIGHT_STANDARD'),

        (4, TIME '00:00', TIME '06:00', 'NIGHT_STANDARD'),
        (4, TIME '06:00', TIME '22:00', 'DAYTIME_STANDARD'),
        (4, TIME '22:00', TIME '24:00', 'NIGHT_STANDARD'),

        (5, TIME '00:00', TIME '06:00', 'NIGHT_STANDARD'),
        (5, TIME '06:00', TIME '22:00', 'DAYTIME_STANDARD'),
        (5, TIME '22:00', TIME '24:00', 'NIGHT_STANDARD'),

        (6, TIME '00:00', TIME '24:00', 'WEEKEND_STANDARD'),
        (7, TIME '00:00', TIME '24:00', 'WEEKEND_STANDARD')
) AS schedule (
    day_of_week,
    start_local_time,
    end_local_time,
    profile_suffix
)
WHERE template.template_code = 'STANDARD_PASSENGER_TRANSPORT'
ON CONFLICT (
    pricing_market_template_id,
    day_of_week,
    start_local_time,
    end_local_time
)
DO NOTHING;

/* ---------------------------------------------------------------------------------------------------------------
   SECURITY
---------------------------------------------------------------------------------------------------------------- */

REVOKE ALL
ON TABLE public.pricing_market_schedule_templates
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.pricing_market_schedule_templates
TO service_role;