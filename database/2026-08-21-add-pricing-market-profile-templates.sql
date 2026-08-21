/* ================================================================================================================
   PRICING MARKET PROFILE TEMPLATES

   Purpose:
   Stores reusable pricing-profile blueprints and starter monetary rates
   belonging to a pricing-market template.

   These rows are NEVER used directly for customer journey pricing.

   When a new country is created, each template row is copied into:
   - public.pricing_profiles
   - public.pricing_rates

   Example:
   DAYTIME_STANDARD
        ↓
   Country = DE
        ↓
   DE_DAYTIME_STANDARD

   The copied country profile starts as financial configuration that
   must be reviewed before the country can be enabled for pricing.
==================================================================================================================== */

CREATE TABLE IF NOT EXISTS public.pricing_market_profile_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pricing_market_template_id UUID NOT NULL
        REFERENCES public.pricing_market_templates(id)
        ON DELETE CASCADE,

    /*
     * Suffix used to generate the real country pricing-profile code.
     *
     * Example:
     * country_code = DE
     * profile_suffix = DAYTIME_STANDARD
     *
     * Result:
     * DE_DAYTIME_STANDARD
     */
    profile_suffix TEXT NOT NULL,

    /*
     * Human-readable part of the generated pricing-profile name.
     *
     * Example:
     * country_name = Germany
     * profile_name_suffix = Daytime Standard
     *
     * Result:
     * Germany Daytime Standard
     */
    profile_name_suffix TEXT NOT NULL,

    quote_validity_minutes INTEGER NOT NULL DEFAULT 20,

    base_fare_excluding_vat NUMERIC(12, 4) NOT NULL,
    distance_rate_per_km_excluding_vat NUMERIC(12, 4) NOT NULL,
    duration_rate_per_minute_excluding_vat NUMERIC(12, 4) NOT NULL,
    minimum_fare_excluding_vat NUMERIC(12, 4) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_market_profile_templates_profile_unique
        UNIQUE (
            pricing_market_template_id,
            profile_suffix
        ),

    CONSTRAINT pricing_market_profile_templates_suffix_valid
        CHECK (
            profile_suffix ~ '^[A-Z0-9_]+$'
        ),

    CONSTRAINT pricing_market_profile_templates_name_not_empty
        CHECK (
            LENGTH(TRIM(profile_name_suffix)) > 0
        ),

    /*
     * Matches the validation of public.pricing_profiles.
     */
    CONSTRAINT pricing_market_profile_templates_quote_validity_valid
        CHECK (
            quote_validity_minutes >= 1
            AND quote_validity_minutes <= 1440
        ),

    /*
     * The following monetary validations deliberately match
     * public.pricing_rates.
     */
    CONSTRAINT pricing_market_profile_templates_base_fare_valid
        CHECK (
            base_fare_excluding_vat >= 0
        ),

    CONSTRAINT pricing_market_profile_templates_distance_rate_valid
        CHECK (
            distance_rate_per_km_excluding_vat >= 0
        ),

    CONSTRAINT pricing_market_profile_templates_duration_rate_valid
        CHECK (
            duration_rate_per_minute_excluding_vat >= 0
        ),

    CONSTRAINT pricing_market_profile_templates_minimum_fare_valid
        CHECK (
            minimum_fare_excluding_vat >= 0
        )
);


/* ---------------------------------------------------------------------------------------------------------------
   UPDATED_AT
---------------------------------------------------------------------------------------------------------------- */

DROP TRIGGER IF EXISTS update_pricing_market_profile_templates_updated_at
ON public.pricing_market_profile_templates;

CREATE TRIGGER update_pricing_market_profile_templates_updated_at
BEFORE UPDATE ON public.pricing_market_profile_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

/* ---------------------------------------------------------------------------------------------------------------
   INITIAL STANDARD PASSENGER-TRANSPORT PROFILE TEMPLATES

   These values are starter configuration only.

   They deliberately use the same neutral baseline for every profile type.
   We do not assume that night, weekend, holiday or special-event pricing
   must contain a surcharge.

   Every generated country remains review_required and pricing_enabled = FALSE
   until an administrator verifies and adjusts its financial configuration.
---------------------------------------------------------------------------------------------------------------- */

INSERT INTO public.pricing_market_profile_templates (
    pricing_market_template_id,
    profile_suffix,
    profile_name_suffix,
    quote_validity_minutes,
    base_fare_excluding_vat,
    distance_rate_per_km_excluding_vat,
    duration_rate_per_minute_excluding_vat,
    minimum_fare_excluding_vat
)
SELECT
    template.id,
    profile.profile_suffix,
    profile.profile_name_suffix,
    20,
    4.5000,
    2.5000,
    0.4000,
    15.0000
FROM public.pricing_market_templates template
CROSS JOIN (
    VALUES
        ('DAYTIME_STANDARD', 'Daytime Standard'),
        ('NIGHT_STANDARD', 'Night Standard'),
        ('WEEKEND_STANDARD', 'Weekend Standard'),
        ('HOLIDAY_STANDARD', 'Holiday Standard'),
        ('SPECIAL_EVENT_STANDARD', 'Special Event Standard')
) AS profile (
    profile_suffix,
    profile_name_suffix
)
WHERE template.template_code = 'STANDARD_PASSENGER_TRANSPORT'
ON CONFLICT (
    pricing_market_template_id,
    profile_suffix
)
DO NOTHING;

/* ---------------------------------------------------------------------------------------------------------------
   SECURITY
---------------------------------------------------------------------------------------------------------------- */

REVOKE ALL
ON TABLE public.pricing_market_profile_templates
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.pricing_market_profile_templates
TO service_role;