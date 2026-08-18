import type { CountryRoundingRule } from "@/types/countryRoundingRuleType";
import type { CountryTaxRule } from "@/types/countryTaxRuleType";
import type { PricingProfile } from "@/types/pricingProfileType";
import type { TemporaryJourneyQuote } from "@/types/temporaryJourneyQuoteType";

import { calculateJourneyFare } from "./calculateJourneyFare";
import { createTemporaryJourneyQuoteFromFareCalculation } from "./createTemporaryJourneyQuoteFromFareCalculation";


/**
 * Purpose:
 * Creates a temporary journey quote using the applicable
 * pricing, tax and rounding rules.
 *
 * The quote remains valid for the supplied number of minutes.
 *
 * This function builds and returns the quote object.
 * The API route is responsible for saving it to the database.
 */

export function createTemporaryJourneyQuote(
    pricingProfile: PricingProfile,
    taxRule: CountryTaxRule,
    roundingRule: CountryRoundingRule,
    distanceKm: number,
    estimatedDurationMinutes: number,
    quoteValidityMinutes: number
): TemporaryJourneyQuote {

    const fareCalculation = calculateJourneyFare(
        pricingProfile,
        taxRule,
        roundingRule,
        distanceKm,
        estimatedDurationMinutes
    );

    return createTemporaryJourneyQuoteFromFareCalculation(
        pricingProfile,
        fareCalculation,
        distanceKm,
        estimatedDurationMinutes,
        quoteValidityMinutes,
        taxRule.taxRatePercentage
    );
}