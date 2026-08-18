/* ============================================================
   ALLOW MULTIPLE TAX RULES PER JOURNEY QUOTE

   Purpose:
   A domestic journey normally uses one tax rule and one tax rate.

   A cross-border journey may use several country-specific tax
   rules, stored in journey_quote_tax_allocations.

   Therefore:
       tax_rule_id
       tax_rate_percentage

   can no longer be required to describe the whole quote.

   The quote-level vat_amount remains the total VAT amount for
   the complete journey.
============================================================ */


/*
 * A cross-border quote may have several tax percentages.
 *
 * Domestic quote:
 *     tax_rate_percentage = one rate, for example 9.00
 *
 * Cross-border quote:
 *     tax_rate_percentage = NULL
 *     detailed rates live in journey_quote_tax_allocations
 */
ALTER TABLE public.journey_quotes
ALTER COLUMN tax_rate_percentage DROP NOT NULL;


/*
 * tax_rule_id already allows NULL.
 *
 * For a domestic quote it may reference the single tax rule.
 * For a multi-country quote it may be NULL because the exact
 * tax rules are stored in journey_quote_tax_allocations.
 */
COMMENT ON COLUMN public.journey_quotes.tax_rule_id IS
'Single tax rule used by a quote when applicable. May be NULL for multi-country quotes whose exact tax rules are stored in journey_quote_tax_allocations.';


COMMENT ON COLUMN public.journey_quotes.tax_rate_percentage IS
'Single tax rate used by a quote when applicable. NULL for multi-country quotes that use multiple country-specific tax rates stored in journey_quote_tax_allocations.';


COMMENT ON COLUMN public.journey_quotes.vat_amount IS
'Total VAT amount for the complete journey quote. For multi-country quotes this is the sum of the country-specific VAT allocations.';