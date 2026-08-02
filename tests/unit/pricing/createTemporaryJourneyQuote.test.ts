import { afterEach, describe, expect, it, vi } from "vitest";

import { dutchEuroRoundingRule } from "../../../src/data/countryRoundingRuleData";
import { dutchPassengerTransportTaxRule } from "../../../src/data/countryTaxRuleData";
import { dutchDaytimePricingProfile } from "../../../src/data/pricingProfileData";
import { createTemporaryJourneyQuote } from "../../../src/lib/pricing/createTemporaryJourneyQuote";

/**
 * Purpose:
 * Tests the creation of a temporary journey quote,
 * including its pricing information and expiration time.
 * 
 * vi.setSystemTime(...) Make the test behave as though the current date and time is exactly 2 August 2026 at 10:00 UTC.
 * afterEach(() => {vi.useRealTimers();}); returns Vitest to the real clock after the test finishes.
 */
describe("createTemporaryJourneyQuote", () => {
    afterEach(() => {vi.useRealTimers();});

    it("creates a temporary quote that remains valid for 15 minutes", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-02T10:00:00.000Z"));

        const journeyQuote = createTemporaryJourneyQuote(
            dutchDaytimePricingProfile,
            dutchPassengerTransportTaxRule,
            dutchEuroRoundingRule,
            10,
            20,
            15
        );

        console.log("Temporary journey quote:", journeyQuote);

        expect(journeyQuote.quoteId).not.toBe("");
        expect(journeyQuote.pricingProfileCode).toBe("NL_DAYTIME_STANDARD");
        expect(journeyQuote.pricingProfileVersion).toBe(1);
        expect(journeyQuote.countryCode).toBe("NL");
        expect(journeyQuote.currencyCode).toBe("EUR");
        expect(journeyQuote.distanceKm).toBe(10);
        expect(journeyQuote.estimatedDurationMinutes).toBe(20);
        expect(journeyQuote.taxRatePercentage).toBe(9);
        expect(journeyQuote.fareCalculation.finalTotalIncludingVat).toBe(40.33);
        expect(journeyQuote.createdAt).toBe("2026-08-02T10:00:00.000Z");
        expect(journeyQuote.expiresAt).toBe("2026-08-02T10:15:00.000Z");
    });
});