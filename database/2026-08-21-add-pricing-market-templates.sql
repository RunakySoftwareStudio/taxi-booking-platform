/* ================================================================================================================
   PRICING MARKET TEMPLATES

   Purpose:
   Stores reusable base configurations used when onboarding a new
   pricing market.

   Important:
   Template data is never used directly to calculate customer prices.

   When a new country is created:
   1. A template is selected.
   2. Its financial configuration is copied into the real financial tables.
   3. The new country starts as review_required.
   4. pricing_enabled remains FALSE.
   5. An administrator reviews and adjusts the copied configuration.

   Country-specific values such as country code, country name,
   currency and time zone belong to pricing_markets, not this table.

   STANDARD_PASSENGER_TRANSPORT template
                 ↓ COPY
        New Germany configuration
                 ↓
        DE_DAYTIME_STANDARD
        DE_NIGHT_STANDARD
        DE_WEEKEND_STANDARD
                 ↓
        🔴 review_required
        pricing_enabled = false
                 ↓
        Admin corrects German values
==================================================================================================================== */

CREATE TABLE IF NOT EXISTS public.pricing_market_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    template_code TEXT NOT NULL,
    template_name TEXT NOT NULL,
    service_category TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_market_templates_code_unique
        UNIQUE (template_code),

    CONSTRAINT pricing_market_templates_code_valid
        CHECK (
            template_code ~ '^[A-Z0-9_]+$'
        ),

    CONSTRAINT pricing_market_templates_name_not_empty
        CHECK (
            LENGTH(TRIM(template_name)) > 0
        ),

    CONSTRAINT pricing_market_templates_service_category_not_empty
        CHECK (
            LENGTH(TRIM(service_category)) > 0
        )
);


/* ---------------------------------------------------------------------------------------------------------------
   UPDATED_AT
---------------------------------------------------------------------------------------------------------------- */

DROP TRIGGER IF EXISTS update_pricing_market_templates_updated_at
ON public.pricing_market_templates;

CREATE TRIGGER update_pricing_market_templates_updated_at
BEFORE UPDATE ON public.pricing_market_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* ---------------------------------------------------------------------------------------------------------------
   INITIAL BASE TEMPLATE

   This is only the root/template identity.
   Actual starter prices, schedules, tax and rounding values will
   be connected to this template in the following steps.
---------------------------------------------------------------------------------------------------------------- */

INSERT INTO public.pricing_market_templates (
    template_code,
    template_name,
    service_category
)
VALUES (
    'STANDARD_PASSENGER_TRANSPORT',
    'Standard Passenger Transport',
    'passenger_transport'
)
ON CONFLICT (template_code)
DO NOTHING;


/* ---------------------------------------------------------------------------------------------------------------
   SERVER-SIDE ACCESS
---------------------------------------------------------------------------------------------------------------- */

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.pricing_market_templates
TO service_role;

REVOKE ALL
ON TABLE public.pricing_market_templates
FROM anon, authenticated;