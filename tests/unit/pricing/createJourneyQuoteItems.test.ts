import { describe, expect, it } from "vitest";

import { dutchEuroRoundingRule } from "../../../src/data/countryRoundingRuleData";
import { dutchPassengerTransportTaxRule } from "../../../src/data/countryTaxRuleData";
import { dutchDaytimePricingProfile } from "../../../src/data/pricingProfileData";
import { createJourneyQuoteItems } from "../../../src/lib/pricing/createJourneyQuoteItems";
import { createTemporaryJourneyQuote } from "../../../src/lib/pricing/createTemporaryJourneyQuote";

/**
 * Adds all numbers in an array and returns the total
 * rounded to four decimal places.
 */
function sumAmounts(inputValues: number[]): number {
    const total = inputValues.reduce((currentTotal, inputValue) => currentTotal + inputValue, 0);
    return Number(total.toFixed(4));
}

/**
 * Tests that detailed journey quote items explain the fare
 * and match the totals stored on the quote header.
 */
describe("createJourneyQuoteItems", () => {
    it("creates base, distance and duration items for a normal journey", () => {
        const journeyQuote = createTemporaryJourneyQuote(
            dutchDaytimePricingProfile,
            dutchPassengerTransportTaxRule,
            dutchEuroRoundingRule,
            10,
            20,
            15
        );

        const quoteItems = createJourneyQuoteItems(dutchDaytimePricingProfile, journeyQuote);

        const itemCodes = quoteItems.map((quoteItem) => quoteItem.itemCode);
        const amountsExcludingVat = quoteItems.map((quoteItem) => quoteItem.amountExcludingVat);

        const totalExcludingVat = sumAmounts(quoteItems.map((quoteItem) => quoteItem.amountExcludingVat));
        const totalVat = sumAmounts(quoteItems.map((quoteItem) => quoteItem.vatAmount));
        const totalIncludingVat = sumAmounts(quoteItems.map((quoteItem) => quoteItem.amountIncludingVat));

        expect(itemCodes).toEqual([
            "BASE_FARE",
            "DISTANCE_FARE",
            "DURATION_FARE",
        ]);

        expect(amountsExcludingVat).toEqual([4, 25, 8]);

        expect(totalExcludingVat).toBe(journeyQuote.fareCalculation.basicFareExcludingVat);
        expect(totalVat).toBe(journeyQuote.fareCalculation.vatAmount);
        expect(totalIncludingVat).toBe(journeyQuote.fareCalculation.totalIncludingVatBeforeRounding);
    });

    it("adds an adjustment item when the minimum fare applies", () => {
        const journeyQuote = createTemporaryJourneyQuote(
            dutchDaytimePricingProfile,
            dutchPassengerTransportTaxRule,
            dutchEuroRoundingRule,
            1,
            1,
            15
        );

        const quoteItems = createJourneyQuoteItems(dutchDaytimePricingProfile, journeyQuote);

        const minimumFareItem = quoteItems.find(
            (quoteItem) => quoteItem.itemCode === "MINIMUM_FARE_ADJUSTMENT"
        );

        const totalExcludingVat = sumAmounts(quoteItems.map((quoteItem) => quoteItem.amountExcludingVat));
        const totalVat = sumAmounts(quoteItems.map((quoteItem) => quoteItem.vatAmount));
        const totalIncludingVat = sumAmounts(quoteItems.map((quoteItem) => quoteItem.amountIncludingVat));

        expect(quoteItems).toHaveLength(4);
        expect(minimumFareItem).toBeDefined();
        expect(minimumFareItem?.amountExcludingVat).toBe(8.1);

        expect(totalExcludingVat).toBe(15);
        expect(totalVat).toBe(1.35);
        expect(totalIncludingVat).toBe(16.35);
    });

    it("uses a rounding adjustment to reconcile the final rounded total", () => {
        const fiveCentRoundingRule = {
            ...dutchEuroRoundingRule,
            roundingIncrement: 0.05,
        };

        const journeyQuote = createTemporaryJourneyQuote(
            dutchDaytimePricingProfile,
            dutchPassengerTransportTaxRule,
            fiveCentRoundingRule,
            10,
            20,
            15
        );

        const quoteItems = createJourneyQuoteItems(
            dutchDaytimePricingProfile,
            journeyQuote
        );

        const totalIncludingVat = sumAmounts(
            quoteItems.map((quoteItem) => quoteItem.amountIncludingVat)
        );

        /*
        * Sum of quote items = total before final rounding.
        * Sum of quote items + rounding adjustment = final payable total.
        */
        expect(journeyQuote.fareCalculation.totalIncludingVatBeforeRounding).toBe(40.33);
        expect(journeyQuote.fareCalculation.roundingAdjustment).toBe(0.02);
        expect(journeyQuote.fareCalculation.finalTotalIncludingVat).toBe(40.35);

        expect(totalIncludingVat).toBe(
            journeyQuote.fareCalculation.totalIncludingVatBeforeRounding
        );

        expect(
            Number((totalIncludingVat + journeyQuote.fareCalculation.roundingAdjustment).toFixed(4))
        ).toBe(journeyQuote.fareCalculation.finalTotalIncludingVat);
    });
});