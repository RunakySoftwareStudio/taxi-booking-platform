-- Enable UUID generation . We want every database row to have a unique ID like this:
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Supports exclusion constraints combining UUID equality with time ranges.
CREATE EXTENSION IF NOT EXISTS btree_gist;

/*
 * PostGIS adds geographic and geometry support to PostgreSQL.
 * Voya Taxi will use it to work with route lines and country
 * boundaries, for example to calculate how much of an
 * international journey takes place in each country.
 */
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Booking status values used by the platform
CREATE TYPE booking_status AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'confirmed',
  'completed',
  'cancelled'
);

-- Clients who request taxi trips
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Prevent duplicate clients with the same email address.
-- This treats uppercase/lowercase and extra spaces as the same email.
create unique index if not exists clients_unique_normalized_email
on clients (lower(trim(email)))
where email is not null and trim(email) <> '';

-- Chauffeur account status values
/*
    pending_approval = chauffeur registered but admin has not approved yet
    approved = chauffeur can receive bookings
    suspended = chauffeur is blocked temporarily
    inactive = chauffeur account is not active
*/

CREATE TYPE chauffeur_account_status AS ENUM (
  'pending_approval',
  'approved',
  'suspended',
  'inactive'
);

/* Chauffeur availability for daily operations. */
CREATE TYPE chauffeur_operational_status AS ENUM (
  'available',
  'sick',
  'on_leave',
  'unavailable'
);

-- Chauffeurs who can receive taxi bookings
CREATE TABLE chauffeurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  company_name TEXT,
  license_number TEXT,
  service_area TEXT,
  account_status chauffeur_account_status NOT NULL DEFAULT 'pending_approval',

  /* Current operational availability of the chauffeur. */
  operational_status chauffeur_operational_status
    NOT NULL DEFAULT 'available',

  /* Optional explanation, such as illness or planned leave. */
  status_reason TEXT,

  /* Records when the operational status was set or changed. */
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  rating NUMERIC(2, 1) DEFAULT 0.0,
  accepts_pets BOOLEAN NOT NULL DEFAULT false,
  bio TEXT,
  profile_photo_path TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Stores chauffeur requests for changes to administrator-controlled information.
create table if not exists public.chauffeur_change_requests (
    id uuid primary key default gen_random_uuid(),
    chauffeur_id uuid not null references public.chauffeurs(id) on delete cascade,
    field_name text not null check (field_name in ('name', 'email', 'company_name', 'license_number')),
    current_value text,
    requested_value text not null check (length(trim(requested_value)) > 0),
    reason text,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    admin_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    reviewed_by uuid references auth.users(id) on delete set null,
    reviewed_at timestamptz
);


-- Vehicle types available on the platform
CREATE TYPE vehicle_type AS ENUM (
  'standard',
  'business',
  'luxury',
  'van',
  'minibus',
  'wheelchair'
);

/* Vehicle availability for daily operations. */
CREATE TYPE vehicle_operational_status AS ENUM (
  'available',
  'damaged',
  'maintenance',
  'inactive'
);

/*
    -- Describes how a vehicle can transport a wheelchair.
    Meaning of wheelchair support
    none→ vehicle has no wheelchair support
    foldable_only
        → wheelchair can be folded and stored
        → passenger sits in a normal vehicle seat
    ramp
        → passenger may remain in the wheelchair
        → vehicle has a wheelchair ramp
    lift
        → passenger may remain in the wheelchair
        → vehicle has a mechanical wheelchair lift
*/

CREATE TYPE wheelchair_access_type AS ENUM (
  'none',
  'foldable_only',
  'ramp',
  'lift'
);

/* -- Vehicles used by chauffeurs
    infant_seat_count→ rear-facing baby seat
    child_seat_count→ normal child safety seat
    booster_seat_count→ booster seat for an older child
    isofix_available→ vehicle has ISOFIX attachment points
    Infant seat
        → for babies
        → usually rear-facing
    Child seat
            → has its own harness
            → for younger children
    Booster seat
            → no built-in harness in most cases
            → uses the vehicle’s normal seat belt
            → raises an older child to the correct height
*/
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chauffeur_id UUID NOT NULL REFERENCES chauffeurs(id) ON DELETE CASCADE,
  is_default_vehicle BOOLEAN NOT NULL DEFAULT FALSE, /* TRUE marks the chauffeur's normal vehicle.  Only one vehicle per chauffeur may be the default. */
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  vehicle_year INTEGER,
  vehicle_color TEXT,
  license_plate TEXT NOT NULL UNIQUE,
  vehicle_type vehicle_type NOT NULL DEFAULT 'standard',

  /* Current operational availability of the vehicle. */
  vehicle_status vehicle_operational_status
  NOT NULL DEFAULT 'available',

/* Optional explanation, such as damage or scheduled maintenance. */
status_reason TEXT,

  /* Records when the operational status was set or changed. */
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  seats INTEGER NOT NULL DEFAULT 4,
  luggage_capacity INTEGER NOT NULL DEFAULT 2,

  -- Number of child-safety seats supplied by the vehicle.
  infant_seat_count INTEGER NOT NULL DEFAULT 0,
  child_seat_count INTEGER NOT NULL DEFAULT 0,
  booster_seat_count INTEGER NOT NULL DEFAULT 0,
  isofix_available BOOLEAN NOT NULL DEFAULT FALSE,

  -- Wheelchair and mobility-aid support.
  wheelchair_access wheelchair_access_type NOT NULL DEFAULT 'none',
  wheelchair_capacity INTEGER NOT NULL DEFAULT 0,
  mobility_aid_storage BOOLEAN NOT NULL DEFAULT FALSE,

  -- Indicates whether the vehicle can carry unusually large luggage.
  extra_large_luggage BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Prevents negative capability values.
  CONSTRAINT vehicles_infant_seat_count_valid
    CHECK (infant_seat_count >= 0),

  CONSTRAINT vehicles_child_seat_count_valid
    CHECK (child_seat_count >= 0),

  CONSTRAINT vehicles_booster_seat_count_valid
    CHECK (booster_seat_count >= 0),

  CONSTRAINT vehicles_wheelchair_capacity_valid
    CHECK (wheelchair_capacity >= 0),

  /*
    none or foldable_only means the passenger cannot remain seated
    in the wheelchair, so wheelchair_capacity must be zero.

    ramp or lift means the vehicle can transport at least one
    passenger who remains seated in a wheelchair.
  */
  CONSTRAINT vehicles_wheelchair_access_consistent
    CHECK (
      (
        wheelchair_access IN ('none', 'foldable_only')
        AND wheelchair_capacity = 0
      )
      OR
      (
        wheelchair_access IN ('ramp', 'lift')
        AND wheelchair_capacity >= 1
      )
    )
);
-- Trip types available in the booking form
CREATE TYPE trip_type AS ENUM (
  'one-way',
  'return',
  'airport',
  'business',
  'hourly'
);

-- Chauffeur availability status values
CREATE TYPE availability_status AS ENUM (
  'available',
  'busy',
  'offline',
  'holiday'
);

/* Tracks whether an assignment problem still requires admin attention. */
CREATE TYPE assignment_alert_status AS ENUM (
  'open',
  'resolved'
);

-- Chauffeur availability schedule
CREATE TABLE IF NOT EXISTS chauffeur_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chauffeur_id UUID NOT NULL REFERENCES chauffeurs(id) ON DELETE CASCADE,
    booking_id UUID,
    available_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status availability_status NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

/*
  Defines how a passenger's wheelchair must be transported.
  none:
    No wheelchair transport is required.
  foldable:
    The passenger transfers to a normal seat and the folded wheelchair  is stored inside the vehicle.
  remain_in_wheelchair:
    One or more passengers remain seated in their wheelchairs.
    The assigned vehicle must provide ramp or lift access.
*/
CREATE TYPE public.wheelchair_requirement_type AS ENUM (
    'none',
    'foldable',
    'remain_in_wheelchair'
);

/* ============================================================
   FINANCIAL STATUS TYPES
============================================================ */

CREATE TYPE public.financial_configuration_status AS ENUM (
    'draft',
    'active',
    'archived'
);

CREATE TYPE public.journey_quote_status AS ENUM (
    'active',
    'accepted',
    'voided'
);

/* ============================================================
   PRICING PROFILES

   Stores the identity, version and lifecycle of a pricing
   configuration.

   Monetary rates are stored separately in pricing_rates.
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
   PRICING RATES

   Stores the monetary rates belonging to one pricing-profile
   version.

   A draft pricing profile may temporarily exist without rates.
   Trusted activation logic must verify that a complete rates
   record exists before activating the profile.
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

/*=============================================================
Strat pricing-schedules
==============================================================*/
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

/*=============================================================
End pricing-schedules
==============================================================*/

/*=============================================================
Start prevent-duplicate-pricing-overrides
==============================================================*/
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
/*=============================================================
End prevent-duplicate-pricing-overrides
==============================================================*/

/* ============================================================
   TAX RULES

   Stores tax configuration separately from commercial pricing.

   Historical tax rules remain available so existing quotes can
   retain the exact rule and percentage used during calculation.
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
   CURRENCY ROUNDING RULES

   Stores the rounding method used for final customer-facing
   monetary amounts.

   Historical rules remain available so existing quotes can
   retain the exact rule used during calculation.
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

-- =========================================================
-- JOURNEY QUOTES
-- Stores temporary server-calculated prices before booking.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.journey_quotes (
    quote_id UUID PRIMARY KEY,

    /*
       Historical pricing identity stored directly on the quote.
       These snapshot values remain unchanged even if the source
       configuration is later archived.
    */
    pricing_profile_code TEXT NOT NULL,
    pricing_profile_version INTEGER NOT NULL,

    /*
       References to the exact configuration records used during
       calculation.

       These fields remain nullable temporarily for compatibility
       with existing quotes and the current quote API.
    */
    pricing_profile_id UUID
        REFERENCES public.pricing_profiles(id)
        ON DELETE RESTRICT,

    tax_rule_id UUID
        REFERENCES public.tax_rules(id)
        ON DELETE RESTRICT,

    rounding_rule_id UUID
        REFERENCES public.currency_rounding_rules(id)
        ON DELETE RESTRICT,

    pricing_calculation_version INTEGER NOT NULL DEFAULT 1,

    country_code TEXT NOT NULL,
    destination_country_code TEXT,
    currency_code TEXT NOT NULL,

    distance_km NUMERIC(10, 3) NOT NULL,
    estimated_duration_minutes NUMERIC(10, 2) NOT NULL,

    tax_rate_percentage NUMERIC(5, 2) NOT NULL,

    /*
       Kept under its current name for compatibility with the
       published TypeScript and API implementation.

       It may later be renamed to subtotal_excluding_vat together
       with all related application fields.
    */
    basic_fare_excluding_vat NUMERIC(12, 4) NOT NULL,

    vat_amount NUMERIC(12, 4) NOT NULL,
    total_including_vat_before_rounding NUMERIC(12, 4) NOT NULL,
    final_total_including_vat NUMERIC(12, 2) NOT NULL,

    /*
        Identifies the unfinished public booking session that created
        this temporary quote.

        Multiple temporary quotes may belong to the same booking session
        when the customer changes the journey and requests a replacement.

        NULL is allowed for older quotes created before booking-session
        tracking was introduced.
    */
    booking_session_id UUID,

    /*
        Stores a fingerprint of the normalized pricing-relevant
        journey information used to create this quote.

        The fingerprint currently represents:
        - pickup coordinates;
        - destination coordinates.

        During booking confirmation, the server creates the
        fingerprint again and compares it with this stored value.

        NULL is allowed only for compatibility with older quotes
        created before fingerprint protection was introduced.
    */
    booking_data_fingerprint TEXT,

    status public.journey_quote_status
        NOT NULL DEFAULT 'active',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    used_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,

    CONSTRAINT journey_quotes_expiration_after_creation
        CHECK (
            expires_at > created_at
        ),

    CONSTRAINT journey_quotes_calculation_version_valid
        CHECK (
            pricing_calculation_version >= 1
        ),

    CONSTRAINT journey_quotes_fingerprint_valid
        CHECK (
            booking_data_fingerprint IS NULL
            OR LENGTH(TRIM(booking_data_fingerprint)) > 0
        ),

    CONSTRAINT journey_quotes_accepted_time_valid
        CHECK (
            accepted_at IS NULL
            OR accepted_at >= created_at
        ),

    CONSTRAINT journey_quotes_voided_time_valid
        CHECK (
            voided_at IS NULL
            OR voided_at >= created_at
        ),

    CONSTRAINT journey_quotes_lifecycle_consistent
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
        )
);

COMMENT ON COLUMN public.journey_quotes.destination_country_code IS
'Destination country code derived server-side from the destination coordinate. NULL is allowed for older quotes.';

-- Helps the application efficiently find expired quotes.
CREATE INDEX IF NOT EXISTS journey_quotes_expires_at_idx
    ON public.journey_quotes (expires_at);

/*
    Helps the server find temporary quotes that belong to the
    same unfinished booking session.
*/
CREATE INDEX IF NOT EXISTS journey_quotes_booking_session_id_idx
    ON public.journey_quotes (booking_session_id);

-- Quotes are created and accessed only through secure server routes.
ALTER TABLE public.journey_quotes
    ENABLE ROW LEVEL SECURITY;

/*
================================================================
START: ATOMIC BOOKING + JOURNEY QUOTE ACCEPTANCE

    PURPOSE: CREATE A BOOKING AND ACCEPT ITS JOURNEY QUOTE ATOMICALLY
    Includes:
    - PostgreSQL function
    - quote locking
    - fingerprint verification
    - booking creation
    - quote acceptance
    - security REVOKE / GRANT permissions

    This PostgreSQL function protects the financial relationship between:
        journey quote
            ↓
        customer confirmation
            ↓
        booking

    The quote is locked before it is checked.
    This prevents two requests from using the same quote at the same time.

    IMPORTANT:
    Everything inside this function runs inside one PostgreSQL transaction.
    If any step fails, PostgreSQL rolls back the complete operation.
================================================================
*/
CREATE OR REPLACE FUNCTION public.create_booking_with_accepted_journey_quote(
    p_client_id UUID,
    p_journey_quote_id UUID,
    p_booking_data_fingerprint TEXT,

    p_pickup_location TEXT,
    p_pickup_city TEXT,
    p_destination TEXT,
    p_destination_city TEXT,
    p_pickup_date DATE,
    p_pickup_time TIME,
    p_estimated_duration_minutes INTEGER,

    p_passengers INTEGER,
    p_luggage INTEGER,
    p_trip_type public.trip_type,
    p_notes TEXT,
    p_has_pets BOOLEAN,

    p_infant_seat_count_required INTEGER,
    p_child_seat_count_required INTEGER,
    p_booster_seat_count_required INTEGER,
    p_isofix_required BOOLEAN,

    p_wheelchair_requirement public.wheelchair_requirement_type,
    p_wheelchair_passenger_count INTEGER,
    p_mobility_aid_storage_required BOOLEAN,
    p_extra_large_luggage_required BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- declares a PostgreSQL variable that can hold one complete row from the journey_quotes table.
    -- Give this variable v_quote, the same structure as one complete row of this table, journey_quotes.
    v_quote public.journey_quotes%ROWTYPE;
    v_booking_id UUID;

    -- One timestamp will be used for the complete acceptance.
    -- This means used_at and accepted_at receive exactly the same database timestamp.
    v_accepted_at TIMESTAMPTZ;

BEGIN

    /*
        STEP 1: LOCK THE JOURNEY QUOTE

        FOR UPDATE means:
        "I am working with this quote now. Another transaction must wait before changing it."
        This is important because two browser requests could theoretically arrive almost at the same moment.
    */
    SELECT *
    INTO v_quote
    FROM public.journey_quotes
    WHERE quote_id = p_journey_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Journey quote does not exist.';
    END IF;

    /*
        Record the actual time after the quote lock has been acquired.
        clock_timestamp() gives the current real database time, including any time spent waiting for the lock.
    */
    v_accepted_at := clock_timestamp();

    /*
        A quote without a fingerprint belongs to the older
        temporary quote format and must not be accepted through
        this secure booking workflow.

        stored fingerprint missing?  → reject
        incoming fingerprint missing? → reject
        fingerprints different?       → reject
        same valid fingerprint?       → continue
    */
    IF v_quote.booking_data_fingerprint IS NULL
        OR LENGTH(TRIM(v_quote.booking_data_fingerprint)) = 0
    THEN
        RAISE EXCEPTION 'Journey quote does not contain a valid booking fingerprint.';
    END IF;

    IF p_booking_data_fingerprint IS NULL
        OR LENGTH(TRIM(p_booking_data_fingerprint)) = 0
    THEN
        RAISE EXCEPTION 'Booking fingerprint is required.';
    END IF;

    /*
        STEP 2: VERIFY THE FINGERPRINT
        The stored quote fingerprint must represent exactly the same pricing journey as the confirmed booking.
    */
    IF v_quote.booking_data_fingerprint
        IS DISTINCT FROM p_booking_data_fingerprint
    THEN
        RAISE EXCEPTION 'Journey quote does not match this booking.';
    END IF;


    /*
        STEP 3: VERIFY THE QUOTE LIFECYCLE
        Only an active, unused and unexpired quote can create a booking.
    */
    IF v_quote.status <> 'active' THEN
        RAISE EXCEPTION 'Journey quote is no longer active.';
    END IF;

    IF v_quote.expires_at <= v_accepted_at THEN
        RAISE EXCEPTION 'Journey quote has expired.';
    END IF;

    IF v_quote.used_at IS NOT NULL
        OR v_quote.accepted_at IS NOT NULL
    THEN
        RAISE EXCEPTION 'Journey quote has already been used.';
    END IF;

    /*
        STEP 4: CREATE THE BOOKING

        The booking is linked directly to the exact journey quote that the customer accepted.
        The booking starts as pending because no chauffeur or vehicle has been assigned yet.
    */
    INSERT INTO public.bookings (
        client_id,
        chauffeur_id,
        vehicle_id,
        journey_quote_id,

        pickup_location,
        pickup_city,
        destination,
        destination_city,
        pickup_date,
        pickup_time,
        estimated_duration_minutes,

        passengers,
        luggage,
        trip_type,
        notes,
        status,
        has_pets,

        infant_seat_count_required,
        child_seat_count_required,
        booster_seat_count_required,
        isofix_required,

        wheelchair_requirement,
        wheelchair_passenger_count,
        mobility_aid_storage_required,
        extra_large_luggage_required
    )
    VALUES (
        p_client_id,
        NULL,
        NULL,
        p_journey_quote_id,

        p_pickup_location,
        p_pickup_city,
        p_destination,
        p_destination_city,
        p_pickup_date,
        p_pickup_time,
        p_estimated_duration_minutes,

        p_passengers,
        p_luggage,
        p_trip_type,
        p_notes,
        'pending',
        p_has_pets,

        p_infant_seat_count_required,
        p_child_seat_count_required,
        p_booster_seat_count_required,
        p_isofix_required,

        p_wheelchair_requirement,
        p_wheelchair_passenger_count,
        p_mobility_aid_storage_required,
        p_extra_large_luggage_required
    )
    RETURNING id INTO v_booking_id;

    /*
        STEP 5: ACCEPT THE LOCKED JOURNEY QUOTE

        The booking has now been created successfully.
        We permanently mark the quote as accepted and record exactly when it was accepted and used.
        The same timestamp is deliberately used for both fields.
    */
    UPDATE public.journey_quotes
    SET
        status = 'accepted',
        used_at = v_accepted_at,
        accepted_at = v_accepted_at
    WHERE quote_id = p_journey_quote_id;


    /*
        STEP 6: RETURN THE NEW BOOKING ID
        The API will receive this UUID after PostgreSQL has successfully completed the whole operation.
    */
    RETURN v_booking_id;

END;
$$;

/*
    ================================================================
    ATOMIC QUOTE ACCEPTANCE

    lock quote
        ↓
    verify fingerprint
        ↓
    verify active / unexpired / unused
        ↓
    insert booking
        ↓
    store journey_quote_id on booking
        ↓
    update quote:
        status = accepted
        used_at = acceptance timestamp
        accepted_at = acceptance timestamp
        ↓
    return booking ID

    ================================================================
    SECURITY

    Public browser/database users must never call this financial
    function directly.

    Only the server-side service role may execute it.

    PUBLIC          -> no access
    anon            -> no access
    authenticated   -> no access
    service_role    -> EXECUTE
    ================================================================
*/
REVOKE ALL -- explicitly remove permissions from Supabase's public, anon and authenticated roles.
ON FUNCTION public.create_booking_with_accepted_journey_quote(
    UUID,
    UUID,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    DATE,
    TIME,
    INTEGER,
    INTEGER,
    INTEGER,
    public.trip_type,
    TEXT,
    BOOLEAN,
    INTEGER,
    INTEGER,
    INTEGER,
    BOOLEAN,
    public.wheelchair_requirement_type,
    INTEGER,
    BOOLEAN,
    BOOLEAN
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_booking_with_accepted_journey_quote(
    UUID,
    UUID,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    DATE,
    TIME,
    INTEGER,
    INTEGER,
    INTEGER,
    public.trip_type,
    TEXT,
    BOOLEAN,
    INTEGER,
    INTEGER,
    INTEGER,
    BOOLEAN,
    public.wheelchair_requirement_type,
    INTEGER,
    BOOLEAN,
    BOOLEAN
)
TO service_role;
/*
================================================================
END: ATOMIC BOOKING + JOURNEY QUOTE ACCEPTANCE
================================================================
*/

/*
================================================================
VOYA TAXI - ATOMIC JOURNEY QUOTE CREATION
Purpose: Create one complete temporary journey quote atomically.
The operation includes:

    1. Lock the unfinished booking session.
    2. Insert the journey quote header.
    3. Insert all journey quote calculation items.
    4. Void other active quotes from the same booking session.

If any step fails, PostgreSQL rolls back the complete transaction.

================================================================
*/

CREATE OR REPLACE FUNCTION public.create_journey_quote_with_items(
    p_quote_id UUID,
    p_booking_session_id UUID,

    p_pricing_profile_id UUID,
    p_tax_rule_id UUID,
    p_rounding_rule_id UUID,

    p_pricing_calculation_version INTEGER,
    p_booking_data_fingerprint TEXT,

    p_pricing_profile_code TEXT,
    p_pricing_profile_version INTEGER,

    p_country_code TEXT,
    p_destination_country_code TEXT,
    p_currency_code TEXT,

    p_distance_km NUMERIC,
    p_estimated_duration_minutes NUMERIC,

    p_tax_rate_percentage NUMERIC,

    p_basic_fare_excluding_vat NUMERIC,
    p_vat_amount NUMERIC,
    p_total_including_vat_before_rounding NUMERIC,
    p_final_total_including_vat NUMERIC,

    p_created_at TIMESTAMPTZ,
    p_expires_at TIMESTAMPTZ,

    p_quote_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN

    /*
        STEP 1: VALIDATE REQUIRED FINANCIAL REFERENCES

        Some database columns remain nullable for compatibility
        with older quotes.

        New quotes created through this function must contain
        the complete pricing configuration identity.
    */

    IF p_booking_session_id IS NULL THEN
        RAISE EXCEPTION 'Booking session ID is required.';
    END IF;

    IF p_pricing_profile_id IS NULL THEN
        RAISE EXCEPTION 'Pricing profile ID is required.';
    END IF;

    IF p_tax_rule_id IS NULL THEN
        RAISE EXCEPTION 'Tax rule ID is required.';
    END IF;

    IF p_rounding_rule_id IS NULL THEN
        RAISE EXCEPTION 'Rounding rule ID is required.';
    END IF;

    IF p_booking_data_fingerprint IS NULL
        OR LENGTH(TRIM(p_booking_data_fingerprint)) = 0 THEN
            RAISE EXCEPTION 'Booking data fingerprint is required.';
    END IF;

    IF p_destination_country_code IS NULL
        OR LENGTH(TRIM(p_destination_country_code)) = 0 THEN
            RAISE EXCEPTION 'Destination country code is required.';
    END IF;
    /*
        STEP 2: REQUIRE CALCULATION ITEMS

        A complete journey quote must contain at least
        one calculation item.
        jsonb_array_length(p_quote_items) = Count how many items are inside the JSON array p_quote_items.
    */

    IF p_quote_items IS NULL
        OR jsonb_typeof(p_quote_items) <> 'array'
        OR jsonb_array_length(p_quote_items) = 0 THEN
            RAISE EXCEPTION 'Journey quote calculation items are required.';
    END IF;


    /*
        STEP 3: LOCK THE BOOKING SESSION
        “Create a lock number from this booking-session ID and lock that session until this transaction finishes.”
        Only one quote-creation/replacement operation for the same
        unfinished booking session may proceed at one time.

        Example:
        Session A → locked by transaction 1
        Session A → transaction 2 waits
        Session B → may continue independently
        ::TEXT means convert the UUID into text. like bookingSessionId.ToString()
        The xact means transaction-level lock. When the transaction ends: the lock is released by COMMIT or ROLLBACK.
    */

    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_booking_session_id::TEXT, 0)
    );


    /*
        STEP 4: INSERT JOURNEY QUOTE HEADER

        journey_quotes stores WHAT the complete quote is.
    */

    INSERT INTO public.journey_quotes (
        quote_id,
        booking_session_id,

        pricing_profile_id,
        tax_rule_id,
        rounding_rule_id,

        pricing_calculation_version,
        booking_data_fingerprint,

        pricing_profile_code,
        pricing_profile_version,

        country_code,
        destination_country_code,
        currency_code,

        distance_km,
        estimated_duration_minutes,

        tax_rate_percentage,

        basic_fare_excluding_vat,
        vat_amount,
        total_including_vat_before_rounding,
        final_total_including_vat,

        created_at,
        expires_at
    )
    VALUES (
        p_quote_id,
        p_booking_session_id,

        p_pricing_profile_id,
        p_tax_rule_id,
        p_rounding_rule_id,

        p_pricing_calculation_version,
        p_booking_data_fingerprint,

        p_pricing_profile_code,
        p_pricing_profile_version,

        UPPER(TRIM(p_country_code)),
        UPPER(TRIM(p_destination_country_code)),
        p_currency_code,

        p_distance_km,
        p_estimated_duration_minutes,

        p_tax_rate_percentage,

        p_basic_fare_excluding_vat,
        p_vat_amount,
        p_total_including_vat_before_rounding,
        p_final_total_including_vat,

        p_created_at,
        p_expires_at
    );


    /*
        STEP 5: INSERT JOURNEY QUOTE ITEMS

        journey_quote_items stores HOW the quote
        was calculated.

        We do not trust quote_id from the JSON.
        PostgreSQL attaches every item to p_quote_id.
    */

    INSERT INTO public.journey_quote_items (
        quote_id,
        item_code,
        description,
        quantity,
        unit,
        unit_amount_excluding_vat,
        amount_excluding_vat,
        vat_rate_percentage,
        vat_amount,
        amount_including_vat,
        calculation_order
    )
    SELECT
        p_quote_id,
        quote_item.item_code,
        quote_item.description,
        quote_item.quantity,
        quote_item.unit,
        quote_item.unit_amount_excluding_vat,
        quote_item.amount_excluding_vat,
        quote_item.vat_rate_percentage,
        quote_item.vat_amount,
        quote_item.amount_including_vat,
        quote_item.calculation_order
    FROM jsonb_to_recordset(p_quote_items) AS quote_item (
        item_code TEXT,
        description TEXT,
        quantity NUMERIC(12, 4),
        unit TEXT,
        unit_amount_excluding_vat NUMERIC(12, 4),
        amount_excluding_vat NUMERIC(12, 4),
        vat_rate_percentage NUMERIC(5, 2),
        vat_amount NUMERIC(12, 4),
        amount_including_vat NUMERIC(12, 4),
        calculation_order INTEGER
    );


    /*
        STEP 6: VOID OTHER ACTIVE QUOTES

        Because this booking session is locked, another
        quote-creation transaction for the same session
        cannot run at the same time.

        The newly created quote remains active.
    */

    UPDATE public.journey_quotes
    SET
        status = 'voided',
        voided_at = clock_timestamp()
    WHERE
        booking_session_id = p_booking_session_id
        AND quote_id <> p_quote_id
        AND status = 'active';

END;
$$;


/*
================================================================
SECURITY

Financial quote creation is server-only.

PUBLIC, anon and authenticated users cannot execute
this function directly.

================================================================
*/

REVOKE ALL
ON FUNCTION public.create_journey_quote_with_items(
    UUID,
    UUID,
    UUID,
    UUID,
    UUID,
    INTEGER,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    TEXT,
    TEXT,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    TIMESTAMPTZ,
    TIMESTAMPTZ,
    JSONB
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.create_journey_quote_with_items(
    UUID,
    UUID,
    UUID,
    UUID,
    UUID,
    INTEGER,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    TEXT,
    TEXT,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    TIMESTAMPTZ,
    TIMESTAMPTZ,
    JSONB
)
TO service_role;


/*
================================================================
END: ATOMIC JOURNEY QUOTE CREATION
================================================================
*/

/*
================================================================
START: VOID REPLACED JOURNEY QUOTES

Purpose:
When a new quote has successfully been created for an unfinished
booking session, older active quotes from that same session are
marked as voided.

Important:
- the new quote is kept active;
- accepted quotes are never changed;
- quotes from another booking session are never changed;
- only the secure service role may execute this function.

pg_temp is PostgreSQL's temporary workspace.
PostgreSQL database
│
├── public
│   ├── bookings
│   ├── journey_quotes
│   ├── clients
│   └── ...
│
└── pg_temp
    └── temporary objects

================================================================
*/

CREATE OR REPLACE FUNCTION public.void_replaced_journey_quotes_for_session(
    p_booking_session_id UUID,
    p_keep_quote_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
-- is essentially telling this protected function: “Use our trusted application schema first; temporary objects come only afterward.”
-- pg_temp is PostgreSQL's temporary workspace.
SET search_path = public, pg_temp
AS $$
DECLARE
    v_voided_at TIMESTAMPTZ := clock_timestamp();
    v_voided_count INTEGER;
    v_keep_quote_created_at TIMESTAMPTZ;

BEGIN
    /*
        Lock this booking session for the duration of the transaction.
        Only one quote-replacement operation for the same booking session may run at a time.
        Without that lock, two nearly simultaneous replacement operations could overlap.

        Session AAA
        Q2 replacement request ─┐
                            ├─ only one may modify session AAA at a time
        Q3 replacement request ─┘
    */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_booking_session_id::TEXT, 0)
    );

    /*
        STEP 1: VERIFY THE NEW QUOTE

        Load the creation time of the quote that must remain active.

        The quote must:
        - exist;
        - belong to this booking session;
        - still be active.
    */

    SELECT created_at
    INTO v_keep_quote_created_at -- this particular SELECT ... INTO is PL/pgSQL syntax for putting query results (created_at) into variables (v_keep_quote_created_at).
    FROM public.journey_quotes
    WHERE quote_id = p_keep_quote_id
    AND booking_session_id = p_booking_session_id
    AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The active journey quote does not belong to this booking session.';
    END IF;

    /*
        STEP 2: VOID OLDER ACTIVE QUOTES
        Only active quotes from the same unfinished booking session are changed.
        The newly created quote identified by p_keep_quote_id remains active.
    */
    UPDATE public.journey_quotes
    SET
        status = 'voided', voided_at = v_voided_at
    WHERE
        booking_session_id = p_booking_session_id
        AND quote_id <> p_keep_quote_id
        AND status = 'active'
        AND created_at < v_keep_quote_created_at;
    /*
        Store how many old quotes were actually voided.
    */
    GET DIAGNOSTICS v_voided_count = ROW_COUNT;
    RETURN v_voided_count;

END;
$$;


/*
================================================================
SECURITY
================================================================
*/

REVOKE ALL
ON FUNCTION public.void_replaced_journey_quotes_for_session(UUID, UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.void_replaced_journey_quotes_for_session(UUID, UUID)
TO service_role;

/*
================================================================
END: VOID REPLACED JOURNEY QUOTES
================================================================
*/

/*
================================================================
START: VOID ABANDONED JOURNEY QUOTE

Purpose:
Voids one exact active journey quote when the customer abandons
or cancels an unfinished booking.

Security rules:
- the quote ID must match;
- the booking session ID must match;
- accepted or used quotes can never be voided;
- only the secure service role may execute this function.

exact quote_id + exact booking_session_id + still active + not accepted/used → void this one quote
================================================================
*/

CREATE OR REPLACE FUNCTION public.void_abandoned_journey_quote(
    p_quote_id UUID,
    p_booking_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quote public.journey_quotes%ROWTYPE;

BEGIN

    /*
        STEP 1: LOCK THIS BOOKING SESSION

        This uses the same session-level lock as the replacement
        quote function, so cancellation and quote replacement cannot
        modify the same unfinished booking session simultaneously.
    */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_booking_session_id::TEXT, 0)
    );

    /*
        STEP 2: LOAD AND LOCK THE EXACT QUOTE

        FOR UPDATE prevents another transaction from changing this
        quote while we decide whether it may be voided.
    */
    SELECT *
    INTO v_quote
    FROM public.journey_quotes
    WHERE quote_id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Journey quote was not found.';
    END IF;

    /*
        STEP 3: VERIFY BOOKING SESSION OWNERSHIP

        The browser must provide both:
        - the exact quote ID;
        - the booking session ID belonging to that quote.
    */
    IF v_quote.booking_session_id IS NULL
        OR v_quote.booking_session_id IS DISTINCT FROM p_booking_session_id THEN
            RAISE EXCEPTION 'Journey quote does not belong to this booking session.';
    END IF;

    /*
        STEP 4: NEVER VOID AN ACCEPTED OR USED QUOTE

        Once a quote has been accepted by a booking, cancellation
        belongs to the future booking/refund workflow instead.
    */
    IF v_quote.status = 'accepted'
       OR v_quote.used_at IS NOT NULL
       OR v_quote.accepted_at IS NOT NULL THEN
            RAISE EXCEPTION 'Accepted journey quotes cannot be voided.';
    END IF;

    /*
        If the quote was already voided, there is nothing more to do.

        Returning FALSE makes this operation safe if the cancel action
        accidentally reaches the server more than once.
    */
    IF v_quote.status = 'voided' THEN
        RETURN FALSE;
    END IF;

    /*
        STEP 5: VOID THE ACTIVE QUOTE
    */
    IF v_quote.status <> 'active' THEN
        RAISE EXCEPTION 'Journey quote is not active.';
    END IF;

    UPDATE public.journey_quotes
    SET
        status = 'voided',
        voided_at = clock_timestamp()
    WHERE quote_id = p_quote_id;

    RETURN TRUE;

END;
$$;

/*
================================================================
SECURITY
================================================================
*/

REVOKE ALL
ON FUNCTION public.void_abandoned_journey_quote(UUID, UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.void_abandoned_journey_quote(UUID, UUID)
TO service_role;

/*
================================================================
END: VOID ABANDONED JOURNEY QUOTE
================================================================
*/


/* ============================================================
   JOURNEY QUOTE ITEMS

   Stores the detailed calculation breakdown belonging to one
   journey quote.

   Signed monetary amounts are allowed so future discounts and
   price corrections can use negative values.
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
Quote items are accessed only through trusted server routes.
============================================================ */
ALTER TABLE public.journey_quote_items
    ENABLE ROW LEVEL SECURITY;

/* ============================================================
   FINANCIAL TABLE SECURITY

   Financial configuration and quote-calculation records are
   accessed only through trusted server-side API routes.

   No direct anonymous or authenticated browser policies are
   created for these tables.
============================================================ */

/* Enable Row Level Security on financial configuration tables. */
ALTER TABLE public.pricing_profiles
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pricing_rates
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tax_rules
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.currency_rounding_rules
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pricing_schedules
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pricing_schedule_overrides
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pricing_schedules
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pricing_schedule_overrides
    ENABLE ROW LEVEL SECURITY;
/*
   Prevent direct table access from browser roles.

   Protected Next.js routes verify authentication and roles,
   then use the Supabase service role for trusted operations.
*/

REVOKE ALL
ON TABLE
    public.pricing_profiles,
    public.pricing_rates,
    public.tax_rules,
    public.currency_rounding_rules,
    public.pricing_schedules,
    public.pricing_schedule_overrides,
    public.journey_quotes,
    public.journey_quote_items
FROM anon, authenticated;

/* Preserve trusted server-side service-role access. */
GRANT ALL
ON TABLE
    public.pricing_profiles,
    public.pricing_rates,
    public.tax_rules,
    public.currency_rounding_rules,
    public.pricing_schedules,
    public.pricing_schedule_overrides,
    public.journey_quotes,
    public.journey_quote_items
TO service_role;

/* ================================================================================================================
   INITIAL VERSION 1 FINANCIAL CONFIGURATION

   Mirrors the financial values currently used by the
   TypeScript pricing configuration.
==================================================================================================================== */
/* Create the pricing profile and connect its exact rates. */
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
        20,
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
    4.5000,
    2.5000,
    0.4000,
    15.0000
FROM created_pricing_profile;

/* Create the initial Night pricing profile and rates. */
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
        'NL_NIGHT_STANDARD',
        'Netherlands Night Standard',
        1,
        'NL',
        'EUR',
        20,
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
    4.5000,
    2.5000,
    0.4000,
    15.0000
FROM created_pricing_profile;


/* Create the initial Weekend pricing profile and rates. */
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
        'NL_WEEKEND_STANDARD',
        'Netherlands Weekend Standard',
        1,
        'NL',
        'EUR',
        20,
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
    4.5000,
    2.5000,
    0.4000,
    15.0000
FROM created_pricing_profile;

/* Dutch passenger-transport VAT. */
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


/* Dutch EUR rounding rule. */
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
/*====================================================================================================================*/
/* ===================================================================================================================
INITIAL NL PASSENGER TRANSPORT PRICING SCHEDULE

Defines the normal recurring weekly pricing-profile selection.

Monday-Friday:
00:00-06:00 → Night
06:00-22:00 → Daytime
22:00-24:00 → Night

Saturday-Sunday:
00:00-24:00 → Weekend
============================================================ */

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
ON CONFLICT (
    country_code,
    service_category,
    day_of_week,
    start_local_time,
    end_local_time
)
DO NOTHING;

/* =================================================================================================================================
-- Taxi trip booking requests
==================================================================================================================================== */
CREATE TABLE public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    chauffeur_id UUID REFERENCES chauffeurs(id) ON DELETE SET NULL, /*A booking can exist without a chauffeur at first.*/
    /*
      Stores the exact vehicle assigned to this booking.

      NULL means that no vehicle has been selected yet.
      ON DELETE SET NULL preserves the booking when a vehicle is deleted.
    */
    vehicle_id UUID NULL REFERENCES public.vehicles(id) ON DELETE SET NULL,
    /*
      Stores the exact journey quote accepted when this booking
      was created.

      NULL supports historical bookings and administrator-created
      bookings that do not use the public quote workflow.

      ON DELETE RESTRICT prevents deletion of an accepted quote
      while a booking still refers to it.
    */
    journey_quote_id UUID
        REFERENCES public.journey_quotes(quote_id)
        ON DELETE RESTRICT,

    pickup_location TEXT NOT NULL,
    pickup_city TEXT,
    destination_city TEXT,
    destination TEXT NOT NULL,
    pickup_date DATE NOT NULL,
    pickup_time TIME NOT NULL,
    estimated_duration_minutes INTEGER NOT NULL DEFAULT 60,
    passengers INTEGER NOT NULL DEFAULT 1,
    luggage INTEGER DEFAULT 0,

    infant_seat_count_required INTEGER NOT NULL DEFAULT 0,
    child_seat_count_required INTEGER NOT NULL DEFAULT 0,
    booster_seat_count_required INTEGER NOT NULL DEFAULT 0,
    isofix_required BOOLEAN NOT NULL DEFAULT FALSE,
    wheelchair_requirement public.wheelchair_requirement_type NOT NULL DEFAULT 'none',
    wheelchair_passenger_count INTEGER NOT NULL DEFAULT 0,
    mobility_aid_storage_required BOOLEAN NOT NULL DEFAULT FALSE,
    extra_large_luggage_required BOOLEAN NOT NULL DEFAULT FALSE,

    trip_type trip_type NOT NULL,
    notes TEXT,
    status booking_status NOT NULL DEFAULT 'pending',
    has_pets BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT bookings_infant_seat_count_required_valid
        CHECK (infant_seat_count_required >= 0),

    CONSTRAINT bookings_child_seat_count_required_valid
        CHECK (child_seat_count_required >= 0),

    CONSTRAINT bookings_booster_seat_count_required_valid
        CHECK (booster_seat_count_required >= 0),

    CONSTRAINT bookings_wheelchair_passenger_count_valid
        CHECK (wheelchair_passenger_count >= 0),

    /*
      none and foldable require zero passengers remaining in a wheelchair.
      remain_in_wheelchair requires at least one wheelchair passenger.
    */
    CONSTRAINT bookings_wheelchair_requirement_consistent
        CHECK (
            (
                wheelchair_requirement IN ('none', 'foldable')
                AND wheelchair_passenger_count = 0
            )
            OR
            (
                wheelchair_requirement = 'remain_in_wheelchair'
                AND wheelchair_passenger_count >= 1
            )
        ),

    /*
    Active bookings require both a chauffeur assignment and an exact assigned vehicle.
    The API separately verifies that the chauffeur is approved and that the selected vehicle matches the booking.
    pending, rejected and cancelled bookings may remain unassigned.
    */
    CONSTRAINT bookings_active_assignment_required
        CHECK (
            status NOT IN ('accepted', 'confirmed', 'completed')
            OR (
                chauffeur_id IS NOT NULL
                AND vehicle_id IS NOT NULL
            )
        ),

    /*One quote can create no more than one booking.*/
    CONSTRAINT bookings_journey_quote_unique
        UNIQUE (journey_quote_id),
);

/* This tells PostgreSQL: Store this explanation as documentation for bookings.pickup_city.*/
COMMENT ON COLUMN public.bookings.pickup_city IS
'Privacy-safe pickup city derived from the selected Mapbox location.';

COMMENT ON COLUMN public.bookings.destination_city IS
'Privacy-safe destination city derived from the selected Mapbox location.';

/* ============================================================
   FINANCIAL CONFIGURATION AND QUOTE INDEXES

   Supports active-configuration selection, historical tracing
   and journey-quote lifecycle checks.
============================================================ */

/* Only one active version of each pricing-profile family. */
CREATE UNIQUE INDEX IF NOT EXISTS
    pricing_profiles_one_active_version_idx
ON public.pricing_profiles (
    pricing_profile_code
)
WHERE status = 'active';


/* Only one draft version of each pricing-profile family. */
CREATE UNIQUE INDEX IF NOT EXISTS
    pricing_profiles_one_draft_version_idx
ON public.pricing_profiles (
    pricing_profile_code
)
WHERE status = 'draft';


/* Supports pricing-profile lookup by country and currency. */
CREATE INDEX IF NOT EXISTS
    pricing_profiles_lookup_idx
ON public.pricing_profiles (
    country_code,
    currency_code,
    status,
    effective_from
);

/*
 * Multiple active tax rules may exist for the same country and
 * service category when they apply to different effective periods.
 *
 * Their effective periods may touch, but must never overlap.
 */
ALTER TABLE public.tax_rules
ADD CONSTRAINT tax_rules_active_periods_do_not_overlap
EXCLUDE USING gist (
    country_code WITH =,
    service_category WITH =,
    tstzrange(
        effective_from,
        COALESCE(effective_until, 'infinity'::timestamptz),
        '[)'
    ) WITH &&
)
WHERE (status = 'active');

/* Supports selection of the applicable tax rule. */
CREATE INDEX IF NOT EXISTS
    tax_rules_lookup_idx
ON public.tax_rules (
    country_code,
    service_category,
    status,
    effective_from
);

/*
 * Multiple active rounding rules may exist for the same country
 * and currency when they apply to different effective periods.
 *
 * Their effective periods may touch, but must never overlap.
 */
ALTER TABLE public.currency_rounding_rules
ADD CONSTRAINT currency_rounding_rules_active_periods_do_not_overlap
EXCLUDE USING gist (
    country_code WITH =,
    currency_code WITH =,
    tstzrange(
        effective_from,
        COALESCE(effective_until, 'infinity'::timestamptz),
        '[)'
    ) WITH &&
)
WHERE (status = 'active');

/* Supports selection of the applicable rounding rule. */
CREATE INDEX IF NOT EXISTS
    currency_rounding_rules_lookup_idx
ON public.currency_rounding_rules (
    country_code,
    currency_code,
    status,
    effective_from
);


/* Supports quote lifecycle and expiration checks. */
CREATE INDEX IF NOT EXISTS
    journey_quotes_status_expires_at_idx
ON public.journey_quotes (
    status,
    expires_at
);


/* Supports historical configuration tracing. */
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
   ASSIGNMENT ALERTS

   Stores chauffeur and vehicle assignment problems that require
   administrator review.

   Resolved alerts remain stored as historical records.
============================================================ */
CREATE TABLE public.assignment_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  booking_id UUID NOT NULL
    REFERENCES public.bookings(id)
    ON DELETE CASCADE,
  alert_status assignment_alert_status NOT NULL DEFAULT 'open',
  issue_summary TEXT NOT NULL,

  issue_details JSONB NOT NULL DEFAULT '{"issues":[]}'::JSONB,
  source_type TEXT,
  source_id UUID,

  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  /* Allows only the recognized sources of an assignment check. */
  CONSTRAINT assignment_alerts_source_type_check
    CHECK (
      source_type IS NULL
      OR source_type IN (
        'vehicle',
        'chauffeur',
        'booking',
        'assignment'
      )
    ),

  /* Keeps alert status and resolved date consistent. */
  CONSTRAINT assignment_alerts_resolved_at_check
    CHECK (
      (alert_status = 'open' AND resolved_at IS NULL)
      OR
      (alert_status = 'resolved' AND resolved_at IS NOT NULL)
    )
);

-- Connects booking-created busy periods to their booking.
ALTER TABLE chauffeur_availability
ADD CONSTRAINT chauffeur_availability_booking_id_fkey
FOREIGN KEY (booking_id)
REFERENCES bookings(id)
ON DELETE CASCADE;

-- Booking-linked availability periods must always use the busy status.
ALTER TABLE chauffeur_availability
ADD CONSTRAINT chauffeur_availability_booking_status_check
CHECK (booking_id IS NULL OR status = 'busy');
--===================================================================
-- Indexes for faster searching
CREATE INDEX idx_bookings_client_id ON bookings(client_id); /* Find all bookings from one client */
CREATE INDEX idx_bookings_chauffeur_id ON bookings(chauffeur_id); /* Find all bookings assigned to one chauffeur */
CREATE INDEX idx_bookings_status ON bookings(status); /* Find pending/confirmed/cancelled bookings */
CREATE INDEX idx_bookings_pickup_date ON bookings(pickup_date); /* Find bookings for a date  */
CREATE INDEX bookings_vehicle_id_idx ON public.bookings(vehicle_id); /*  Improves queries that search or join bookings using the assigned vehicle.*/
/* Allows only one unresolved assignment alert per booking.

   A booking can have:
   - one current open alert;
   - multiple resolved historical alerts.
*/
CREATE UNIQUE INDEX assignment_alerts_one_open_per_booking
ON public.assignment_alerts (booking_id)
WHERE alert_status = 'open';

/* Speeds up loading open alerts ordered by their latest check. */
CREATE INDEX assignment_alerts_status_checked_index
ON public.assignment_alerts (
  alert_status,
  last_checked_at DESC
);

CREATE INDEX idx_vehicles_chauffeur_id ON vehicles(chauffeur_id); /* Find vehicles for a chauffeur */
CREATE UNIQUE INDEX vehicles_one_default_vehicle_per_chauffeur_idx ON public.vehicles(chauffeur_id) WHERE is_default_vehicle = TRUE;

CREATE INDEX idx_chauffeur_availability_chauffeur_id ON chauffeur_availability(chauffeur_id); /* Find availability for a chauffeur */

CREATE INDEX idx_chauffeur_availability_date ON chauffeur_availability(available_date); /* Find chauffeurs available on a date */

-- Speeds up requests belonging to one chauffeur.
create index if not exists chauffeur_change_requests_chauffeur_id_idx on public.chauffeur_change_requests(chauffeur_id);

-- Allows only one pending request per chauffeur and protected field.
create unique index if not exists chauffeur_change_requests_one_pending_field_idx on public.chauffeur_change_requests(chauffeur_id, field_name) where status = 'pending';

-- Finds booking-created busy periods quickly.
CREATE INDEX chauffeur_availability_booking_id_idx
ON chauffeur_availability(booking_id)
WHERE booking_id IS NOT NULL;

-- Prevents duplicate busy periods for the same booking.
CREATE UNIQUE INDEX chauffeur_availability_booking_period_unique
ON chauffeur_availability(
    booking_id,
    available_date,
    start_time,
    end_time
)
WHERE booking_id IS NOT NULL;
--=================================================================================================
-- Data validation rules
--=================================================================================================
ALTER TABLE bookings
ADD CONSTRAINT bookings_passengers_positive
CHECK (passengers > 0);

-----------------------------------------------------
-- Luggage cannot be negative
-----------------------------------------------------
ALTER TABLE bookings
ADD CONSTRAINT bookings_luggage_not_negative
CHECK (luggage >= 0);

-----------------------------------------------------
-- Booking duration must be between 15 minutes and 24 hours.
-----------------------------------------------------
ALTER TABLE bookings
ADD CONSTRAINT bookings_estimated_duration_minutes_check
CHECK (estimated_duration_minutes BETWEEN 15 AND 1440);

-----------------------------------------------------
-- Rating must be between 0 and 5
-----------------------------------------------------
ALTER TABLE chauffeurs
ADD CONSTRAINT chauffeurs_rating_range
CHECK (rating >= 0.0 AND rating <= 5.0);

-----------------------------------------------------
-- Vehicle must have seats
-----------------------------------------------------
ALTER TABLE vehicles
ADD CONSTRAINT vehicles_seats_positive
CHECK (seats > 0);

-----------------------------------------------------
-- Vehicle luggage capacity cannot be negative
-----------------------------------------------------
ALTER TABLE vehicles
ADD CONSTRAINT vehicles_luggage_capacity_not_negative
CHECK (luggage_capacity >= 0);

-----------------------------------------------------
-- Availability end time must be after start time
-----------------------------------------------------
ALTER TABLE chauffeur_availability
ADD CONSTRAINT chauffeur_availability_time_order
CHECK (end_time > start_time);

/*-----------------------------------------------------
  -- Prevents overlapping busy periods for the same chauffeur.
  -- Two busy rows cannot have the same chauffeur_id when their time ranges overlap.
  This part:
    chauffeur_id with =,
    tsrange(...) with &&
    means PostgreSQL rejects a row only when both conditions are true:

  The chauffeur IDs are equal AND the time ranges overlap

  For example:
    Same chauffeur + overlapping time  → rejected
    Same chauffeur + separate time     → allowed
    Different chauffeur + same time    → allowed
*/
-----------------------------------------------------
alter table public.chauffeur_availability
-- Adds a new database rule with this name.
add constraint chauffeur_availability_no_overlapping_busy
-- An exclusion constraint compares a new row with existing rows.
-- GiST allows PostgreSQL to efficiently compare UUID values and time ranges.
exclude using gist (
    -- Compare chauffeur IDs using equality =.
    chauffeur_id with =,
    -- Create a timestamp range by combining the date with the start and end times.
    -- Example: 2026-07-20 14:00 until 2026-07-20 15:00.
    tsrange(
        available_date + start_time,
        available_date + end_time,
        -- [ means the start is included.
        -- ) means the end is excluded.
        -- Therefore, 14:00–15:00 and 15:00–16:00 do not overlap.
        '[)'
    )
    -- && means that two timestamp ranges overlap.
    -- Example: 14:00–15:00 overlaps with 14:30–15:30.
    with &&
)
-- Apply this exclusion rule only to rows with the busy status.
where (status = 'busy');

-----------------------------------------------------
-- Vehicle validation year
-----------------------------------------------------
ALTER TABLE vehicles
ADD CONSTRAINT vehicles_year_valid
CHECK (vehicle_year IS NULL OR (vehicle_year >= 1980 AND vehicle_year <= 2100));

-----------------------------------------------------
-- Limits the public chauffeur biography.
-----------------------------------------------------
ALTER TABLE public.chauffeurs ADD CONSTRAINT chauffeurs_bio_length CHECK (bio IS NULL OR length(bio) <= 1000);

-----------------------------------------------------
-- Limits the stored Supabase Storage path.
-----------------------------------------------------
ALTER TABLE public.chauffeurs ADD CONSTRAINT chauffeurs_profile_photo_path_length CHECK (profile_photo_path IS NULL OR length(profile_photo_path) <= 500);

--=======================================================================================================================
-- COUNTRY BOUNDARIES
--
-- Stores geographic country borders used to split an international
-- Mapbox route into the distance travelled inside each country.
--
-- Example:
-- Amsterdam → Brussels
-- NL part → 118.313 km
-- BE part →  86.093 km
--=============================================================================================================================

CREATE TABLE IF NOT EXISTS public.country_boundaries (
    country_code TEXT PRIMARY KEY,
    country_name TEXT NOT NULL,

    /*
     * MultiPolygon supports countries consisting of several
     * separate geographic areas.
     *
     * SRID 4326 is the longitude/latitude coordinate system
     * used by Mapbox GeoJSON.
     */
    boundary extensions.geometry(MultiPolygon, 4326) NOT NULL,

    /*
     * Store the source of the geographic data so the boundary
     * remains traceable for maintenance and licensing.
     */
    source_name TEXT NOT NULL,
    source_license TEXT NOT NULL,
    source_reference TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT country_boundaries_country_code_valid
        CHECK (
            LENGTH(country_code) = 2
            AND country_code = UPPER(country_code)
        ),

    CONSTRAINT country_boundaries_name_not_empty
        CHECK (
            LENGTH(TRIM(country_name)) > 0
        )
);


/*
 * Spatial index used by PostGIS when finding which
 * country boundaries intersect a route.
 */
CREATE INDEX IF NOT EXISTS country_boundaries_boundary_idx
ON public.country_boundaries
USING gist (boundary);


/*
 * Country boundaries are server-side financial/geographic data.
 * Browser roles do not need direct access.
 */
ALTER TABLE public.country_boundaries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.country_boundaries FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.country_boundaries
TO service_role;

/* ====================================================================================================================
    Automatically update updated_at columns 

    1. This creates a PostgreSQL function named:update_updated_at_column
    2. The $$ is just a PostgreSQL way to mark the start and end of the function body.

    Function = what should happen
    Trigger = when it should happen
*/
CREATE OR REPLACE FUNCTION update_updated_at_column() /* If this function already exists, replace it with this new version.*/
RETURNS TRIGGER AS $$ -- trigger function, mot normal function that returns text, number, or table data.
BEGIN
  NEW.updated_at = now(); -- NEW = the new version of the existing row. OLD = the old version of the row.  Set updated_at to the current time before an existing row is updated.
  RETURN NEW; --Save this new changed version of the row.
END; --This ends the function logic.
$$ LANGUAGE plpgsql; -- PL/pgSQL is PostgreSQL’s procedural language, used for functions, triggers, loops, conditions, and database logic.

/* Apply updated_at trigger to clients */
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON clients -- before an existing row is updated. So it runs only when an existing row is updated.
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

/* Apply updated_at trigger to chauffeurs */
CREATE TRIGGER update_chauffeurs_updated_at
BEFORE UPDATE ON chauffeurs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

/* Apply updated_at trigger to vehicles */
CREATE TRIGGER update_vehicles_updated_at
BEFORE UPDATE ON vehicles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

/* Apply updated_at trigger to bookings */
CREATE TRIGGER update_bookings_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

/* Apply updated_at trigger to chauffeur availability */
CREATE TRIGGER update_chauffeur_availability_updated_at
BEFORE UPDATE ON chauffeur_availability
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Automatically updates updated_at when a change request is modified.
CREATE TRIGGER update_chauffeur_change_requests_updated_at
BEFORE UPDATE ON public.chauffeur_change_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

/* Automatically updates assignment_alerts.updated_at when an alert changes. */
CREATE TRIGGER update_assignment_alerts_updated_at
BEFORE UPDATE ON public.assignment_alerts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

/* Automatically updates pricing_profiles.updated_at. */
CREATE TRIGGER update_pricing_profiles_updated_at
BEFORE UPDATE ON public.pricing_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* Automatically updates pricing_rates.updated_at. */
CREATE TRIGGER update_pricing_rates_updated_at
BEFORE UPDATE ON public.pricing_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* Automatically updates tax_rules.updated_at. */
CREATE TRIGGER update_tax_rules_updated_at
BEFORE UPDATE ON public.tax_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* Automatically updates currency_rounding_rules.updated_at. */
CREATE TRIGGER update_currency_rounding_rules_updated_at
BEFORE UPDATE ON public.currency_rounding_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Automatically updates country_boundaries.updated_at.
CREATE TRIGGER update_country_boundaries_updated_at
BEFORE UPDATE ON public.country_boundaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

/* Automatically updates pricing_schedules.updated_at. */
CREATE TRIGGER update_pricing_schedules_updated_at
BEFORE UPDATE ON public.pricing_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/* Automatically updates pricing_schedule_overrides.updated_at. */
CREATE TRIGGER update_pricing_schedule_overrides_updated_at
BEFORE UPDATE ON public.pricing_schedule_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
--==============================================================================================================================
--==============================================================================================================================
-- ROUTE DISTANCE PER COUNTRY
--
-- Receives a Mapbox GeoJSON LineString and calculates how much
-- of the route lies inside each stored country boundary.
--
-- Example:
-- Amsterdam -> Brussels
-- NL -> 118.313 km
-- BE ->  86.093 km
--
-- This function only calculates geography.
-- VAT allocation is handled separately.
--===================================================================

CREATE OR REPLACE FUNCTION public.calculate_route_country_distances(
    p_route_geojson JSONB
)
RETURNS TABLE (
    country_code TEXT,
    country_name TEXT,
    distance_meters NUMERIC,
    distance_kilometers NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $function$

DECLARE
    v_route_geometry extensions.geometry;
BEGIN
    IF p_route_geojson IS NULL THEN
        RAISE EXCEPTION 'Route GeoJSON is required.';
    END IF;

    /*
     * Convert the Mapbox GeoJSON LineString to PostGIS geometry.
     * Mapbox coordinates use longitude/latitude, SRID 4326.
     */
    v_route_geometry :=
        extensions.ST_SetSRID(
            extensions.ST_GeomFromGeoJSON(p_route_geojson),
            4326
        );

    IF extensions.ST_GeometryType(v_route_geometry) <> 'ST_LineString' THEN
        RAISE EXCEPTION 'Route geometry must be a LineString.';
    END IF;


    /*
     * Find each country touched by the route, cut the route
     * by that country's boundary and measure the resulting line.
     */
    RETURN QUERY

    WITH route_parts AS (
        SELECT
            boundary.country_code,
            boundary.country_name,
            extensions.ST_CollectionExtract(
                extensions.ST_Intersection(
                    v_route_geometry,
                    boundary.boundary
                ),
                2
            ) AS route_part
        FROM public.country_boundaries boundary
        WHERE extensions.ST_Intersects(
            v_route_geometry,
            boundary.boundary
        )
    ),

    measured_parts AS (
        SELECT
            route_parts.country_code,
            route_parts.country_name,
            extensions.ST_Length(
                route_parts.route_part::extensions.geography
            ) AS measured_meters
        FROM route_parts
        WHERE NOT extensions.ST_IsEmpty(route_parts.route_part)
    )

    SELECT
        measured_parts.country_code,
        measured_parts.country_name,
        ROUND(measured_parts.measured_meters::NUMERIC, 2),
        ROUND((measured_parts.measured_meters / 1000)::NUMERIC, 3)

    FROM measured_parts
    WHERE measured_parts.measured_meters > 0
    ORDER BY measured_parts.country_code;
END;

$function$;


/*
 * Route-country calculations are server-side financial logic.
 * Browser roles cannot execute this function directly.
 */
REVOKE ALL
ON FUNCTION public.calculate_route_country_distances(JSONB)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.calculate_route_country_distances(JSONB)
TO service_role;

--============================create_pricing_profile_family=====================================================================
--==============================================================================================================================
/*
 * Pricing Version - Process 3
 *
 * Creates the first draft version of a completely new
 * pricing-profile family.
 *
 * Example:
 *
 * NL_NIGHT_STANDARD does not exist
 *          ↓
 * create_pricing_profile_family(...)
 *          ↓
 * NL_NIGHT_STANDARD V1
 * status = draft
 * rates = 0
 *
 * The administrator can then edit the draft through the
 * existing pricing-detail page before activating it.
 */
CREATE OR REPLACE FUNCTION public.create_pricing_profile_family(
    p_pricing_profile_code TEXT,
    p_pricing_profile_name TEXT,
    p_country_code TEXT,
    p_currency_code TEXT,
    p_created_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_pricing_profile_code TEXT;
    v_pricing_profile_name TEXT;
    v_country_code TEXT;
    v_currency_code TEXT;

    v_new_pricing_profile_id UUID;

BEGIN
    /*
     * Normalize values before validation and storage.
     *
     * Example:
     *
     * nl_night_standard → NL_NIGHT_STANDARD
     * nl                → NL
     * eur               → EUR
     */
    v_pricing_profile_code := UPPER(TRIM(p_pricing_profile_code));
    v_pricing_profile_name := TRIM(p_pricing_profile_name);
    v_country_code := UPPER(TRIM(p_country_code));
    v_currency_code := UPPER(TRIM(p_currency_code));


    /* All required values must be present. */
    IF p_pricing_profile_code IS NULL
        OR p_pricing_profile_name IS NULL
        OR p_country_code IS NULL
        OR p_currency_code IS NULL
        OR p_created_by_user_id IS NULL
        OR v_pricing_profile_code = ''
        OR v_pricing_profile_name = ''
        OR v_country_code = ''
        OR v_currency_code = ''
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing profile family information is incomplete.';
    END IF;

    /* Validate the stable pricing-profile code. */
    IF v_pricing_profile_code !~ '^[A-Z0-9_]+$' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The pricing profile code is invalid.';
    END IF;


    /* Validate country and currency codes. */
    IF v_country_code !~ '^[A-Z]{2}$'
        OR v_currency_code !~ '^[A-Z]{3}$'
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The country or currency code is invalid.';
    END IF;


    /*
     * Lock creation for this pricing-profile family.
     *
     * This prevents two administrators from creating the
     * same family at the same moment.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_pricing_profile_code, 0)
    );


    /*
     * A pricing-profile code identifies one complete family.
     *
     * If any version already exists, this is not a new family.
     */
    IF EXISTS (
        SELECT 1
        FROM public.pricing_profiles AS pricing_profile
        WHERE pricing_profile.pricing_profile_code = v_pricing_profile_code
    ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23505',
                MESSAGE = 'This pricing profile family already exists.';
    END IF;

    /*
    * Create Version 1 as a draft.
    *
    * New pricing families start with a quote validity of
    * 20 minutes. The administrator may edit this while
    * the profile remains a draft.
    */
    INSERT INTO public.pricing_profiles (
        pricing_profile_code,
        pricing_profile_name,
        pricing_profile_version,
        country_code,
        currency_code,
        quote_validity_minutes,
        status,
        effective_from,
        created_by_user_id
    )
    VALUES (
        v_pricing_profile_code,
        v_pricing_profile_name,
        1,
        v_country_code,
        v_currency_code,
        20,
        'draft',
        NOW(),
        p_created_by_user_id
    )
    RETURNING id
    INTO v_new_pricing_profile_id;

    /*
     * Create an editable rates record.
     *
     * New families begin with zero monetary values.
     * The administrator must configure the real values
     * before activation.
     */
    INSERT INTO public.pricing_rates (
        pricing_profile_id,
        base_fare_excluding_vat,
        distance_rate_per_km_excluding_vat,
        duration_rate_per_minute_excluding_vat,
        minimum_fare_excluding_vat
    )
    VALUES (
        v_new_pricing_profile_id,
        0,
        0,
        0,
        0
    );


    /* Return the UUID needed for redirecting to the draft page. */
    RETURN v_new_pricing_profile_id;

END;
$$;


/* ============================================================
FUNCTION PERMISSIONS

Browser roles cannot create financial configuration directly.

The Next.js server action will first verify the administrator
and then call this function through supabaseAdmin.
============================================================ */

REVOKE ALL
ON FUNCTION public.create_pricing_profile_family(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    UUID
)
FROM PUBLIC, anon, authenticated;


GRANT EXECUTE
ON FUNCTION public.create_pricing_profile_family(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    UUID
)
TO service_role;


COMMENT ON FUNCTION public.create_pricing_profile_family(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    UUID
)
IS 'Creates Version 1 of a new pricing-profile family as an editable draft with zero initial rates.';

--============================Pricing profile draft management==================================================================
--==============================================================================================================================
/*
 * Pricing Version - Pricing lifecycle correction
 *
 * Prevents multiple draft versions from being created for the
 * same pricing-profile family.
 *
 * New rule:
 *
 * 0 drafts → create a new draft
 * 1 draft  → return the existing draft
 * 2+ drafts → raise a configuration error
 *
 * The family advisory lock keeps this operation safe when two
 * administrators request a draft at nearly the same moment.
 */

CREATE OR REPLACE FUNCTION public.create_pricing_profile_draft(
    p_source_pricing_profile_id UUID,
    p_created_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* Stores the pricing-profile code before the family lock. */
    v_pricing_profile_code TEXT;

    /* Stores the complete active source profile. */
    v_source_profile public.pricing_profiles%ROWTYPE;

    /* Stores the rates connected to the source profile. */
    v_source_rate public.pricing_rates%ROWTYPE;

    /* Number of existing drafts in this pricing family. */
    v_draft_count INTEGER;

    /* Existing draft UUID when exactly one draft already exists. */
    v_existing_draft_profile_id UUID;

    /* Stores the next available version number. */
    v_next_version INTEGER;

    /* Stores the UUID generated for a new draft profile. */
    v_new_draft_profile_id UUID;
BEGIN
    /* Both IDs are required. */
    IF p_source_pricing_profile_id IS NULL
        OR p_created_by_user_id IS NULL
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Source pricing profile ID and administrator user ID are required.';
    END IF;

    /*
     * Load the pricing-profile family code first.
     */
    SELECT pricing_profile.pricing_profile_code
    INTO v_pricing_profile_code
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_source_pricing_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The source pricing profile could not be found.';
    END IF;

    /*
     * Lock the complete pricing family.
     *
     * Example:
     *
     * Request 1 creates Version 2 draft.
     *
     * Request 2 waits for Request 1.
     * After the lock is released, Request 2 finds Version 2
     * and returns that existing draft instead of creating Version 3.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_pricing_profile_code, 0)
    );

    /* Reload and lock the selected source profile. */
    SELECT pricing_profile.*
    INTO v_source_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_source_pricing_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The source pricing profile could not be found.';
    END IF;

    /*
     * New drafts may only be requested from the active version.
     */
    IF v_source_profile.status <> 'active' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'A draft pricing version can only be created from an active pricing profile.';
    END IF;

    /*
     * Check whether this pricing family already contains a draft.
     *
     * Normal lifecycle:
     *
     * 0 drafts → create one
     * 1 draft  → reuse it
     * 2+ drafts → existing data must be corrected
     */
    SELECT COUNT(*)
    INTO v_draft_count
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.pricing_profile_code =
        v_source_profile.pricing_profile_code
      AND pricing_profile.status = 'draft';

    IF v_draft_count > 1 THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Multiple draft pricing versions already exist for this pricing-profile family.';
    END IF;

    /*
     * If one draft already exists, return its UUID.
     *
     * The Next.js server action can use the returned UUID exactly
     * as before and redirect the administrator to that draft.
     */
    IF v_draft_count = 1 THEN
        SELECT pricing_profile.id
        INTO v_existing_draft_profile_id
        FROM public.pricing_profiles AS pricing_profile
        WHERE pricing_profile.pricing_profile_code =
            v_source_profile.pricing_profile_code
          AND pricing_profile.status = 'draft';

        RETURN v_existing_draft_profile_id;
    END IF;

    /*
     * No draft exists, so load the active profile's rates.
     */
    SELECT pricing_rate.*
    INTO v_source_rate
    FROM public.pricing_rates AS pricing_rate
    WHERE pricing_rate.pricing_profile_id = v_source_profile.id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The active pricing profile does not contain a pricing-rates record.';
    END IF;

    /*
     * Calculate the next version number across the complete family.
     */
    SELECT COALESCE(MAX(pricing_profile.pricing_profile_version), 0) + 1
    INTO v_next_version
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.pricing_profile_code =
        v_source_profile.pricing_profile_code;


    /*
     * Create the new draft profile.
     */
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
        created_by_user_id,
        activated_by_user_id,
        archived_by_user_id,
        activated_at,
        archived_at
    )
    VALUES (
        v_source_profile.pricing_profile_code,
        v_source_profile.pricing_profile_name,
        v_next_version,
        v_source_profile.country_code,
        v_source_profile.currency_code,
        v_source_profile.quote_validity_minutes,
        'draft',
        NOW(),
        NULL,
        p_created_by_user_id,
        NULL,
        NULL,
        NULL,
        NULL
    )
    RETURNING id
    INTO v_new_draft_profile_id;

    /*
     * Copy the active profile's monetary values to the new draft.
     */
    INSERT INTO public.pricing_rates (
        pricing_profile_id,
        base_fare_excluding_vat,
        distance_rate_per_km_excluding_vat,
        duration_rate_per_minute_excluding_vat,
        minimum_fare_excluding_vat
    )
    VALUES (
        v_new_draft_profile_id,
        v_source_rate.base_fare_excluding_vat,
        v_source_rate.distance_rate_per_km_excluding_vat,
        v_source_rate.duration_rate_per_minute_excluding_vat,
        v_source_rate.minimum_fare_excluding_vat
    );

    /* Return the UUID needed for the Next.js redirect. */
    RETURN v_new_draft_profile_id;
END;
$$;


/* Browser roles cannot perform this financial operation directly. */
REVOKE ALL
ON FUNCTION public.create_pricing_profile_draft(UUID, UUID)
FROM PUBLIC, anon, authenticated;


/* Trusted Next.js server operations use service_role. */
GRANT EXECUTE
ON FUNCTION public.create_pricing_profile_draft(UUID, UUID)
TO service_role;


COMMENT ON FUNCTION public.create_pricing_profile_draft(UUID, UUID)
IS 'Returns the existing draft for a pricing family or atomically creates one when no draft exists.';

/*  --============================================================================================================================
    -- Pricing Version - Pricing lifecycle correction
    ==============================================================================================================================*/
/*
 * Pricing Version - Pricing lifecycle correction
 *
 * Cancels one unfinished pricing-profile draft.
 *
 * Safety rules:
 *
 * - only status = draft may be deleted;
 * - active and archived versions can never be cancelled;
 * - a draft referenced by a journey quote cannot be deleted;
 * - pricing_rates are removed automatically through ON DELETE CASCADE;
 * - the complete pricing family is locked during cancellation.
 */

CREATE OR REPLACE FUNCTION public.cancel_pricing_profile_draft( p_pricing_profile_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_pricing_profile public.pricing_profiles%ROWTYPE;
BEGIN
    /* A pricing-profile ID is required. */
    IF p_pricing_profile_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing profile ID is required.';
    END IF;


    /*
     * Load the profile first so we know which pricing family
     * must be locked.
     */
    SELECT pricing_profile.*
    INTO v_pricing_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_pricing_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing profile could not be found.';
    END IF;


    /* Lock the complete pricing-profile family. */
    PERFORM pg_advisory_xact_lock(hashtextextended(v_pricing_profile.pricing_profile_code, 0));

    /*
     * Reload and lock the selected profile after obtaining the family lock.
     */
    SELECT pricing_profile.*
    INTO v_pricing_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_pricing_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing profile could not be found.';
    END IF;


    /* Only unfinished drafts may be cancelled. */
    IF v_pricing_profile.status <> 'draft' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only a draft pricing profile can be cancelled.';
    END IF;

    /*
     * A pricing version already referenced by a journey quote
     * must remain available for financial history.
     *
     * The foreign key also uses ON DELETE RESTRICT, but this
     * explicit check gives a clearer financial-domain error.
     */
    IF EXISTS (
        SELECT 1
        FROM public.journey_quotes AS journey_quote
        WHERE journey_quote.pricing_profile_id = p_pricing_profile_id
    ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23503',
                MESSAGE = 'This pricing draft is already referenced by a journey quote and cannot be cancelled.';
    END IF;


    /*
     * Delete the draft profile.
     *
     * Its pricing_rates row is deleted automatically because
     * pricing_rates.pricing_profile_id uses ON DELETE CASCADE.
     */
    DELETE FROM public.pricing_profiles
    WHERE id = p_pricing_profile_id;

    RETURN p_pricing_profile_id;
END;
$$;

/* Browser roles cannot cancel financial configuration directly. */
REVOKE ALL
ON FUNCTION public.cancel_pricing_profile_draft(UUID)
FROM PUBLIC, anon, authenticated;


/* Trusted Next.js server operations use service_role. */
GRANT EXECUTE
ON FUNCTION public.cancel_pricing_profile_draft(UUID)
TO service_role;

COMMENT ON FUNCTION public.cancel_pricing_profile_draft(UUID)
IS 'Safely deletes one unfinished pricing-profile draft while preserving active, archived and quoted financial versions.';

/*  --============================================================================================================================
    --VOYA TAXI — UPDATE PRICING PROFILE DRAFT
    ==============================================================================================================================
    PURPOSE
   Updates editable values belonging to one draft pricing profile.

   Editable:
   - pricing profile name
   - quote validity
   - base fare
   - distance rate per kilometre
   - duration rate per minute
   - minimum fare

   Not editable here:
   - pricing profile code
   - version
   - country
   - currency
   - status
   - VAT rule
   - currency rounding rule

   IMPORTANT RULE

       draft     → editable
       active    → read-only
       archived  → read-only

   The profile and pricing_rates updates happen inside the same
   PostgreSQL function call.

   Therefore:

       update pricing_profiles
                +
       update pricing_rates
                ↓
       both succeed or both are rolled back
============================================================ */
/* ============================================================
   UPDATE PRICING PROFILE DRAFT FUNCTION
============================================================ */

CREATE OR REPLACE FUNCTION public.update_pricing_profile_draft(
    p_pricing_profile_id UUID,
    p_pricing_profile_name TEXT,
    p_quote_validity_minutes INTEGER,
    p_base_fare_excluding_vat NUMERIC,
    p_distance_rate_per_km_excluding_vat NUMERIC,
    p_duration_rate_per_minute_excluding_vat NUMERIC,
    p_minimum_fare_excluding_vat NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* Stores the draft profile while it is being updated. */
    v_pricing_profile public.pricing_profiles%ROWTYPE;
BEGIN
    /* The profile ID is required. */
    IF p_pricing_profile_id IS NULL THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing profile ID is required.';
    END IF;


    /*
     * Lock the pricing profile during the update.
     *
     * This prevents two simultaneous save requests from changing
     * the same draft at exactly the same time.
     */
    SELECT pricing_profile.*
    INTO v_pricing_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_pricing_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing profile could not be found.';
    END IF;


    /*
     * Only draft profiles may be edited.
     *
     * Active and archived financial versions are historical records and must remain unchanged.
     * Even if somebody somehow submits an active Version 1 ID manually, PostgreSQL itself refuses the update. So our protection will eventually be:
        UI hides edit form
                +
        server action checks admin
                +
        PostgreSQL checks status = draft
                +
        database constraints validate the values
     */
    IF v_pricing_profile.status <> 'draft' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only draft pricing profiles can be edited.';
    END IF;


    /* Profile name must contain real text. */
    IF p_pricing_profile_name IS NULL
        OR LENGTH(TRIM(p_pricing_profile_name)) = 0
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing profile name is required.';
    END IF;


    /* Quote validity must remain between 1 minute and 24 hours. */
    IF p_quote_validity_minutes IS NULL
        OR p_quote_validity_minutes < 1
        OR p_quote_validity_minutes > 1440
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Quote validity must be between 1 and 1440 minutes.';
    END IF;


    /* Monetary values cannot be missing or negative. */
    IF p_base_fare_excluding_vat IS NULL
        OR p_distance_rate_per_km_excluding_vat IS NULL
        OR p_duration_rate_per_minute_excluding_vat IS NULL
        OR p_minimum_fare_excluding_vat IS NULL
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'All pricing rates are required.';
    END IF;

    IF p_base_fare_excluding_vat < 0
        OR p_distance_rate_per_km_excluding_vat < 0
        OR p_duration_rate_per_minute_excluding_vat < 0
        OR p_minimum_fare_excluding_vat < 0
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing rates cannot be negative.';
    END IF;


    /*
     * Update editable profile information.
     *
     * updated_at is handled automatically by the existing
     * pricing_profiles trigger.
     */
    UPDATE public.pricing_profiles
    SET
        pricing_profile_name = TRIM(p_pricing_profile_name),
        quote_validity_minutes = p_quote_validity_minutes
    WHERE id = p_pricing_profile_id;


    /*
     * Update the monetary rates belonging to this exact
     * pricing-profile version.
     *
     * updated_at is handled automatically by the existing
     * pricing_rates trigger.
     */
    UPDATE public.pricing_rates
    SET
        base_fare_excluding_vat = p_base_fare_excluding_vat,
        distance_rate_per_km_excluding_vat = p_distance_rate_per_km_excluding_vat,
        duration_rate_per_minute_excluding_vat = p_duration_rate_per_minute_excluding_vat,
        minimum_fare_excluding_vat = p_minimum_fare_excluding_vat
    WHERE pricing_profile_id = p_pricing_profile_id;


    /*
     * A draft created by our normal workflow must always contain
     * one pricing_rates row.

     * If no rate row was updated, stop the operation instead of
     * leaving an incomplete financial configuration.
     */
    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'Pricing rates for this draft could not be found.';
    END IF;


    /* Return the same profile ID for redirecting after Save. */
    RETURN p_pricing_profile_id;
END;
$$;


/* ============================================================
   FUNCTION PERMISSIONS

   The browser must not call this financial function directly.

   The Next.js server action will first execute:

       const adminUser = await requireAdminUser();

   Only after the administrator has been verified will
   supabaseAdmin call this PostgreSQL function.
============================================================ */

REVOKE ALL
ON FUNCTION public.update_pricing_profile_draft(
    UUID,
    TEXT,
    INTEGER,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.update_pricing_profile_draft(
    UUID,
    TEXT,
    INTEGER,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC
)
TO service_role;


COMMENT ON FUNCTION public.update_pricing_profile_draft(
    UUID,
    TEXT,
    INTEGER,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC
)
IS 'Atomically updates the editable profile and monetary rates of one draft pricing version.';

/* ============================VOYA TAXI — ACTIVATE PRICING PROFILE DRAFT===============================================================
PURPOSE

Activates one draft pricing version.

The function supports two cases:

1. Existing pricing family
   - an active version already exists;
   - the active version is archived;
   - the draft becomes active.

Example:
   Version 2 → active
   Version 3 → draft

Admin activates Version 3:
   Version 2 → archived
   Version 3 → active

2. Brand-new pricing family
   - no active version exists yet;
   - Version 1 draft becomes the first active version.

Example:   Version 1 → draft

Admin activates Version 1:   Version 1 → active

TIMELINE RULE
When replacing an existing active version, both lifecycle changes use exactly the same database timestamp.
Example:
   Version 2 ----------------|
                             |---------------- Version 3
                     same activation moment

The draft creation date is NOT the date customers started using the new prices.
Therefore, when a draft becomes active:  effective_from = actual activation timestamp
When an older active version exists, it receives: effective_until = same activation timestamp

SAFETY
The complete activation operation is atomic.
If any validation or database operation fails, PostgreSQL rolls back the complete transition.
A pricing-profile family can have only one active version.
===================================================================================================== */

CREATE OR REPLACE FUNCTION public.activate_pricing_profile_draft(
    p_pricing_profile_id UUID,
    p_activated_by_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    /* Stores the pricing-profile code before locking the family. */
    v_pricing_profile_code TEXT;

    /* Stores the draft that will become active. */
    v_draft_profile public.pricing_profiles%ROWTYPE;

    /* Stores the active predecessor when one exists. */
    v_active_profile public.pricing_profiles%ROWTYPE;

    /*
     * NOW() stays the same throughout this transaction.
     *
     * When an old active version exists, both versions therefore
     * receive exactly the same transition timestamp.
     */
    v_activation_time TIMESTAMPTZ := NOW();

    /* Used to verify that the draft contains pricing rates. */
    v_rate_exists BOOLEAN;

BEGIN
    /* Both IDs are required. */
    IF p_pricing_profile_id IS NULL
        OR p_activated_by_user_id IS NULL
    THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Pricing profile ID and administrator user ID are required.';
    END IF;

    /* Load the profile-family code. */
    SELECT pricing_profile.pricing_profile_code
    INTO v_pricing_profile_code
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_pricing_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing profile could not be found.';
    END IF;

    /*
     * Lock the complete pricing family.
     *
     * This prevents two administrators from activating competing
     * versions of the same family at the same moment.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_pricing_profile_code, 0)
    );

    /* Reload and lock the selected draft. */
    SELECT pricing_profile.*
    INTO v_draft_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.id = p_pricing_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The pricing profile could not be found.';
    END IF;

    /* Only draft profiles may be activated. */
    IF v_draft_profile.status <> 'draft' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'Only a draft pricing profile can be activated.';
    END IF;

    /* A complete pricing-rates record must exist. */
    SELECT EXISTS (
        SELECT 1
        FROM public.pricing_rates AS pricing_rate
        WHERE pricing_rate.pricing_profile_id = v_draft_profile.id
    )
    INTO v_rate_exists;

    IF NOT v_rate_exists THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '22023',
                MESSAGE = 'The draft pricing profile does not contain pricing rates.';
    END IF;

    /*
     * Find the currently active version of this family.
     *
     * A brand-new family such as NL_NIGHT_STANDARD V1 does not
     * have an active predecessor yet. That is valid.
     */
    SELECT pricing_profile.*
    INTO v_active_profile
    FROM public.pricing_profiles AS pricing_profile
    WHERE pricing_profile.pricing_profile_code =
        v_draft_profile.pricing_profile_code
      AND pricing_profile.status = 'active'
    FOR UPDATE;

    /*
     * When an active predecessor exists, validate and archive it.
     *
     * When none exists, this complete block is skipped and the
     * new family's first draft is activated directly.
     */
    IF FOUND THEN

        /* Old and new versions must belong to the same market. */
        IF v_active_profile.country_code <> v_draft_profile.country_code
            OR v_active_profile.currency_code <> v_draft_profile.currency_code
        THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '22023',
                    MESSAGE = 'The draft pricing market does not match the active pricing market.';
        END IF;

        /* Preserve a valid effective period for the old version. */
        IF v_activation_time <= v_active_profile.effective_from THEN
            RAISE EXCEPTION
                USING
                    ERRCODE = '22023',
                    MESSAGE = 'The activation time must be later than the active profile effective start.';
        END IF;

        /*
         * Archive the current active version before activating
         * the replacement.
         */
        UPDATE public.pricing_profiles
        SET
            status = 'archived',
            effective_until = v_activation_time,
            archived_by_user_id = p_activated_by_user_id,
            archived_at = v_activation_time
        WHERE id = v_active_profile.id;

    END IF;


    /*
     * Activate the draft.
     *
     * This works both for:
     *
     * - Version 1 of a brand-new family;
     * - a replacement version of an existing family.
     */
    UPDATE public.pricing_profiles
    SET
        status = 'active',
        effective_from = v_activation_time,
        effective_until = NULL,
        activated_by_user_id = p_activated_by_user_id,
        archived_by_user_id = NULL,
        activated_at = v_activation_time,
        archived_at = NULL
    WHERE id = v_draft_profile.id;


    /* Return the activated profile UUID for the Next.js redirect. */
    RETURN v_draft_profile.id;

END;
$$;


/* Browser roles cannot perform this financial transition. */
REVOKE ALL
ON FUNCTION public.activate_pricing_profile_draft(UUID, UUID)
FROM PUBLIC, anon, authenticated;


/* Trusted Next.js server operations use service_role. */
GRANT EXECUTE
ON FUNCTION public.activate_pricing_profile_draft(UUID, UUID)
TO service_role;


COMMENT ON FUNCTION public.activate_pricing_profile_draft(UUID, UUID)
IS 'Activates one draft pricing profile and archives the previous active version when one exists.';

--============================Default vehicle management=======================================================================================
/* ==============================================================================================
   SET DEFAULT VEHICLE

   Marks one vehicle as the chauffeur's default vehicle.

   Safety:
   - Confirms that the selected vehicle exists.
   - Only an operationally available vehicle can be selected.
   - Locks the chauffeur row so two simultaneous requests for
     the same chauffeur cannot create a race condition.
   - Removes the previous default before setting the new one.
   - The partial unique index remains the final protection.

   serializes default-vehicle changes for the same chauffeur:
   - The first request locks the chauffeur.
   - It removes the old default and sets the new one.
   - The second request waits.
   - After the first finishes, the second safely performs its complete change.
============================================================ */

CREATE OR REPLACE FUNCTION public.set_default_vehicle(
    p_vehicle_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    -- Stores the chauffeur who owns the selected vehicle.
    v_chauffeur_id UUID;

    -- Stores the current operational status of the vehicle.
    v_vehicle_status public.vehicle_operational_status;
BEGIN
    /* Load the selected vehicle. */
    SELECT
        vehicle.chauffeur_id,
        vehicle.vehicle_status
    INTO
        v_chauffeur_id,
        v_vehicle_status
    FROM public.vehicles AS vehicle
    WHERE vehicle.id = p_vehicle_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The selected vehicle could not be found.';
    END IF;

    /* An unavailable vehicle cannot become the default vehicle. */
    IF v_vehicle_status <> 'available' THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0001',
                MESSAGE = 'Only an available vehicle can be set as the default vehicle.';
    END IF;

    /*
      Lock this chauffeur during the change.

      Two different vehicle rows belonging to the same chauffeur
      could otherwise be changed at almost the same moment.
    */
    PERFORM 1
    FROM public.chauffeurs AS chauffeur
    WHERE chauffeur.id = v_chauffeur_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The chauffeur connected to this vehicle could not be found.';
    END IF;

    /* Remove the previous default vehicle for this chauffeur. */
    UPDATE public.vehicles
    SET is_default_vehicle = FALSE
    WHERE chauffeur_id = v_chauffeur_id
      AND id <> p_vehicle_id
      AND is_default_vehicle = TRUE;

    /* Set the selected vehicle as the new default. */
    UPDATE public.vehicles
    SET is_default_vehicle = TRUE
    WHERE id = p_vehicle_id
      AND chauffeur_id = v_chauffeur_id;

    RETURN TRUE;
END;
$$;

/*
  Only the server-side Supabase service-role client should call
  this administrative function.
*/
REVOKE ALL
ON FUNCTION public.set_default_vehicle(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.set_default_vehicle(UUID)
TO service_role;

/* ============================================================
   ENSURE SINGLE VEHICLE DEFAULT

   Automatically marks a chauffeur's only vehicle as default,
   but only when that vehicle is operationally available.

   Rules:
   - No vehicles: no action.
   - One available vehicle: make it default.
   - One unavailable vehicle: remove its default status.
   - Multiple vehicles: do not choose automatically.
============================================================ */

CREATE OR REPLACE FUNCTION public.ensure_single_vehicle_default(
    p_chauffeur_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_vehicle_count INTEGER;
    v_only_vehicle_id UUID;
    v_only_vehicle_status public.vehicle_operational_status;
BEGIN
    /*
     * Locks this chauffeur while the default-vehicle rule is
     * evaluated and applied.
     */
    PERFORM 1
    FROM public.chauffeurs AS chauffeur
    WHERE chauffeur.id = p_chauffeur_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING
                ERRCODE = 'P0002',
                MESSAGE = 'The selected chauffeur could not be found.';
    END IF;

    /* Counts every vehicle belonging to the chauffeur. */
    SELECT COUNT(*)
    INTO v_vehicle_count
    FROM public.vehicles AS vehicle
    WHERE vehicle.chauffeur_id = p_chauffeur_id;

    /*
     * With zero or multiple vehicles, the system does not choose
     * a default automatically.
     */
    IF v_vehicle_count <> 1 THEN
        RETURN FALSE;
    END IF;

    /* Loads the chauffeur's only vehicle. */
    SELECT
        vehicle.id,
        vehicle.vehicle_status
    INTO
        v_only_vehicle_id,
        v_only_vehicle_status
    FROM public.vehicles AS vehicle
    WHERE vehicle.chauffeur_id = p_chauffeur_id
    LIMIT 1;

    /*
     * The only vehicle becomes default only when it is available.
     * Otherwise, its default status is removed.
     */
    UPDATE public.vehicles
    SET is_default_vehicle =
        (v_only_vehicle_status = 'available')
    WHERE id = v_only_vehicle_id;

    RETURN v_only_vehicle_status = 'available';
END;
$$;

/*
 * Only trusted server-side code may call this administrative
 * database function.
 */
REVOKE ALL
ON FUNCTION public.ensure_single_vehicle_default(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.ensure_single_vehicle_default(UUID)
TO service_role;
--===========================Automatic default vehicle sync========================================
/* ============================================================
   AUTOMATIC DEFAULT-VEHICLE SYNCHRONIZATION

   Keeps default vehicles consistent when a vehicle is:

   - created;
   - moved to another chauffeur;
   - made available or unavailable;
   - deleted.

   The existing ensure_single_vehicle_default(...) function
   performs the actual single-vehicle check.
============================================================ */


/* ------------------------------------------------------------
   BEFORE CHANGE

   Prevents a vehicle from remaining default when:

   - it moves to another chauffeur;
   - it becomes operationally unavailable.
------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.prepare_vehicle_default_before_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    /*
     * An unavailable vehicle may never remain or become the
     * chauffeur's default vehicle.
     */
    IF NEW.vehicle_status <> 'available' THEN
        NEW.is_default_vehicle := FALSE;
    END IF;

    /*
     * A vehicle moved to another chauffeur must not silently
     * become that chauffeur's default vehicle.
     */
    IF TG_OP = 'UPDATE' THEN
        IF OLD.chauffeur_id IS DISTINCT FROM NEW.chauffeur_id THEN
            NEW.is_default_vehicle := FALSE;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    vehicles_prepare_default_before_change
ON public.vehicles;

CREATE TRIGGER vehicles_prepare_default_before_change
BEFORE INSERT OR UPDATE OF
    chauffeur_id,
    vehicle_status,
    is_default_vehicle
ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.prepare_vehicle_default_before_change();


/* ------------------------------------------------------------
   AFTER CHANGE

   Rechecks the affected chauffeur or chauffeurs after the
   vehicle change has been completed.
------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.reconcile_vehicle_defaults_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    /*
     * After creating a vehicle, check whether it is the
     * chauffeur's only available vehicle.
     */
    IF TG_OP = 'INSERT' THEN
        PERFORM public.ensure_single_vehicle_default(
            NEW.chauffeur_id
        );

        RETURN NEW;
    END IF;

    /*
     * After deleting a vehicle, recheck the chauffeur who
     * previously owned it.
     */
    IF TG_OP = 'DELETE' THEN
        PERFORM public.ensure_single_vehicle_default(
            OLD.chauffeur_id
        );

        RETURN OLD;
    END IF;

    /*
     * When ownership changes, both chauffeurs must be checked:
     *
     * - the old chauffeur may now have only one vehicle;
     * - the new chauffeur may now have their first vehicle.
     *
     * UUID order gives both chauffeur locks a consistent order
     * and reduces the risk of concurrent-transfer deadlocks.
     */
    IF OLD.chauffeur_id IS DISTINCT FROM NEW.chauffeur_id THEN
        IF OLD.chauffeur_id::TEXT < NEW.chauffeur_id::TEXT THEN
            PERFORM public.ensure_single_vehicle_default(
                OLD.chauffeur_id
            );

            PERFORM public.ensure_single_vehicle_default(
                NEW.chauffeur_id
            );
        ELSE
            PERFORM public.ensure_single_vehicle_default(
                NEW.chauffeur_id
            );

            PERFORM public.ensure_single_vehicle_default(
                OLD.chauffeur_id
            );
        END IF;

        RETURN NEW;
    END IF;

    /*
     * When the vehicle's operational status changes, recheck
     * the chauffeur's remaining/default vehicle situation.
     */
    IF OLD.vehicle_status IS DISTINCT FROM NEW.vehicle_status THEN
        PERFORM public.ensure_single_vehicle_default(
            NEW.chauffeur_id
        );
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    vehicles_reconcile_defaults_after_change
ON public.vehicles;

CREATE TRIGGER vehicles_reconcile_defaults_after_change
AFTER INSERT OR DELETE OR UPDATE OF
    chauffeur_id,
    vehicle_status
ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_vehicle_defaults_after_change();


/*
 * These trigger functions are internal database functions.
 * They should not be called directly by website users.
 */
REVOKE ALL
ON FUNCTION public.prepare_vehicle_default_before_change()
FROM PUBLIC, anon, authenticated;

REVOKE ALL
ON FUNCTION public.reconcile_vehicle_defaults_after_change()
FROM PUBLIC, anon, authenticated;
--=================================================================================================
/* Enable Row Level Security */
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE chauffeurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chauffeur_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chauffeur_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_alerts ENABLE ROW LEVEL SECURITY;

/*======================================================================*/
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    chauffeur_id UUID REFERENCES chauffeurs(id) ON DELETE SET NULL,
    -- Stores only a supported Voya Taxi interface language.
    preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'nl', 'ar', 'tr', 'fa')),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT user_profiles_chauffeur_role_check
    CHECK (
      (role = 'admin' AND chauffeur_id IS NULL)
      OR
      (role = 'chauffeur' AND chauffeur_id IS NOT NULL)
    )
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile"
ON user_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

--===================================================================
/* create a function to get data from enumrated types */
-- you can call a function in his way: SELECT get_enum_values('booking_status');
-- in supasql:  const { data: availabilityStatuses, error } = await supabaseAdmin.rpc( "get_enum_values", { p_enum_type_name: "availability_status",});
/* Get enum values by enum type name
------------------------------------------------------------------*/
CREATE OR REPLACE FUNCTION public.get_enum_values(p_enum_type_name text)
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    array_agg(e.enumlabel::text ORDER BY e.enumsortorder),
    ARRAY[]::text[]
  )
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE t.typname = p_enum_type_name
    AND n.nspname = 'public';
$$;
/*===========================================================
=============================================================*/
DO $$
BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'chauffeur');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


/* ============================================================
   FUNCTION PURPOSE

   This function updates the chauffeur and status of one booking.
   It also keeps chauffeur_availability synchronized:
   - accepted, confirmed or completed:
       create a linked busy period
   - pending, rejected or cancelled:
       remove the linked busy period
   Everything runs inside one PostgreSQL transaction.
   If one part fails, PostgreSQL reverses all changes made by
   this function. This prevents partially updated booking data.
----------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.update_booking_admin_assignment(
    p_booking_id UUID,
    p_chauffeur_id UUID,
    p_vehicle_id UUID,
    p_status public.booking_status
)
/*-------------------------------
    RETURNS VOID
    it does not return booking data. We mainly inspect whether an error occurred:
    const { error } = await supabaseAdmin.rpc(...);
    When successful:error = null
--------------------------------*/
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    /* -----------------------------------------------------------
       LOCAL VARIABLES
       These variables temporarily store information belonging
       to the selected booking.
       v_ means "variable".
       They exist only while this function is running.
    -----------------------------------------------------------*/

    -- Stores the booking pickup date.
    v_pickup_date DATE;
    -- Stores the booking pickup time.
    v_pickup_time TIME WITHOUT TIME ZONE;
    -- Stores the Mapbox-calculated journey duration.
    v_duration_minutes INTEGER;
    -- Stores the calculated complete end date and time.
    v_end_at TIMESTAMP WITHOUT TIME ZONE;

BEGIN
    /* -----------------------------------------------------------
       SECTION 1: READ AND LOCK THE BOOKING
       SELECT reads the booking information from public.bookings.
       INTO places the selected database values inside the local
       variables declared above.
       FOR UPDATE locks this booking row until the transaction  finishes.
       This prevents two admin actions from changing the same  booking simultaneously.
    ----------------------------------------------------------- */
    SELECT
        pickup_date,
        pickup_time,
        estimated_duration_minutes
    INTO
        v_pickup_date,
        v_pickup_time,
        v_duration_minutes
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    /* -----------------------------------------------------------
       SECTION 2: CHECK THAT THE BOOKING EXISTS
       FOUND is a special PostgreSQL variable.
       FOUND is TRUE when the previous SELECT found a booking.
       FOUND is FALSE when no booking matched p_booking_id.
       RAISE EXCEPTION stops the function immediately.
       P0002 means that requested data was not found.
    ----------------------------------------------------------- */
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking was not found.'
        USING ERRCODE = 'P0002';
    END IF;

    /* -----------------------------------------------------------
       SECTION 3: REQUIRE A CHAUFFEUR FOR ACTIVE BOOKINGS
       An accepted, confirmed or completed booking must have an  assigned chauffeur.
       IN checks whether p_status matches one of the listed booking statuses.
       IS NULL checks whether no chauffeur was supplied.
       Both conditions must be TRUE before the exception occurs:
       active booking status  AND no assigned chauffeur
    ----------------------------------------------------------- */
    IF p_status IN ('accepted', 'confirmed', 'completed')
        AND (p_chauffeur_id IS NULL OR p_vehicle_id IS NULL) THEN
        RAISE EXCEPTION
            'An accepted, confirmed or completed booking requires a chauffeur and vehicle.'
        USING ERRCODE = '22023';
    END IF;

    /* The selected vehicle must belong to the selected chauffeur. */
    IF p_vehicle_id IS NOT NULL
    AND (
        p_chauffeur_id IS NULL
        OR NOT EXISTS (
            SELECT 1
            FROM public.vehicles
            WHERE id = p_vehicle_id
                AND chauffeur_id = p_chauffeur_id
        )
    ) THEN
        RAISE EXCEPTION 'The selected vehicle does not belong to the chauffeur.'
        USING ERRCODE = '22023';
    END IF;

    /* -----------------------------------------------------------
       SECTION 4: CALCULATE THE JOURNEY END TIME

       First PostgreSQL combines:
           pickup date + pickup time
       Example:
           2026-07-20 + 14:00  becomes  2026-07-20 14:00
       make_interval creates a time interval from the calculated journey duration.
       Example:
           duration = 51 minutes
           2026-07-20 14:00 + 51 minutes
           becomes
           2026-07-20 14:51
    ----------------------------------------------------------- */
    v_end_at :=
        v_pickup_date
        + v_pickup_time
        + make_interval(mins => v_duration_minutes);

    /* -----------------------------------------------------------
       SECTION 5: PREVENT AN OVERNIGHT BUSY PERIOD
       The current chauffeur_availability table stores:
           one available_date
           one start_time
           one end_time
       It cannot yet correctly represent a period such as:  2026-07-20 23:30  until    2026-07-21 00:30
       v_end_at::DATE extracts only the date from the calculated  end timestamp.
       When the end date differs from the pickup date, the journey crosses midnight.
       For now, the function stops instead of saving incorrect  availability information.
    ----------------------------------------------------------- */
    IF p_status IN ('accepted', 'confirmed', 'completed')
       AND v_end_at::DATE <> v_pickup_date THEN

        RAISE EXCEPTION
            'The calculated busy period crosses midnight.'
        USING ERRCODE = '22023';
    END IF;

    /* -----------------------------------------------------------
       SECTION 6: REMOVE THE OLD LINKED BUSY PERIOD
       A booking may already have a busy-period record.
       This can happen when:
       - the admin changes the chauffeur
       - the booking status changes
       - the assignment is saved again

       The booking_id column links the availability record to
       its booking.
       Removing the old record prevents duplicate busy periods.
       Important:
       Because this function runs inside one transaction, the
       deleted record is automatically restored when a later
       command fails.
    ----------------------------------------------------------- */
    DELETE FROM public.chauffeur_availability
    WHERE booking_id = p_booking_id;

    /* -----------------------------------------------------------
       SECTION 7: UPDATE THE BOOKING
       This changes two columns in public.bookings:
       chauffeur_id:
           the selected chauffeur, or NULL when unassigned
       status:
           the selected booking status
       WHERE ensures that only the requested booking is updated.
    ----------------------------------------------------------- */
    UPDATE public.bookings
    SET
        chauffeur_id = p_chauffeur_id,
        vehicle_id = p_vehicle_id,
        status = p_status
    WHERE id = p_booking_id;

    /* -----------------------------------------------------------
       SECTION 8: CREATE A NEW BUSY PERIOD
       Only active booking statuses create a busy period:
       - accepted
       - confirmed
       - completed
       Pending, rejected and cancelled bookings do not create  a busy period.
    ----------------------------------------------------------- */
    IF p_status IN ('accepted', 'confirmed', 'completed') THEN

        /* -----------------------------------------------------------
           INSERT creates a new chauffeur_availability record.
           chauffeur_id:
               chauffeur assigned to the booking
           available_date:
               booking pickup date
           start_time:
               booking pickup time
           end_time:
               calculated journey end time
           status:
               busy
           booking_id:
               links this availability record to the booking
        ----------------------------------------------------------- */
        INSERT INTO public.chauffeur_availability (
            chauffeur_id,
            available_date,
            start_time,
            end_time,
            status,
            booking_id
        )
        VALUES (
            p_chauffeur_id,
            v_pickup_date,
            v_pickup_time,

            -- ::TIME removes the date and keeps only the time.
            v_end_at::TIME,

            'busy',
            p_booking_id
        );

    END IF;

    /* -----------------------------------------------------------
       END OF FUNCTION
       No RETURN value is required because the function uses:
           RETURNS VOID
       Successful completion means that both the booking and its
       linked busy period were updated correctly.
    ----------------------------------------------------------- */
END;
$$;

/* ============================================================
   FUNCTION PURPOSE:

   Updates all editable booking and client information.

   It also calls update_booking_admin_assignment(), which keeps
   the booking status, assigned chauffeur and linked busy period
   synchronized.

   Because everything runs inside one PostgreSQL transaction:

   - all changes succeed together;
   - or all changes are reversed together.

   This prevents partially updated booking information.
============================================================ */
CREATE OR REPLACE FUNCTION public.update_booking_admin_details(
    p_booking_id UUID,
    p_client_name TEXT,
    p_client_email TEXT,
    p_client_phone TEXT,
    p_pickup_location TEXT,
    p_destination TEXT,
    p_pickup_date DATE,
    p_pickup_time TIME WITHOUT TIME ZONE,
    p_passengers INTEGER,
    p_luggage INTEGER,
    p_trip_type public.trip_type,
    p_notes TEXT,
    p_has_pets BOOLEAN,
    p_infant_seat_count_required INTEGER,
    p_child_seat_count_required INTEGER,
    p_booster_seat_count_required INTEGER,
    p_isofix_required BOOLEAN,
    p_wheelchair_requirement public.wheelchair_requirement_type,
    p_wheelchair_passenger_count INTEGER,
    p_mobility_aid_storage_required BOOLEAN,
    p_extra_large_luggage_required BOOLEAN,
    p_chauffeur_id UUID,
    p_vehicle_id UUID,
    p_status public.booking_status
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    /* ========================================================
       Stores the client ID belonging to the selected booking.

       v_ means that this is a local function variable.
    ======================================================== */
    v_client_id UUID;

BEGIN
    /* ========================================================
       SECTION 1: FIND AND LOCK THE BOOKING

       The booking contains the client_id that tells us which
       client record must be updated.

       INTO stores client_id inside v_client_id.

       FOR UPDATE locks the booking until this complete database
       transaction finishes. This prevents two admin changes from
       editing the same booking simultaneously.
    ======================================================== */
    SELECT client_id
    INTO v_client_id
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;


    /* ========================================================
       SECTION 2: CHECK THAT THE BOOKING EXISTS

       FOUND is a special PostgreSQL value.

       TRUE:
           the previous SELECT found a row.

       FALSE:
           the booking ID did not exist.

       RAISE EXCEPTION stops the function.
    ======================================================== */
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking was not found.'
        USING ERRCODE = 'P0002';
    END IF;


    /* ========================================================
       SECTION 3: UPDATE THE CLIENT

       The client_id stored in v_client_id identifies the client
       belonging to this booking.

       This preserves the current project behaviour: editing the
       client information updates the existing client record.
    ======================================================== */
    UPDATE public.clients
    SET
        name = p_client_name,
        email = p_client_email,
        phone = p_client_phone
    WHERE id = v_client_id;


    /* ========================================================
       SECTION 4: UPDATE THE BOOKING DETAILS

       This section updates trip information such as:

       - pickup and destination;
       - date and time;
       - passengers and luggage;
       - trip type;
       - notes;
       - pet information.

       Status, chauffeur_id and vehicle_id are not updated here.

       They are handled by update_booking_admin_assignment()
       because that function also manages the busy period.
    ======================================================== */
    UPDATE public.bookings
    SET
        pickup_location = p_pickup_location,
        destination = p_destination,
        pickup_date = p_pickup_date,
        pickup_time = p_pickup_time,
        passengers = p_passengers,
        luggage = p_luggage,
        trip_type = p_trip_type,
        notes = p_notes,
        has_pets = p_has_pets,
        infant_seat_count_required = p_infant_seat_count_required,
        child_seat_count_required = p_child_seat_count_required,
        booster_seat_count_required = p_booster_seat_count_required,
        isofix_required = p_isofix_required,
        wheelchair_requirement = p_wheelchair_requirement,
        wheelchair_passenger_count = p_wheelchair_passenger_count,
        mobility_aid_storage_required = p_mobility_aid_storage_required,
        extra_large_luggage_required = p_extra_large_luggage_required
    WHERE id = p_booking_id;


    /* ========================================================
       SECTION 5: UPDATE ASSIGNMENT AND BUSY PERIOD

       PERFORM calls a PostgreSQL function when we do not need
       a returned value.

       update_booking_admin_assignment() will:

       - remove the booking's previous busy period;
       - update chauffeur_id, vehicle_id and booking status;
       - calculate the busy-period end time;
       - create a new busy period for active statuses;
       - reject overlapping chauffeur bookings.

       Because this call runs inside the current function, it is
       part of the same transaction.
    ======================================================== */
    PERFORM public.update_booking_admin_assignment(
        p_booking_id,
        p_chauffeur_id,
        p_vehicle_id,
        p_status
    );


    /* ========================================================
       END OF FUNCTION

       RETURNS VOID means that no data object is returned.

       Successful completion means that the client, booking and
       chauffeur availability were all updated correctly.
    ======================================================== */
END;
$$;

/* ============================================================
   VALIDATES ONE BOOKING ASSIGNMENT

   Returns all current chauffeur and vehicle assignment problems.

   The function will check:
   - required chauffeur and vehicle;
   - chauffeur approval and operational availability;
   - pet acceptance;
   - vehicle ownership and operational availability;
   - all vehicle capability matching rules from vehicleMatching.ts.

    - p_booking_id identifies the booking to validate.
    - booking_row, chauffeur_row, and vehicle_row will hold the related database records.
    - issues will collect every detected problem.
    - normal_seats_required will reproduce the wheelchair-seat calculation from vehicleMatching.ts.

    The function will eventually return one row containing:
    - whether the assignment is valid;
    - a short summary;
    - all detailed issues as JSON.
============================================================ */
CREATE OR REPLACE FUNCTION public.validate_booking_assignment(
  p_booking_id UUID
)
returns table (
    is_valid boolean,
    issue_summary text,
    issue_details jsonb
)
language plpgsql
VOLATILE
set search_path = public
as $$
declare
    booking_row public.bookings%rowtype;
    chauffeur_row public.chauffeurs%rowtype;
    vehicle_row public.vehicles%rowtype;
    issues jsonb := '[]'::jsonb;
    normal_seats_required integer := 0;
begin

    /* Loads the booking that must be validated. select ... into booking_row stores the complete booking row in the declared variable:*/
    select *
    into booking_row
    from public.bookings
    where id = p_booking_id;

    /*if not found checks whether PostgreSQL found a booking with that ID.*/
    if not found then
        return query
        select
            false,
            'Booking not found.'::text,
            jsonb_build_object(
                'issues',
                jsonb_build_array(
                    jsonb_build_object(
                        'code', 'booking_not_found',
                        'message', 'The booking could not be found.'
                    )
                )
            );

        return;
    end if;

    /* Checks whether the booking has a valid chauffeur record.
        It handles two different problems:
            chauffeur_id is null:    The booking has no chauffeur assignment.
            chauffeur_id exists, but no chauffeur row is found: The saved reference points to a missing chauffeur record.
        The issues := issues || ... expression adds a new JSON issue without deleting earlier issues.
    */
    if booking_row.chauffeur_id is null then
        issues := issues || jsonb_build_array(
            jsonb_build_object('code', 'chauffeur_missing', 'message', 'The booking has no assigned chauffeur.' )
        );
    else
        select *
        into chauffeur_row
        from public.chauffeurs
        where id = booking_row.chauffeur_id;

        if not found then
            issues := issues || jsonb_build_array(
                jsonb_build_object( 'code', 'chauffeur_not_found',  'message', 'The assigned chauffeur could not be found.' )
            );
        end if;
    end if;

    /* Validates the assigned chauffeur's current suitability.
        The previous step may find no chauffeur record. In that case, we should not also test approval, availability, and pet acceptance against an empty row.
        The validator now detects:
            No chauffeur assigned
            Chauffeur record missing
            Chauffeur not approved
            Chauffeur sick, on leave, or unavailable
            Chauffeur does not accept required pets

        jsonb_build_object() works in key-value pairs:'key', value
        jsonb_build_object() expects an even number of arguments, because every key must have a value.
            'code', 'chauffeur_unavailable'
            means
            "code": "chauffeur_unavailable"
    */
    if chauffeur_row.id is not null then
        if chauffeur_row.account_status is distinct from 'approved' then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'chauffeur_not_approved',
                    'message', 'The assigned chauffeur is not approved.'
                )
            );
        end if;

        if chauffeur_row.operational_status is distinct from 'available' then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'chauffeur_unavailable',
                    'message', 'The assigned chauffeur is not operationally available.',
                    'operational_status', chauffeur_row.operational_status,
                    'status_reason', chauffeur_row.status_reason
                )
            );
        end if;

        if coalesce(booking_row.has_pets, false)
           and not coalesce(chauffeur_row.accepts_pets, false) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'chauffeur_rejects_pets',
                    'message', 'The booking requires pet acceptance, but the assigned chauffeur does not accept pets.'
                )
            );
        end if;
    end if;

    /* Checks whether the booking has a valid vehicle record.
        This distinguishes between:
            vehicle_id is null
            and:
            vehicle_id contains an ID, but the vehicle record no longer exists
    */
    if booking_row.vehicle_id is null then
        issues := issues || jsonb_build_array(
            jsonb_build_object(
                'code', 'vehicle_missing',
                'message', 'The booking has no assigned vehicle.'
            )
        );
    else
        select *
        into vehicle_row
        from public.vehicles
        where id = booking_row.vehicle_id;

        if not found then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_not_found',
                    'message', 'The assigned vehicle could not be found.'
                )
            );
        end if;
    end if;

    /* Validates the assigned vehicle's chauffeur and operational status.
    This catches:
        a vehicle belonging to another chauffeur;
        a vehicle marked damaged, maintenance, or inactive.

        Learning:
            1. jsonb_build_object(...)
                creates one JSON object:
                {"code": "vehicle_wrong_chauffeur", "message": "The assigned vehicle does not belong to the assigned chauffeur." }

            2. jsonb_build_array(...)
                wraps that object inside an array:
                [ {"code": "vehicle_wrong_chauffeur", "message": "The assigned vehicle does not belong to the assigned chauffeur." }]

            2. issues := issues || new_issue_array
                means:
                existing issues + new issue
    */
    if vehicle_row.id is not null then
        if vehicle_row.chauffeur_id is distinct from booking_row.chauffeur_id then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_wrong_chauffeur',
                    'message', 'The assigned vehicle does not belong to the assigned chauffeur.'
                )
            );
        end if;

        if vehicle_row.vehicle_status is distinct from 'available' then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_unavailable',
                    'message', 'The assigned vehicle is not operationally available.',
                    'operational_status', vehicle_row.vehicle_status,
                    'status_reason', vehicle_row.status_reason
                )
            );
        end if;
    end if;

    /* Matches normal passenger seats and luggage capacity.
        The calculation deliberately matches your TypeScript rule:
            passengers - wheelchairPassengerCount
            with a minimum value of 0, because passengers who remain seated in wheelchairs do not require ordinary vehicle seats
    */
    normal_seats_required := greatest(
        0,
        coalesce(booking_row.passengers, 0)
        - coalesce(booking_row.wheelchair_passenger_count, 0)
    );

    if vehicle_row.id is not null then
        if coalesce(vehicle_row.seats, 0) < normal_seats_required then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_seats_insufficient',
                    'message', format(
                        'The booking requires %s normal passenger seats, but the vehicle has %s.',
                        normal_seats_required,
                        coalesce(vehicle_row.seats, 0)),
                    'required', normal_seats_required,
                    'available', coalesce(vehicle_row.seats, 0)
                )
            );
        end if;

        if coalesce(vehicle_row.luggage_capacity, 0)
           < coalesce(booking_row.luggage, 0) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_luggage_insufficient',
                    'message', format(
                        'The booking requires luggage capacity for %s items, but the vehicle supports %s.',
                        coalesce(booking_row.luggage, 0),
                        coalesce(vehicle_row.luggage_capacity, 0)),
                    'required', coalesce(booking_row.luggage, 0),
                    'available', coalesce(vehicle_row.luggage_capacity, 0)
                )
            );
        end if;
    end if;

    /* Matches child-seat and ISOFIX requirements. */
    if vehicle_row.id is not null then
        if coalesce(vehicle_row.infant_seat_count, 0)
           < coalesce(booking_row.infant_seat_count_required, 0) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_infant_seats_insufficient',
                    'message', format(
                        'The booking requires %s infant seats, but the vehicle has %s.',
                        coalesce(booking_row.infant_seat_count_required, 0),
                        coalesce(vehicle_row.infant_seat_count, 0)
                    ),
                    'required', coalesce(booking_row.infant_seat_count_required, 0),
                    'available', coalesce(vehicle_row.infant_seat_count, 0)
                )
            );
        end if;

        if coalesce(vehicle_row.child_seat_count, 0)
           < coalesce(booking_row.child_seat_count_required, 0) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_child_seats_insufficient',
                    'message', format(
                        'The booking requires %s child seats, but the vehicle has %s.',
                        coalesce(booking_row.child_seat_count_required, 0),
                        coalesce(vehicle_row.child_seat_count, 0)
                    ),
                    'required', coalesce(booking_row.child_seat_count_required, 0),
                    'available', coalesce(vehicle_row.child_seat_count, 0)
                )
            );
        end if;

        if coalesce(vehicle_row.booster_seat_count, 0)
           < coalesce(booking_row.booster_seat_count_required, 0) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_booster_seats_insufficient',
                    'message', format(
                        'The booking requires %s booster seats, but the vehicle has %s.',
                        coalesce(booking_row.booster_seat_count_required, 0),
                        coalesce(vehicle_row.booster_seat_count, 0)
                    ),
                    'required', coalesce(booking_row.booster_seat_count_required, 0),
                    'available', coalesce(vehicle_row.booster_seat_count, 0)
                )
            );
        end if;

        if coalesce(booking_row.isofix_required, false)
           and not coalesce(vehicle_row.isofix_available, false) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_isofix_missing',
                    'message', 'The booking requires ISOFIX, but the vehicle does not provide it.'
                )
            );
        end if;
    end if;

    /* Matches foldable and remain-in-wheelchair requirements.
        This mirrors the two wheelchair branches in vehicleMatching.ts:
            foldable requires anything except none;
            remain_in_wheelchair requires ramp or lift, plus enough wheelchair capacity
    */
    if vehicle_row.id is not null then
        if booking_row.wheelchair_requirement = 'foldable'
           and vehicle_row.wheelchair_access = 'none' then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_foldable_wheelchair_support_missing',
                    'message', 'The booking requires support for a foldable wheelchair.'
                )
            );
        end if;

        if booking_row.wheelchair_requirement = 'remain_in_wheelchair' then
            if vehicle_row.wheelchair_access not in ('ramp', 'lift') then
                issues := issues || jsonb_build_array(
                    jsonb_build_object(
                        'code', 'vehicle_wheelchair_access_missing',
                        'message', 'The booking requires wheelchair access by ramp or lift.'
                    )
                );
            end if;

            if coalesce(vehicle_row.wheelchair_capacity, 0)
               < coalesce(booking_row.wheelchair_passenger_count, 0) then
                issues := issues || jsonb_build_array(
                    jsonb_build_object(
                        'code', 'vehicle_wheelchair_capacity_insufficient',
                        'message', format(
                            'The booking requires capacity for %s wheelchair passengers, but the vehicle supports %s.',
                            coalesce(booking_row.wheelchair_passenger_count, 0),
                            coalesce(vehicle_row.wheelchair_capacity, 0)
                        ),
                        'required', coalesce(booking_row.wheelchair_passenger_count, 0),
                        'available', coalesce(vehicle_row.wheelchair_capacity, 0)
                    )
                );
            end if;
        end if;
    end if;
    /* Matches mobility-aid storage and extra-large luggage requirements. */
    if vehicle_row.id is not null then
        if coalesce(booking_row.mobility_aid_storage_required, false)
           and not coalesce(vehicle_row.mobility_aid_storage, false) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_mobility_storage_missing',
                    'message', 'The booking requires mobility-aid storage, but the vehicle does not provide it.'
                )
            );
        end if;

        if coalesce(booking_row.extra_large_luggage_required, false)
           and not coalesce(vehicle_row.extra_large_luggage, false) then
            issues := issues || jsonb_build_array(
                jsonb_build_object(
                    'code', 'vehicle_extra_large_luggage_missing',
                    'message', 'The booking requires support for extra-large luggage, but the vehicle does not provide it.'
                )
            );
        end if;
    end if;

  /* Returns valid only when no assignment problems were found. */
    return query
    select
        jsonb_array_length(issues) = 0,
        case
            when jsonb_array_length(issues) = 0 then null::text
            else issues -> 0 ->> 'message'
        end,
        jsonb_build_object('issues', issues);
end;
$$;

/* ============================================================
   SYNCHRONIZES ONE BOOKING'S ASSIGNMENT ALERT

   - invalid assignment: creates or updates one open alert;
   - valid assignment: resolves the existing open alert;
   - resolved alerts remain stored as history.
============================================================ */
CREATE OR REPLACE FUNCTION public.sync_booking_assignment_alert(
  p_booking_id UUID,
  p_source_type TEXT DEFAULT 'assignment',
  p_source_id UUID DEFAULT NULL
)
returns void
language plpgsql
set search_path = public
as $$
declare
    validation_row record;
begin
    select *
    into validation_row
    from public.validate_booking_assignment(p_booking_id);

     /* Creates or refreshes the open alert when the assignment is invalid.
        If an open alert already exists, it is updated with the latest problems.
        If no open alert exists, a new row is inserted.
        The partial unique index still guarantees: one open alert per booking
     */
    if not validation_row.is_valid then
        update public.assignment_alerts
        set
            issue_summary = validation_row.issue_summary,
            issue_details = validation_row.issue_details,
            source_type = p_source_type,
            source_id = p_source_id,
            last_checked_at = now(),
            resolved_at = null
        where booking_id = p_booking_id
        and alert_status = 'open';

        if not found then
            insert into public.assignment_alerts (
                booking_id,
                alert_status,
                issue_summary,
                issue_details,
                source_type,
                source_id,
                first_detected_at,
                last_checked_at
            )
            values (
                p_booking_id,
                'open',
                validation_row.issue_summary,
                validation_row.issue_details,
                p_source_type,
                p_source_id,
                now(),
                now()
            );
        end if;

        return;
    end if;

    /* Resolves the current open alert when the assignment is valid again. */
    update public.assignment_alerts
    set
        alert_status = 'resolved',
        source_type = p_source_type,
        source_id = p_source_id,
        last_checked_at = now(),
        resolved_at = now()
    where booking_id = p_booking_id
    and alert_status = 'open';
end;
$$;


/* ==========example trigger function=================
 -- When a chauffeur is assigned to a booking, automatically set status to assigned and update

CREATE OR REPLACE FUNCTION update_booking_status_and_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Always update the updated_at column
  NEW.updated_at = now();

  -- If chauffeur_id is added or changed, set status to assigned
  IF NEW.chauffeur_id IS NOT NULL
     AND NEW.chauffeur_id IS DISTINCT FROM OLD.chauffeur_id THEN
    NEW.status = 'assigned';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

Then attach it to the bookings table:

CREATE TRIGGER update_bookings_status_and_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_booking_status_and_updated_at();

*/