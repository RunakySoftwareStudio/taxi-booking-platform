/* ================================================================================================================
   PRICING MARKETS

   Purpose:
   Stores the countries that can participate in Voya Taxi pricing.

   A pricing market has two separate states:

   configuration_status
   - review_required = financial configuration exists but still requires admin review
   - ready           = financial configuration has been reviewed and approved

   pricing_enabled
   - false = public journey pricing may not start in this market
   - true  = public journey pricing may use this market

   Important safety rule:
   pricing_enabled may only be true when configuration_status = 'ready'.
==================================================================================================================== */


/* ---------------------------------------------------------------------------------------------------------------
   PRICING MARKET CONFIGURATION STATUS
---------------------------------------------------------------------------------------------------------------- */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'pricing_market_configuration_status'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        CREATE TYPE public.pricing_market_configuration_status AS ENUM (
            'review_required',
            'ready'
        );
    END IF;
END
$$;


/* ---------------------------------------------------------------------------------------------------------------
   PRICING MARKETS
---------------------------------------------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.pricing_markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    currency_code TEXT NOT NULL,
    service_category TEXT NOT NULL,
    time_zone TEXT NOT NULL,

    configuration_status public.pricing_market_configuration_status
        NOT NULL DEFAULT 'review_required',

    pricing_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_markets_country_code_unique
        UNIQUE (country_code),

    CONSTRAINT pricing_markets_country_code_valid
        CHECK (
            LENGTH(country_code) = 2
            AND country_code = UPPER(country_code)
        ),

    CONSTRAINT pricing_markets_country_name_not_empty
        CHECK (
            LENGTH(TRIM(country_name)) > 0
        ),

    CONSTRAINT pricing_markets_currency_code_valid
        CHECK (
            LENGTH(currency_code) = 3
            AND currency_code = UPPER(currency_code)
        ),

    CONSTRAINT pricing_markets_service_category_not_empty
        CHECK (
            LENGTH(TRIM(service_category)) > 0
        ),

    CONSTRAINT pricing_markets_time_zone_not_empty
        CHECK (
            LENGTH(TRIM(time_zone)) > 0
        ),

    /*
     * A country cannot provide public pricing while its
     * financial configuration still requires review.
     */
    CONSTRAINT pricing_markets_enabled_requires_ready
        CHECK (
            pricing_enabled = FALSE
            OR configuration_status = 'ready'
        )
);


/* ---------------------------------------------------------------------------------------------------------------
   UPDATED_AT
---------------------------------------------------------------------------------------------------------------- */

DROP TRIGGER IF EXISTS update_pricing_markets_updated_at
ON public.pricing_markets;

CREATE TRIGGER update_pricing_markets_updated_at
BEFORE UPDATE ON public.pricing_markets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* ---------------------------------------------------------------------------------------------------------------
   SERVER-SIDE ACCESS
---------------------------------------------------------------------------------------------------------------- */

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.pricing_markets
TO service_role;

REVOKE ALL
ON TABLE public.pricing_markets
FROM anon, authenticated;

/* ---------------------------------------------------------------------------------------------------------------
   INITIAL PRICING MARKETS

   NL and BE already have complete financial configuration and have
   been verified for journey pricing, so they start as ready and enabled.

   Future countries will normally start as:
   configuration_status = 'review_required'
   pricing_enabled = FALSE
---------------------------------------------------------------------------------------------------------------- */

INSERT INTO public.pricing_markets (
    country_code,
    country_name,
    currency_code,
    service_category,
    time_zone,
    configuration_status,
    pricing_enabled
)
VALUES
    (
        'NL',
        'Netherlands',
        'EUR',
        'passenger_transport',
        'Europe/Amsterdam',
        'ready',
        TRUE
    ),
    (
        'BE',
        'Belgium',
        'EUR',
        'passenger_transport',
        'Europe/Brussels',
        'ready',
        TRUE
    )
ON CONFLICT (country_code)
DO NOTHING;

