/* ================================================================================================================
    Please Note:  2026-08-21-add-belgian-pricing-profiles.sql
        Purpose:
        - Adds initial BE V1 pricing profiles/rates to an existing database.

        Schema synchronization:
        - Belgian pricing profile/rate bootstrap must also exist in schema.sql
        for fresh installations.

        Execution history:
        - Manual Supabase execution not confirmed.

   BELGIAN VERSION 1 PRICING CONFIGURATION

   Purpose:
   Reproduces the Belgian pricing profiles and rates that were originally
   created through the Admin Pricing UI.

   ARCHITECTURE CHECK:
   - Safe for the existing live database.
   - Safe for a fresh database.
   - Existing pricing-profile versions are not overwritten.
   - Existing pricing-rate rows are not overwritten.
   - No administrator UUID is hard-coded into bootstrap configuration.
   - Pricing profile identity is protected by:
       pricing_profile_code + pricing_profile_version
   - Pricing rates are protected by:
       one pricing_rates row per pricing_profile_id
==================================================================================================================== */

BEGIN;

/* ---------------------------------------------------------------------------------------------------------------
   BE DAYTIME STANDARD - VERSION 1
---------------------------------------------------------------------------------------------------------------- */

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
    'BE_DAYTIME_STANDARD',
    'Belgium Daytime Standard',
    1,
    'BE',
    'EUR',
    20,
    'active',
    TIMESTAMPTZ '2026-08-19 16:56:56.332068+00',
    NULL,
    TIMESTAMPTZ '2026-08-19 16:56:56.332068+00'
)
ON CONFLICT (pricing_profile_code, pricing_profile_version)
DO NOTHING;

INSERT INTO public.pricing_rates (
    pricing_profile_id,
    base_fare_excluding_vat,
    distance_rate_per_km_excluding_vat,
    duration_rate_per_minute_excluding_vat,
    minimum_fare_excluding_vat
)
SELECT
    pricing_profile.id,
    4.9000,
    2.0000,
    0.3500,
    20.0000
FROM public.pricing_profiles pricing_profile
WHERE pricing_profile.pricing_profile_code = 'BE_DAYTIME_STANDARD'
  AND pricing_profile.pricing_profile_version = 1
  AND NOT EXISTS (
      SELECT 1
      FROM public.pricing_rates pricing_rate
      WHERE pricing_rate.pricing_profile_id = pricing_profile.id
  );


/* ---------------------------------------------------------------------------------------------------------------
   BE NIGHT STANDARD - VERSION 1
---------------------------------------------------------------------------------------------------------------- */

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
    'BE_NIGHT_STANDARD',
    'Belgium Night Standard',
    1,
    'BE',
    'EUR',
    20,
    'active',
    TIMESTAMPTZ '2026-08-19 16:57:47.596382+00',
    NULL,
    TIMESTAMPTZ '2026-08-19 16:57:47.596382+00'
)
ON CONFLICT (pricing_profile_code, pricing_profile_version)
DO NOTHING;

INSERT INTO public.pricing_rates (
    pricing_profile_id,
    base_fare_excluding_vat,
    distance_rate_per_km_excluding_vat,
    duration_rate_per_minute_excluding_vat,
    minimum_fare_excluding_vat
)
SELECT
    pricing_profile.id,
    4.5000,
    2.0000,
    0.3500,
    12.0000
FROM public.pricing_profiles pricing_profile
WHERE pricing_profile.pricing_profile_code = 'BE_NIGHT_STANDARD'
  AND pricing_profile.pricing_profile_version = 1
  AND NOT EXISTS (
      SELECT 1
      FROM public.pricing_rates pricing_rate
      WHERE pricing_rate.pricing_profile_id = pricing_profile.id
  );


/* ---------------------------------------------------------------------------------------------------------------
   BE WEEKEND STANDARD - VERSION 1
---------------------------------------------------------------------------------------------------------------- */

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
    'BE_WEEKEND_STANDARD',
    'Belgium Weekend Standard',
    1,
    'BE',
    'EUR',
    20,
    'active',
    TIMESTAMPTZ '2026-08-19 16:58:32.315410+00',
    NULL,
    TIMESTAMPTZ '2026-08-19 16:58:32.315410+00'
)
ON CONFLICT (pricing_profile_code, pricing_profile_version)
DO NOTHING;

INSERT INTO public.pricing_rates (
    pricing_profile_id,
    base_fare_excluding_vat,
    distance_rate_per_km_excluding_vat,
    duration_rate_per_minute_excluding_vat,
    minimum_fare_excluding_vat
)
SELECT
    pricing_profile.id,
    3.5000,
    2.5000,
    0.5000,
    20.0000
FROM public.pricing_profiles pricing_profile
WHERE pricing_profile.pricing_profile_code = 'BE_WEEKEND_STANDARD'
  AND pricing_profile.pricing_profile_version = 1
  AND NOT EXISTS (
      SELECT 1
      FROM public.pricing_rates pricing_rate
      WHERE pricing_rate.pricing_profile_id = pricing_profile.id
  );

COMMIT;