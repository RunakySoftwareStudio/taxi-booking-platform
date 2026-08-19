/*
 * VOYA TAXI - BELGIAN PASSENGER-TRANSPORT TAX RULE
 *
 * Purpose:
 * Adds the Belgian VAT rule required for journey-distance
 * tax allocation on cross-border journeys.
 *
 * Belgian passenger transport uses the reduced 6% VAT rate.
 *
 * Important:
 * 2026-01-01 is the Voya Taxi configuration start date.
 * It is not intended to represent the date on which Belgian
 * tax legislation originally introduced this VAT rate.
 */

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
SELECT
    'BE',
    'VAT',
    'passenger_transport',
    6.00,
    'active',
    TIMESTAMPTZ '2026-01-01 00:00:00+00',
    NULL,
    NOW()
WHERE NOT EXISTS (
    SELECT 1
    FROM public.tax_rules
    WHERE country_code = 'BE'
      AND service_category = 'passenger_transport'
      AND tax_rate_percentage = 6.00
      AND effective_from = TIMESTAMPTZ '2026-01-01 00:00:00+00'
);