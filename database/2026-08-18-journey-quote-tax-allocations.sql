/* ============================================================
   JOURNEY QUOTE TAX ALLOCATIONS

   Purpose:
   Stores the country-specific tax breakdown belonging to one
   temporary journey quote.

   The commercial fare is still calculated once for the complete
   journey.

   This table records how that fare was divided between countries
   for tax calculation.

   Example:

       Amsterdam -> Brussels

       journey_quotes
           -> one complete customer quote

       journey_quote_tax_allocations
           -> NL portion -> NL tax rule -> NL VAT
           -> BE portion -> BE tax rule -> BE VAT

   Important:
   journey_quote_items explains WHAT created the fare.
   journey_quote_tax_allocations explains WHERE that fare was
   allocated for tax.
============================================================ */

CREATE TABLE IF NOT EXISTS public.journey_quote_tax_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    /*
     * The quote owns these tax-allocation rows.
     * If an unused quote is permanently removed, its allocation
     * rows may be removed with it.
     */
    quote_id UUID NOT NULL
        REFERENCES public.journey_quotes(quote_id)
        ON DELETE CASCADE,

    /*
     * Country to which this portion of the journey was allocated.
     *
     * We store the country code directly as part of the financial
     * snapshot rather than depending on the geographic boundary
     * record later.
     */
    country_code TEXT NOT NULL,

    /*
     * Exact tax rule used for this country portion.
     *
     * RESTRICT protects the financial history from losing the
     * referenced tax configuration.
     */
    tax_rule_id UUID NOT NULL
        REFERENCES public.tax_rules(id)
        ON DELETE RESTRICT,

    /*
     * Route distance inside this country.
     *
     * NUMERIC(10, 3) stores kilometres to three decimals,
     * matching the route-distance precision used by the quote.
     */
    distance_km NUMERIC(10, 3) NOT NULL,

    /*
     * Portion of the complete journey fare excluding VAT that
     * was allocated to this country.
     */
    allocated_fare_excluding_vat NUMERIC(12, 4) NOT NULL,

    /*
     * Snapshot of the tax rate actually used when this quote
     * was calculated.
     */
    tax_rate_percentage NUMERIC(5, 2) NOT NULL,

    /*
     * VAT calculated for this country's allocated fare.
     */
    vat_amount NUMERIC(12, 4) NOT NULL,

    /*
     * Country allocation including its VAT.
     */
    amount_including_vat NUMERIC(12, 4) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    /*
     * One quote receives only one aggregated allocation row
     * for each country.
     */
    CONSTRAINT journey_quote_tax_allocations_quote_country_unique
        UNIQUE (quote_id, country_code),

    CONSTRAINT journey_quote_tax_allocations_country_code_valid
        CHECK (
            LENGTH(country_code) = 2
            AND country_code = UPPER(country_code)
        ),

    CONSTRAINT journey_quote_tax_allocations_distance_positive
        CHECK (distance_km > 0),

    CONSTRAINT journey_quote_tax_allocations_fare_non_negative
        CHECK (allocated_fare_excluding_vat >= 0),

    CONSTRAINT journey_quote_tax_allocations_tax_rate_valid
        CHECK (
            tax_rate_percentage >= 0
            AND tax_rate_percentage <= 100
        ),

    CONSTRAINT journey_quote_tax_allocations_vat_non_negative
        CHECK (vat_amount >= 0),

    /*
     * Because these are PostgreSQL NUMERIC values, the database
     * can also verify that the stored country total is internally
     * consistent.
     */
    CONSTRAINT journey_quote_tax_allocations_total_valid
        CHECK (
            amount_including_vat =
            allocated_fare_excluding_vat + vat_amount
        )
);


/*
 * Used when loading all country tax allocations belonging
 * to one journey quote.
 */
CREATE INDEX IF NOT EXISTS journey_quote_tax_allocations_quote_id_idx
ON public.journey_quote_tax_allocations (quote_id);


/*
 * Useful for financial auditing and locating quote allocations
 * that used a particular tax rule.
 */
CREATE INDEX IF NOT EXISTS journey_quote_tax_allocations_tax_rule_id_idx
ON public.journey_quote_tax_allocations (tax_rule_id);


/*
 * Tax allocations are financial snapshot data.
 * Public browser roles must not directly read or modify them.
 */
ALTER TABLE public.journey_quote_tax_allocations ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE public.journey_quote_tax_allocations
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.journey_quote_tax_allocations
TO service_role;