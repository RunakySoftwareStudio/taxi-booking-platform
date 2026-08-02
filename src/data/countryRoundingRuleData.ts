import type { CountryRoundingRule } from "@/types/countryRoundingRuleType";

/**
 * Purpose:
 * Stores the temporary Dutch euro rounding rule.
 *
 * Example:
 * A final amount of €40.329 is rounded to €40.33.
 *
 * The amount is rounded to the nearest €0.01.
 * Eventually, this configuration will come from Supabase.
 */
export const dutchEuroRoundingRule: CountryRoundingRule = {
    countryCode: "NL",
    currencyCode: "EUR",
    roundingIncrement: 0.01,
    roundingMode: "nearest",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
};