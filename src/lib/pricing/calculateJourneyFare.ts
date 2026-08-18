import type { CountryRoundingRule } from "@/types/countryRoundingRuleType";
import type { CountryTaxRule } from "@/types/countryTaxRuleType";
import type { JourneyFareCalculation } from "@/types/journeyFareCalculationType";
import type { PricingProfile } from "@/types/pricingProfileType";

import { calculateBasicJourneyFare } from "./calculateBasicJourneyFare";
import { calculateVatAmount } from "./calculateVatAmount";
import { calculateJourneyFareFromVatAmount } from "./calculateJourneyFareFromVatAmount";


/**
 * Purpose:
 * Combines the basic fare, VAT, and currency-rounding calculations.
 * The reason for toFixed(4) is that our internal calculation still supports four-decimal precision,
 * so we should not prematurely force the adjustment itself to two decimals.

 * Example:
    * Fare excl. VAT             €37.00
    * VAT                         €3.33
    * Before final rounding      €40.33
    * Rounding adjustment         €0.02
    * Final total                €40.35
 */
export function calculateJourneyFare(
    pricingProfile: PricingProfile, taxRule: CountryTaxRule,
    roundingRule: CountryRoundingRule, distanceKm: number,
    estimatedDurationMinutes: number
): JourneyFareCalculation {

    const basicFareExcludingVat = calculateBasicJourneyFare(
        pricingProfile,
        distanceKm,
        estimatedDurationMinutes
    );

    const vatAmount = calculateVatAmount( basicFareExcludingVat, taxRule );

    return calculateJourneyFareFromVatAmount(
        basicFareExcludingVat,
        vatAmount,
        roundingRule
    );
}
