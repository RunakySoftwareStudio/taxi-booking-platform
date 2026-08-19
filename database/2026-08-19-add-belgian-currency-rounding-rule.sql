/*
 * VOYA TAXI - BELGIAN CURRENCY ROUNDING RULE
 *
 * Purpose:
 * Adds the initial Belgian EUR rounding configuration used
 * by journey fare and quote calculations.
 *
 * Important:
 * This is normal currency precision rounding:
 *
 *     EUR -> nearest €0.01
 *
 * Belgian cash-payment rounding to €0.05 is a separate
 * payment-settlement concern and does not belong in the
 * journey quote rounding configuration.
 */

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
SELECT
    'BE',
    'EUR',
    0.0100,
    'nearest',
    'active',
    TIMESTAMPTZ '2026-01-01 00:00:00+00',
    NULL,
    NOW()
WHERE NOT EXISTS (
    SELECT 1
    FROM public.currency_rounding_rules AS rounding_rule
    WHERE rounding_rule.country_code = 'BE'
      AND rounding_rule.currency_code = 'EUR'
      AND rounding_rule.status = 'active'
      AND rounding_rule.effective_from = TIMESTAMPTZ '2026-01-01 00:00:00+00'
);