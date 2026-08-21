/* ================================================================================================================
   PRICING MARKET TAX + ROUNDING TEMPLATES

   Purpose:
   Stores starter tax and currency-rounding values for a pricing-market template.

   These values are NEVER used directly for customer journey pricing.

   When a new country is created:
   - the tax template is copied into public.tax_rules
   - the rounding template is copied into public.currency_rounding_rules
   - the new country remains configuration_status = 'review_required'
   - pricing_enabled remains FALSE

   Important:
   The starter values are placeholders only.
   They must be reviewed and corrected by an administrator for the new country.
==================================================================================================================== */

CREATE TABLE IF NOT EXISTS public.pricing_market_tax_rounding_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pricing_market_template_id UUID NOT NULL
        REFERENCES public.pricing_market_templates(id)
        ON DELETE CASCADE,

    tax_name TEXT NOT NULL,
    tax_rate_percentage NUMERIC(5, 2) NOT NULL,

    rounding_increment NUMERIC(12, 4) NOT NULL,
    rounding_mode TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_market_tax_rounding_templates_template_unique
        UNIQUE (pricing_market_template_id),

    CONSTRAINT pricing_market_tax_rounding_templates_tax_name_not_empty
        CHECK (
            LENGTH(TRIM(tax_name)) > 0
        ),

    CONSTRAINT pricing_market_tax_rounding_templates_tax_rate_valid
        CHECK (
            tax_rate_percentage >= 0
            AND tax_rate_percentage <= 100
        ),

    CONSTRAINT pricing_market_tax_rounding_templates_increment_valid
        CHECK (
            rounding_increment > 0
        ),

    CONSTRAINT pricing_market_tax_rounding_templates_mode_valid
        CHECK (
            rounding_mode IN (
                'nearest',
                'up',
                'down'
            )
        )
);


/* ---------------------------------------------------------------------------------------------------------------
   UPDATED_AT
---------------------------------------------------------------------------------------------------------------- */

DROP TRIGGER IF EXISTS update_pricing_market_tax_rounding_templates_updated_at
ON public.pricing_market_tax_rounding_templates;

CREATE TRIGGER update_pricing_market_tax_rounding_templates_updated_at
BEFORE UPDATE ON public.pricing_market_tax_rounding_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* ---------------------------------------------------------------------------------------------------------------
   INITIAL STANDARD PASSENGER-TRANSPORT TAX + ROUNDING TEMPLATE

   These are deliberately neutral starter values.

   Tax:
   - 0.00% means no legal tax assumption is made.
   - The administrator MUST verify the correct country tax.

   Rounding:
   - 0.0100 nearest is a generic starter rule.
   - The administrator MUST verify the correct currency/country rounding rule.
---------------------------------------------------------------------------------------------------------------- */

INSERT INTO public.pricing_market_tax_rounding_templates (
    pricing_market_template_id,
    tax_name,
    tax_rate_percentage,
    rounding_increment,
    rounding_mode
)
SELECT
    template.id,
    'Passenger Transport Tax',
    0.00,
    0.0100,
    'nearest'
FROM public.pricing_market_templates template
WHERE template.template_code = 'STANDARD_PASSENGER_TRANSPORT'
ON CONFLICT (pricing_market_template_id)
DO NOTHING;


/* ---------------------------------------------------------------------------------------------------------------
   SECURITY
---------------------------------------------------------------------------------------------------------------- */

REVOKE ALL
ON TABLE public.pricing_market_tax_rounding_templates
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.pricing_market_tax_rounding_templates
TO service_role;