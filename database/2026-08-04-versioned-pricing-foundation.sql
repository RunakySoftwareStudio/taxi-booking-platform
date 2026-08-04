BEGIN;
/* ============================================================
   VOYA TAXI – VERSIONED PRICING FOUNDATION

   Purpose:

   Creates the database foundation for versioned pricing,
   tax rules, currency rounding, journey quote details and
   the future secure connection between quotes and bookings.

   This migration is designed to remain compatible with the
   currently published booking and journey quote APIs.
============================================================ */


/* ============================================================
   SECTION 1: FINANCIAL STATUS TYPES

   financial_configuration_status is shared by versioned
   pricing profiles, tax rules and currency rounding rules.

   journey_quote_status represents the stored lifecycle of
   a journey quote.

   Quote expiration is not stored as a status. It is determined
   by comparing expires_at with the current database time.
============================================================ */

DO $$
BEGIN
    CREATE TYPE public.financial_configuration_status AS ENUM (
        'draft',
        'active',
        'archived'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;


DO $$
BEGIN
    CREATE TYPE public.journey_quote_status AS ENUM (
        'active',
        'accepted',
        'voided'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

/* ============================================================
    SECTION 2: PRICING PROFILES

    Stores the identity, version and lifecycle of a pricing
    configuration.

    Monetary rates are stored separately in pricing_rates.

    A pricing profile that has already been used must remain
    available for historical quotes. Administrators therefore
    create a new version instead of overwriting an old version.

    Important fields:
    pricing_profile_code: identifies the pricing family:
    NL_DAYTIME_STANDARD:    pricing_profile_version identifies its historical version: Version 1    Version 2    Version 3
    quote_validity_minutes: replaces the hard-coded value currently stored in the journey quote API:
    const quoteValidityMinutes = 15;
============================================================ */

CREATE TABLE IF NOT EXISTS public.pricing_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pricing_profile_code TEXT NOT NULL,
    pricing_profile_name TEXT NOT NULL,
    pricing_profile_version INTEGER NOT NULL,

    country_code TEXT NOT NULL,
    currency_code TEXT NOT NULL,

    quote_validity_minutes INTEGER NOT NULL DEFAULT 15,

    status public.financial_configuration_status
        NOT NULL DEFAULT 'draft',

    effective_from TIMESTAMPTZ NOT NULL,
    effective_until TIMESTAMPTZ,

    created_by_user_id UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    activated_by_user_id UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    archived_by_user_id UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    activated_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,

    CONSTRAINT pricing_profiles_code_version_unique
        UNIQUE (
            pricing_profile_code,
            pricing_profile_version
        ),

    CONSTRAINT pricing_profiles_code_valid
        CHECK (
            pricing_profile_code ~ '^[A-Z0-9_]+$'
        ),

    CONSTRAINT pricing_profiles_name_not_empty
        CHECK (
            LENGTH(TRIM(pricing_profile_name)) > 0
        ),

    CONSTRAINT pricing_profiles_version_valid
        CHECK (
            pricing_profile_version >= 1
        ),

    CONSTRAINT pricing_profiles_country_code_valid
        CHECK (
            LENGTH(country_code) = 2
            AND country_code = UPPER(country_code)
        ),

    CONSTRAINT pricing_profiles_currency_code_valid
        CHECK (
            LENGTH(currency_code) = 3
            AND currency_code = UPPER(currency_code)
        ),

    CONSTRAINT pricing_profiles_quote_validity_valid
        CHECK (
            quote_validity_minutes >= 1
            AND quote_validity_minutes <= 1440
        ),

    CONSTRAINT pricing_profiles_effective_period_valid
        CHECK (
            effective_until IS NULL
            OR effective_until > effective_from
        ),

CONSTRAINT pricing_profiles_lifecycle_consistent
    CHECK (
        (
            status = 'draft'
            AND activated_at IS NULL
            AND archived_at IS NULL
        )
        OR
        (
            status = 'active'
            AND activated_at IS NOT NULL
            AND archived_at IS NULL
            AND activated_at >= created_at
        )
        OR
        (
            status = 'archived'
            AND activated_at IS NOT NULL
            AND archived_at IS NOT NULL
            AND activated_at >= created_at
            AND archived_at >= activated_at
        )
    )
);

/* ============================================================
   SECTION 3: PRICING RATES

   Stores the monetary rates belonging to one pricing-profile
   version.

   The currency is inherited from pricing_profiles.

   One pricing profile may have at most one pricing_rates record.

    A draft profile can temporarily exist without rates while it is
    being created. Trusted activation logic must later verify that
    the profile has a complete pricing_rates record before allowing
    the profile to become active.

   An unused draft profile may be deleted together with its
   rates. Profiles referenced by journey quotes will later be
   protected from deletion by foreign-key relationships.
============================================================ */

CREATE TABLE IF NOT EXISTS public.pricing_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pricing_profile_id UUID NOT NULL
        REFERENCES public.pricing_profiles(id)
        ON DELETE CASCADE,

    base_fare_excluding_vat NUMERIC(12, 4) NOT NULL,
    distance_rate_per_km_excluding_vat NUMERIC(12, 4) NOT NULL,
    duration_rate_per_minute_excluding_vat NUMERIC(12, 4) NOT NULL,
    minimum_fare_excluding_vat NUMERIC(12, 4) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_rates_profile_unique
        UNIQUE (pricing_profile_id),

    CONSTRAINT pricing_rates_base_fare_valid
        CHECK (
            base_fare_excluding_vat >= 0
        ),

    CONSTRAINT pricing_rates_distance_rate_valid
        CHECK (
            distance_rate_per_km_excluding_vat >= 0
        ),

    CONSTRAINT pricing_rates_duration_rate_valid
        CHECK (
            duration_rate_per_minute_excluding_vat >= 0
        ),

    CONSTRAINT pricing_rates_minimum_fare_valid
        CHECK (
            minimum_fare_excluding_vat >= 0
        )
);

/* ============================================================
   SECTION 4: TAX RULES

   Stores tax configuration separately from commercial pricing.

   A new row is created when a tax rule changes. Existing quotes
   keep their original tax rate and may later reference the exact
   tax_rules record used during calculation.

   Passenger-transport VAT remains separate from future platform
   fees, commissions and other service categories.
============================================================ */

CREATE TABLE IF NOT EXISTS public.tax_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    country_code TEXT NOT NULL,
    tax_name TEXT NOT NULL,
    service_category TEXT NOT NULL,

    tax_rate_percentage NUMERIC(5, 2) NOT NULL,

    status public.financial_configuration_status
        NOT NULL DEFAULT 'draft',

    effective_from TIMESTAMPTZ NOT NULL,
    effective_until TIMESTAMPTZ,

    created_by_user_id UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    activated_by_user_id UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    archived_by_user_id UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    activated_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,

    CONSTRAINT tax_rules_country_code_valid
        CHECK (
            LENGTH(country_code) = 2
            AND country_code = UPPER(country_code)
        ),

    CONSTRAINT tax_rules_name_not_empty
        CHECK (
            LENGTH(TRIM(tax_name)) > 0
        ),

    CONSTRAINT tax_rules_service_category_valid
        CHECK (
            service_category ~ '^[a-z0-9_]+$'
        ),

    CONSTRAINT tax_rules_rate_valid
        CHECK (
            tax_rate_percentage >= 0
            AND tax_rate_percentage <= 100
        ),

    CONSTRAINT tax_rules_effective_period_valid
        CHECK (
            effective_until IS NULL
            OR effective_until > effective_from
        ),

CONSTRAINT tax_rules_lifecycle_consistent
    CHECK (
        (
            status = 'draft'
            AND activated_at IS NULL
            AND archived_at IS NULL
        )
        OR
        (
            status = 'active'
            AND activated_at IS NOT NULL
            AND archived_at IS NULL
            AND activated_at >= created_at
        )
        OR
        (
            status = 'archived'
            AND activated_at IS NOT NULL
            AND archived_at IS NOT NULL
            AND activated_at >= created_at
            AND archived_at >= activated_at
        )
    )
);

/* ============================================================
   SECTION 5: CURRENCY ROUNDING RULES

   Stores the rounding method used for final customer-facing
   monetary amounts.

   Rounding is kept separate from pricing and tax because the
   same pricing profile may eventually be used with different
   currencies or country-specific rounding requirements.

   Historical rules remain stored when a newer rule becomes
   active.
============================================================ */

CREATE TABLE IF NOT EXISTS public.currency_rounding_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    country_code TEXT NOT NULL,
    currency_code TEXT NOT NULL,

    rounding_increment NUMERIC(12, 4) NOT NULL,
    rounding_mode TEXT NOT NULL,

    status public.financial_configuration_status
        NOT NULL DEFAULT 'draft',

    effective_from TIMESTAMPTZ NOT NULL,
    effective_until TIMESTAMPTZ,

    created_by_user_id UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    activated_by_user_id UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    archived_by_user_id UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    activated_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,

    CONSTRAINT currency_rounding_rules_country_code_valid
        CHECK (
            LENGTH(country_code) = 2
            AND country_code = UPPER(country_code)
        ),

    CONSTRAINT currency_rounding_rules_currency_code_valid
        CHECK (
            LENGTH(currency_code) = 3
            AND currency_code = UPPER(currency_code)
        ),

    CONSTRAINT currency_rounding_rules_increment_valid
        CHECK (
            rounding_increment > 0
        ),

    CONSTRAINT currency_rounding_rules_mode_valid
        CHECK (
            rounding_mode IN (
                'nearest',
                'up',
                'down'
            )
        ),

    CONSTRAINT currency_rounding_rules_effective_period_valid
        CHECK (
            effective_until IS NULL
            OR effective_until > effective_from
        ),

CONSTRAINT currency_rounding_rules_lifecycle_consistent
    CHECK (
        (
            status = 'draft'
            AND activated_at IS NULL
            AND archived_at IS NULL
        )
        OR
        (
            status = 'active'
            AND activated_at IS NOT NULL
            AND archived_at IS NULL
            AND activated_at >= created_at
        )
        OR
        (
            status = 'archived'
            AND activated_at IS NOT NULL
            AND archived_at IS NOT NULL
            AND activated_at >= created_at
            AND archived_at >= activated_at
        )
    )
);

/* ============================================================
   SECTION 6: JOURNEY QUOTE FINANCIAL REFERENCES AND LIFECYCLE

   Extends the existing journey_quotes table without breaking
   the currently published quote API.

   The configuration foreign keys are initially nullable because
   existing quotes and the current API do not yet provide them.

   booking_data_fingerprint is also initially nullable because
   the current quote request contains only distance and duration.

   Quote expiration is derived from expires_at and is not stored
   as a separate status.
============================================================ */

ALTER TABLE public.journey_quotes
    ADD COLUMN IF NOT EXISTS pricing_profile_id UUID,

    ADD COLUMN IF NOT EXISTS tax_rule_id UUID,

    ADD COLUMN IF NOT EXISTS rounding_rule_id UUID,

    ADD COLUMN IF NOT EXISTS pricing_calculation_version
        INTEGER NOT NULL DEFAULT 1,

    ADD COLUMN IF NOT EXISTS booking_data_fingerprint TEXT,

    ADD COLUMN IF NOT EXISTS status
        public.journey_quote_status NOT NULL DEFAULT 'active',

    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,

    ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;


/* Connect quotes to the exact configuration records used. */
ALTER TABLE public.journey_quotes
    ADD CONSTRAINT journey_quotes_pricing_profile_fk
        FOREIGN KEY (pricing_profile_id)
        REFERENCES public.pricing_profiles(id)
        ON DELETE RESTRICT,

    ADD CONSTRAINT journey_quotes_tax_rule_fk
        FOREIGN KEY (tax_rule_id)
        REFERENCES public.tax_rules(id)
        ON DELETE RESTRICT,

    ADD CONSTRAINT journey_quotes_rounding_rule_fk
        FOREIGN KEY (rounding_rule_id)
        REFERENCES public.currency_rounding_rules(id)
        ON DELETE RESTRICT;


/*
   Existing quotes that already have used_at are treated as
   accepted quotes.

   This update happens before the lifecycle constraint is added.
   What this section establishes

    * A newly created quote has:
    status      = active
    used_at     = null
    accepted_at = null
    voided_at   = null

    * An accepted quote must have:
    status      = accepted
    used_at     = confirmation time
    accepted_at = confirmation time
    voided_at   = null

    * A voided quote must have:
    status      = voided
    used_at     = null
    accepted_at = null
    voided_at   = void time
*/
UPDATE public.journey_quotes
SET
    status = 'accepted',
    accepted_at = COALESCE(accepted_at, used_at)
WHERE used_at IS NOT NULL
  AND status = 'active';


ALTER TABLE public.journey_quotes
    ADD CONSTRAINT journey_quotes_calculation_version_valid
        CHECK (
            pricing_calculation_version >= 1
        ),

    ADD CONSTRAINT journey_quotes_fingerprint_valid
        CHECK (
            booking_data_fingerprint IS NULL
            OR LENGTH(TRIM(booking_data_fingerprint)) > 0
        ),

    ADD CONSTRAINT journey_quotes_accepted_time_valid
        CHECK (
            accepted_at IS NULL
            OR accepted_at >= created_at
        ),

    ADD CONSTRAINT journey_quotes_voided_time_valid
        CHECK (
            voided_at IS NULL
            OR voided_at >= created_at
        ),

    ADD CONSTRAINT journey_quotes_lifecycle_consistent
        CHECK (
            (
                status = 'active'
                AND used_at IS NULL
                AND accepted_at IS NULL
                AND voided_at IS NULL
            )
            OR
            (
                status = 'accepted'
                AND used_at IS NOT NULL
                AND accepted_at IS NOT NULL
                AND voided_at IS NULL
            )
            OR
            (
                status = 'voided'
                AND used_at IS NULL
                AND accepted_at IS NULL
                AND voided_at IS NOT NULL
            )
        );

/* ============================================================
   SECTION 7: JOURNEY QUOTE ITEMS

   Stores the detailed calculation breakdown belonging to one
   journey quote.

   The journey_quotes table stores the financial totals.
   This table explains how those totals were calculated.

   Signed monetary amounts are allowed so future discounts and
   corrections can be represented without adding special columns.
   
   Example calculation order
    10 – BASE_FARE
    20 – DISTANCE_CHARGE
    30 – DURATION_CHARGE
    40 – MINIMUM_FARE_ADJUSTMENT
    50 – PASSENGER_SUPPORT_SURCHARGE
    90 – PROMOTION_DISCOUNT
============================================================ */

CREATE TABLE IF NOT EXISTS public.journey_quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    quote_id UUID NOT NULL
        REFERENCES public.journey_quotes(quote_id)
        ON DELETE CASCADE,

    item_code TEXT NOT NULL,
    description TEXT NOT NULL,

    quantity NUMERIC(12, 4) NOT NULL,
    unit TEXT NOT NULL,

    unit_amount_excluding_vat NUMERIC(12, 4) NOT NULL,
    amount_excluding_vat NUMERIC(12, 4) NOT NULL,

    vat_rate_percentage NUMERIC(5, 2) NOT NULL,
    vat_amount NUMERIC(12, 4) NOT NULL,

    amount_including_vat NUMERIC(12, 4) NOT NULL,

    calculation_order INTEGER NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT journey_quote_items_code_valid
        CHECK (
            item_code ~ '^[A-Z0-9_]+$'
        ),

    CONSTRAINT journey_quote_items_description_not_empty
        CHECK (
            LENGTH(TRIM(description)) > 0
        ),

    CONSTRAINT journey_quote_items_quantity_valid
        CHECK (
            quantity > 0
        ),

    CONSTRAINT journey_quote_items_unit_valid
        CHECK (
            unit ~ '^[a-z0-9_]+$'
        ),

    CONSTRAINT journey_quote_items_vat_rate_valid
        CHECK (
            vat_rate_percentage >= 0
            AND vat_rate_percentage <= 100
        ),

    CONSTRAINT journey_quote_items_calculation_order_valid
        CHECK (
            calculation_order >= 0
        ),

    CONSTRAINT journey_quote_items_order_unique
        UNIQUE (
            quote_id,
            calculation_order
        )
);

/* ============================================================
   SECTION 8: CONNECT BOOKINGS TO ACCEPTED JOURNEY QUOTES

   Stores the exact journey quote accepted when a booking is
   created.

   The column is initially nullable because:

   - existing bookings were created before journey quotes;
   - the current booking API does not yet send quoteId;
   - future administrator-created bookings may not use the
     public quote workflow.

   A unique constraint ensures that one journey quote cannot be
   used to create multiple bookings.
============================================================ */

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS journey_quote_id UUID;


/*
   ON DELETE RESTRICT preserves the historical connection.

   An accepted quote cannot be deleted while a booking refers
   to it.
*/
ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_journey_quote_fk
        FOREIGN KEY (journey_quote_id)
        REFERENCES public.journey_quotes(quote_id)
        ON DELETE RESTRICT;


/*
   PostgreSQL allows multiple NULL values in a UNIQUE constraint.

   Existing bookings may therefore keep journey_quote_id = NULL,
   while each non-null quote ID can be used only once.
*/
ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_journey_quote_unique
        UNIQUE (journey_quote_id);


/* ============================================================
   SECTION 9: INDEXES AND ACTIVE-CONFIGURATION PROTECTION

   Indexes support configuration lookup, quote lifecycle checks
   and quote-item retrieval.

   Partial unique indexes ensure that only one configuration in
   the same business scope can have active status at one time.

   Historical draft and archived records may still coexist.

   This is allowed:
    NL_DAYTIME_STANDARD Version 1 → archived
    NL_DAYTIME_STANDARD Version 2 → active
    NL_DAYTIME_STANDARD Version 3 → draft

    This is rejected:
    NL_DAYTIME_STANDARD Version 1 → active
    NL_DAYTIME_STANDARD Version 2 → active
============================================================ */

/* Only one active version of each pricing-profile family. */
CREATE UNIQUE INDEX IF NOT EXISTS
    pricing_profiles_one_active_version_idx
ON public.pricing_profiles (
    pricing_profile_code
)
WHERE status = 'active';


/*
   Supports selecting a pricing profile by country, currency,
   status and effective date.
*/
CREATE INDEX IF NOT EXISTS
    pricing_profiles_lookup_idx
ON public.pricing_profiles (
    country_code,
    currency_code,
    status,
    effective_from
);

/*
   Only one active tax rule for the same country and service
   category.
*/
CREATE UNIQUE INDEX IF NOT EXISTS
    tax_rules_one_active_rule_idx
ON public.tax_rules (
    country_code,
    service_category
)
WHERE status = 'active';


/*
   Supports selecting the applicable tax rule for a country,
   service category and journey date.
*/
CREATE INDEX IF NOT EXISTS
    tax_rules_lookup_idx
ON public.tax_rules (
    country_code,
    service_category,
    status,
    effective_from
);


/*
   Only one active rounding rule for the same country and
   currency.
*/
CREATE UNIQUE INDEX IF NOT EXISTS
    currency_rounding_rules_one_active_rule_idx
ON public.currency_rounding_rules (
    country_code,
    currency_code
)
WHERE status = 'active';


/*
   Supports selecting the applicable rounding rule by country,
   currency, status and effective date.
*/
CREATE INDEX IF NOT EXISTS
    currency_rounding_rules_lookup_idx
ON public.currency_rounding_rules (
    country_code,
    currency_code,
    status,
    effective_from
);


/* Supports quote checks by stored lifecycle and expiration. */
CREATE INDEX IF NOT EXISTS
    journey_quotes_status_expires_at_idx
ON public.journey_quotes (
    status,
    expires_at
);


/* Supports historical configuration tracing from a quote. */
CREATE INDEX IF NOT EXISTS
    journey_quotes_pricing_profile_id_idx
ON public.journey_quotes (
    pricing_profile_id
);

CREATE INDEX IF NOT EXISTS
    journey_quotes_tax_rule_id_idx
ON public.journey_quotes (
    tax_rule_id
);

CREATE INDEX IF NOT EXISTS
    journey_quotes_rounding_rule_id_idx
ON public.journey_quotes (
    rounding_rule_id
);


/* ============================================================
   SECTION 10: UPDATED_AT TRIGGERS

   Reuses the existing public.update_updated_at_column()
   function.

   Editable financial configuration tables receive updated_at
   triggers.

   journey_quote_items does not receive an updated_at trigger
   because historical quote calculation items should remain
   immutable after creation.
============================================================ */


/* Automatically update pricing_profiles.updated_at. */
DROP TRIGGER IF EXISTS
    update_pricing_profiles_updated_at
ON public.pricing_profiles;

CREATE TRIGGER update_pricing_profiles_updated_at
BEFORE UPDATE ON public.pricing_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* Automatically update pricing_rates.updated_at. */
DROP TRIGGER IF EXISTS
    update_pricing_rates_updated_at
ON public.pricing_rates;

CREATE TRIGGER update_pricing_rates_updated_at
BEFORE UPDATE ON public.pricing_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* Automatically update tax_rules.updated_at. */
DROP TRIGGER IF EXISTS
    update_tax_rules_updated_at
ON public.tax_rules;

CREATE TRIGGER update_tax_rules_updated_at
BEFORE UPDATE ON public.tax_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* Automatically update currency_rounding_rules.updated_at. */
DROP TRIGGER IF EXISTS
    update_currency_rounding_rules_updated_at
ON public.currency_rounding_rules;

CREATE TRIGGER update_currency_rounding_rules_updated_at
BEFORE UPDATE ON public.currency_rounding_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

/* ============================================================
   SECTION 11: ROW LEVEL SECURITY AND TABLE PERMISSIONS

   Financial configuration and quote-calculation records are
   managed only through trusted server-side API routes.

   The browser must not directly insert, update or delete these
   records.

   Administrator API routes will:

   - authenticate the Supabase user;
   - verify user_profiles.role = 'admin';
   - use supabaseAdmin for trusted database operations.

   No direct anon or authenticated policies are created here.
============================================================ */


/* Enable Row Level Security on all new financial tables. */
ALTER TABLE public.pricing_profiles
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pricing_rates
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tax_rules
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.currency_rounding_rules
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.journey_quote_items
    ENABLE ROW LEVEL SECURITY;


/*
   journey_quotes already has Row Level Security enabled in the
   existing schema. Repeating this command is safe.
*/
ALTER TABLE public.journey_quotes
    ENABLE ROW LEVEL SECURITY;


/*
   Prevent direct access from anonymous and authenticated browser
   roles.

   Trusted server routes use the Supabase service role.
*/
REVOKE ALL
ON TABLE
    public.pricing_profiles,
    public.pricing_rates,
    public.tax_rules,
    public.currency_rounding_rules,
    public.journey_quotes,
    public.journey_quote_items
FROM anon, authenticated;


/* Explicitly preserve trusted service-role access. */
GRANT ALL
ON TABLE
    public.pricing_profiles,
    public.pricing_rates,
    public.tax_rules,
    public.currency_rounding_rules,
    public.journey_quotes,
    public.journey_quote_items
TO service_role;

/* ============================================================
   SECTION 12: INITIAL VERSION 1 FINANCIAL CONFIGURATION

   Inserts the financial configuration currently used by the
   TypeScript pricing files.

   These records allow the application to move from hard-coded
   settings to database-managed pricing without changing the
   current prices.

   Initial configuration:

   - Netherlands daytime standard pricing, Version 1
   - Dutch passenger-transport VAT
   - Dutch EUR currency rounding

   We used CTE, means Common Table Expression. The CTE is not a permanent table. After the SQL statement finishes, created_pricing_profile disappears.
   It works like this:
    1. Insert the pricing profile
    2. Return its generated UUID
    3. Temporarily call that result created_pricing_profile
    4. Use the UUID to insert the matching pricing_rates row
============================================================ */


/* ============================================================
   INITIAL PRICING PROFILE AND RATES
============================================================ */

WITH created_pricing_profile AS (
    INSERT INTO public.pricing_profiles (
        pricing_profile_code,
        pricing_profile_name,
        pricing_profile_version,
        country_code,
        currency_code,
        quote_validity_minutes,
        status,
        effective_from,
        effective_until,
        activated_at
    )
    VALUES (
        'NL_DAYTIME_STANDARD',
        'Netherlands Daytime Standard',
        1,
        'NL',
        'EUR',
        15,
        'active',
        TIMESTAMPTZ '2026-01-01 00:00:00+00',
        NULL,
        NOW()
    )
    RETURNING id
)
INSERT INTO public.pricing_rates (
    pricing_profile_id,
    base_fare_excluding_vat,
    distance_rate_per_km_excluding_vat,
    duration_rate_per_minute_excluding_vat,
    minimum_fare_excluding_vat
)
SELECT
    created_pricing_profile.id,
    4.0000,
    2.5000,
    0.4000,
    15.0000
FROM created_pricing_profile;


/* ============================================================
   INITIAL DUTCH PASSENGER-TRANSPORT TAX RULE
============================================================ */

INSERT INTO public.tax_rules (
    country_code,
    tax_name,
    service_category,
    tax_rate_percentage,
    status,
    effective_from,
    effective_until,
    activated_at
)
VALUES (
    'NL',
    'VAT',
    'passenger_transport',
    9.00,
    'active',
    TIMESTAMPTZ '2026-01-01 00:00:00+00',
    NULL,
    NOW()
);


/* ============================================================
   INITIAL DUTCH EUR ROUNDING RULE
============================================================ */

INSERT INTO public.currency_rounding_rules (
    country_code,
    currency_code,
    rounding_increment,
    rounding_mode,
    status,
    effective_from,
    effective_until,
    activated_at
)
VALUES (
    'NL',
    'EUR',
    0.0100,
    'nearest',
    'active',
    TIMESTAMPTZ '2026-01-01 00:00:00+00',
    NULL,
    NOW()
);

/* ============================================================*/
COMMIT;