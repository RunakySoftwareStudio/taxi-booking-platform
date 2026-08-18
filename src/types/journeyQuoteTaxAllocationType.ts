/**
 * Purpose:
 * Stores one country-specific tax allocation for a journey quote.
 *
 * The commercial fare is calculated once for the whole journey.
 * This type describes how that fare is divided between countries
 * for tax calculation.
 *
 * Example:
 * Amsterdam -> Brussels
 *
 * NL -> part of route -> part of fare -> NL tax rule -> NL VAT
 * BE -> part of route -> part of fare -> BE tax rule -> BE VAT
 */
export type JourneyQuoteTaxAllocation = {
    countryCode: string;
    taxRuleId: string;

    distanceKilometers: number;

    allocatedFareExcludingVat: number;

    taxRatePercentage: number;
    vatAmount: number;
    amountIncludingVat: number;
};