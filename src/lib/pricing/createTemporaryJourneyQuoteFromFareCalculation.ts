import type { JourneyFareCalculation } from "@/types/journeyFareCalculationType";
import type { PricingProfile } from "@/types/pricingProfileType";
import type { TemporaryJourneyQuote } from "@/types/temporaryJourneyQuoteType";

/**
 * Purpose:
 * Builds a temporary journey quote from a fare calculation that
 * has already been completed.
 *
 * This function does not calculate pricing or VAT.
 *
 * Domestic:
 * taxRatePercentage = one VAT rate
 *
 * Multi-country:
 * taxRatePercentage = null
 * exact tax rates are stored in journey_quote_tax_allocations
 */
export function createTemporaryJourneyQuoteFromFareCalculation(
    pricingProfile: PricingProfile,
    fareCalculation: JourneyFareCalculation,
    distanceKm: number,
    estimatedDurationMinutes: number,
    quoteValidityMinutes: number,
    taxRatePercentage: number | null
): TemporaryJourneyQuote {

    const createdAtDate = new Date();
    const expiresAtDate = new Date(createdAtDate.getTime() + quoteValidityMinutes * 60 * 1000);

    return {
        quoteId: crypto.randomUUID(),
        pricingProfileCode: pricingProfile.pricingProfileCode,
        pricingProfileVersion: pricingProfile.pricingProfileVersion,
        countryCode: pricingProfile.countryCode,
        currencyCode: pricingProfile.currencyCode,
        distanceKm,
        estimatedDurationMinutes,
        taxRatePercentage,
        fareCalculation,
        createdAt: createdAtDate.toISOString(),
        expiresAt: expiresAtDate.toISOString(),
    };
}