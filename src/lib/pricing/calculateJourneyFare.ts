import type { CountryRoundingRule } from "@/types/countryRoundingRuleType";
import type { CountryTaxRule } from "@/types/countryTaxRuleType";
import type { JourneyFareCalculation } from "@/types/journeyFareCalculationType";
import type { PricingProfile } from "@/types/pricingProfileType";

import { calculateBasicJourneyFare } from "./calculateBasicJourneyFare";
import { calculateVatAmount } from "./calculateVatAmount";
import { roundCurrencyAmount } from "./roundCurrencyAmount";

/**
 * Purpose:
 * Combines the basic fare, VAT, and currency-rounding calculations.
 *
 * Example:
 * Basic fare excluding VAT: €37.00
 * VAT at 9%:               €3.33
 * Final total:            €40.33
 */
export function calculateJourneyFare(
        pricingProfile: PricingProfile, taxRule: CountryTaxRule, 
        roundingRule: CountryRoundingRule, distanceKm: number, 
        estimatedDurationMinutes: number): JourneyFareCalculation 
{
    const basicFareExcludingVat = calculateBasicJourneyFare(pricingProfile, distanceKm, estimatedDurationMinutes);
    const vatAmount = calculateVatAmount(basicFareExcludingVat, taxRule );
    const totalIncludingVatBeforeRounding = basicFareExcludingVat + vatAmount;
    const finalTotalIncludingVat = roundCurrencyAmount(totalIncludingVatBeforeRounding, roundingRule );

    // Return every part of the calculation for display and storage.
    return {
        basicFareExcludingVat,
        vatAmount,
        totalIncludingVatBeforeRounding,
        finalTotalIncludingVat,
    };
}