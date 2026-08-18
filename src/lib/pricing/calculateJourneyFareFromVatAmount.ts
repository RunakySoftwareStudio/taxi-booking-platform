import type { CountryRoundingRule } from "@/types/countryRoundingRuleType";
import type { JourneyFareCalculation } from "@/types/journeyFareCalculationType";

import { roundCurrencyAmount } from "./roundCurrencyAmount";

/**
 * Purpose:
 * Completes a journey-fare calculation when the total VAT amount
 * has already been calculated.
 *
 * This allows the same final-rounding logic to be used for:
 *
 * Domestic:
 * one tax rule -> total VAT
 *
 * Cross-border:
 * several country tax allocations -> summed total VAT
 *
 * Example:
 *
 * Fare excluding VAT:        €37.00
 * Total VAT:                  €3.33
 * Before final rounding:     €40.33
 * Rounding adjustment:        €0.02
 * Final total:               €40.35
 * 
 * This function does NOT ask:"Which tax rate applies?"
 * It receives:"Here is the total VAT already calculated."
 * Then it only does:fare + VAT → final currency rounding
 * 
 * So later both flows can reuse it:
    Domestic:
    calculateVatAmount(...)
            ↓
    calculateJourneyFareFromVatAmount(...)

    Cross-border:
    sum country VAT allocations
            ↓
    calculateJourneyFareFromVatAmount(...)
 */
export function calculateJourneyFareFromVatAmount(
    basicFareExcludingVat: number,
    vatAmount: number,
    roundingRule: CountryRoundingRule
): JourneyFareCalculation {

    const totalIncludingVatBeforeRounding = basicFareExcludingVat + vatAmount;
    const finalTotalIncludingVat = roundCurrencyAmount(totalIncludingVatBeforeRounding, roundingRule );
    const roundingAdjustment = Number((finalTotalIncludingVat - totalIncludingVatBeforeRounding).toFixed(4));

    return {
        basicFareExcludingVat,
        vatAmount,
        totalIncludingVatBeforeRounding,
        roundingAdjustment,
        finalTotalIncludingVat,
    };
}