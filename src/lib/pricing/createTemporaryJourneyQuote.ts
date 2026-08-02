import type { CountryRoundingRule } from "@/types/countryRoundingRuleType";
import type { CountryTaxRule } from "@/types/countryTaxRuleType";
import type { PricingProfile } from "@/types/pricingProfileType";
import type { TemporaryJourneyQuote } from "@/types/temporaryJourneyQuoteType";

import { calculateJourneyFare } from "./calculateJourneyFare";

/**
 * Purpose:
 * Creates a temporary journey quote using the applicable
 * pricing, tax, and rounding rules.
 *
 * The quote remains valid for the supplied number of minutes.
 * It is not saved to the database yet.
 */
export function createTemporaryJourneyQuote(
    pricingProfile: PricingProfile, taxRule: CountryTaxRule, roundingRule: CountryRoundingRule, 
    distanceKm: number, estimatedDurationMinutes: number, quoteValidityMinutes: number
    ): TemporaryJourneyQuote 
{
    const fareCalculation = calculateJourneyFare(
        pricingProfile,
        taxRule,
        roundingRule,
        distanceKm,
        estimatedDurationMinutes
    );

    const createdAtDate = new Date();
    const expiresAtDate = new Date(createdAtDate.getTime() + quoteValidityMinutes * 60 * 1000 );

    // Return the complete temporary quote.
    return {
        quoteId: crypto.randomUUID(),
        pricingProfileCode: pricingProfile.pricingProfileCode,
        pricingProfileVersion: pricingProfile.pricingProfileVersion,
        countryCode: pricingProfile.countryCode,
        currencyCode: pricingProfile.currencyCode,
        distanceKm,
        estimatedDurationMinutes,
        taxRatePercentage: taxRule.taxRatePercentage,
        fareCalculation,
        createdAt: createdAtDate.toISOString(),
        expiresAt: expiresAtDate.toISOString(),
    };
}