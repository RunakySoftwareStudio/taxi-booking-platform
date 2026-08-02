import type { CountryTaxRule } from "@/types/countryTaxRuleType";

/**
 * Purpose:
 * Stores the temporary Dutch VAT rule for passenger transport.
 *
 * Example:
 * A fare of €100.00 excluding VAT receives €9.00 VAT
 * when the applicable VAT percentage is 9%.
 *
 * The effective period will later be checked using the journey date.
 * Eventually, this configuration will come from Supabase.
 */
export const dutchPassengerTransportTaxRule: CountryTaxRule = {
    countryCode: "NL",
    taxName: "VAT",
    serviceCategory: "passenger_transport",
    taxRatePercentage: 9,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
};