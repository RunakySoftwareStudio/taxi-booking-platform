import type { JourneyQuoteTaxAllocation } from "@/types/journeyQuoteTaxAllocationType";
import type { RouteCountryDistance } from "./calculateRouteCountryDistances";
import type { JourneyCountryTaxRule } from "./loadJourneyCountryTaxRules";

import { calculateVatAmount } from "./calculateVatAmount";

function roundMoney(inputValue: number): number {
    return Number(inputValue.toFixed(4));
}

/**
 * Purpose:
 * Divides the complete journey fare excluding VAT between the
 * countries crossed by the route, based on distance travelled
 * inside each country.
 *
 * Each country portion then uses its own tax rule.
 *
 * Example:
 *
 * Total fare excluding VAT: €100.00
 *
 * NL -> 60% of route -> €60.00 -> NL tax rule
 * BE -> 40% of route -> €40.00 -> BE tax rule
 *
 * The final country receives any tiny four-decimal remainder so
 * all allocated fares add back up to the original journey fare.
 */
export function calculateJourneyQuoteTaxAllocations(
    basicFareExcludingVat: number,countryDistances: RouteCountryDistance[], countryTaxRules: JourneyCountryTaxRule[]): JourneyQuoteTaxAllocation[] {

    if (!Number.isFinite(basicFareExcludingVat) || basicFareExcludingVat < 0) {throw new Error("Basic fare excluding VAT must be a valid non-negative number."); }
    if (countryDistances.length === 0) {throw new Error("At least one route country distance is required.");}

    /*
     * Use metres for the allocation because PostGIS gives us
     * greater precision in metres than in the rounded kilometre value.
     */
    const totalDistanceMeters = countryDistances.reduce((totalDistance, countryDistance) => totalDistance + countryDistance.distanceMeters, 0);
    if (!Number.isFinite(totalDistanceMeters) || totalDistanceMeters <= 0) {throw new Error("The total route country distance must be greater than zero.");}

    let allocatedFareTotal = 0;

    return countryDistances.map((countryDistance, countryIndex) => {
        const matchingTaxRules = countryTaxRules.filter((countryTaxRule) => countryTaxRule.taxRule.countryCode === countryDistance.countryCode);
        if (matchingTaxRules.length !== 1) {throw new Error(`Exactly one tax rule is required for ${countryDistance.countryCode}.` ); }

        const countryTaxRule = matchingTaxRules[0];
        const isFinalCountry = countryIndex === countryDistances.length - 1;

        /*
         * Every country receives its distance-based share.
         * The final country receives the small rounding remainder
         * so the allocated fares exactly reconstruct the original fare.
         */
        const allocatedFareExcludingVat = roundMoney(
            isFinalCountry
                ? basicFareExcludingVat - allocatedFareTotal
                : basicFareExcludingVat * (countryDistance.distanceMeters / totalDistanceMeters)
        );

        allocatedFareTotal = roundMoney(allocatedFareTotal + allocatedFareExcludingVat );
        const vatAmount = calculateVatAmount(allocatedFareExcludingVat, countryTaxRule.taxRule);

        return {
            countryCode: countryDistance.countryCode,
            taxRuleId: countryTaxRule.taxRuleId,
            distanceKilometers: countryDistance.distanceKilometers,
            allocatedFareExcludingVat,
            taxRatePercentage: countryTaxRule.taxRule.taxRatePercentage,
            vatAmount,
            amountIncludingVat: roundMoney(allocatedFareExcludingVat + vatAmount),
        };
    });
}