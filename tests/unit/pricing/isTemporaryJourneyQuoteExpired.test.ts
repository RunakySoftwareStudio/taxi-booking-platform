import { afterEach, describe, expect, it, vi } from "vitest";

import { dutchEuroRoundingRule } from "../../../src/data/countryRoundingRuleData";
import { dutchPassengerTransportTaxRule } from "../../../src/data/countryTaxRuleData";
import { dutchDaytimePricingProfile } from "../../../src/data/pricingProfileData";
import { createTemporaryJourneyQuote } from "../../../src/lib/pricing/createTemporaryJourneyQuote";
import { isTemporaryJourneyQuoteExpired } from "../../../src/lib/pricing/isTemporaryJourneyQuoteExpired";

/**
 * Purpose:
 * Tests whether a temporary journey quote is correctly identified as valid or expired.
 *  1. Set time to 10:00:00
    2. Create a quote valid for 15 minutes
    3. Move time forward to 10:14:59
    4. Check whether the quote has expired
    5. Expected result: false
 */
describe("isTemporaryJourneyQuoteExpired", () => {
    afterEach(() => {vi.useRealTimers();});

    it("returns false before the quote expiration time", () => {
        vi.useFakeTimers();
        //Set time to 10:00:00
        vi.setSystemTime(new Date("2026-08-02T10:00:00.000Z"));

        //Create a quote valid for 15 minutes
        const journeyQuote = createTemporaryJourneyQuote(
            dutchDaytimePricingProfile,
            dutchPassengerTransportTaxRule,
            dutchEuroRoundingRule,
            10,
            20,
            15
        );

        //Move time forward to 10:14:59
        vi.setSystemTime(new Date("2026-08-02T10:14:59.000Z"));
        //Check whether the quote has expired
        const isExpired = isTemporaryJourneyQuoteExpired(journeyQuote);

        expect(isExpired).toBe(false);
    });

    it("returns true when the quote reaches its expiration time", () => {
        vi.useFakeTimers();

        //Set time to 10:00:00
        vi.setSystemTime(new Date("2026-08-02T10:00:00.000Z"));

        //Create a quote valid for 15 minutes
        const journeyQuote = createTemporaryJourneyQuote(
            dutchDaytimePricingProfile,
            dutchPassengerTransportTaxRule,
            dutchEuroRoundingRule,
            10,
            20,
            15
        );

        //Move time forward to 10:15:00
        vi.setSystemTime(new Date("2026-08-02T10:15:00.000Z"));

        //Check whether the quote has expired
        const isExpired = isTemporaryJourneyQuoteExpired(journeyQuote);
        expect(isExpired).toBe(true);
    });
});