import { describe, expect, it } from "vitest";

import { dutchEuroRoundingRule } from "../../../src/data/countryRoundingRuleData";
import { calculateJourneyFareFromVatAmount } from "../../../src/lib/pricing/calculateJourneyFareFromVatAmount";

/**
 * Purpose:
 * Tests the final part of the journey-fare calculation when
 * the total VAT amount has already been calculated.
 *
 * This is important for cross-border journeys, where VAT may
 * come from several country tax allocations.
 *
 * Example:
 * Fare excluding VAT:        €37.00
 * Total VAT:                  €3.33
 * Before final rounding:     €40.33
 * Rounding adjustment:        €0.02
 * Final total:               €40.35
 */
describe("calculateJourneyFareFromVatAmount", () => {
    it("applies final currency rounding to an already calculated VAT amount", () => {
        const fiveCentRoundingRule = {
            ...dutchEuroRoundingRule,
            roundingIncrement: 0.05,
        };

        const fareCalculation = calculateJourneyFareFromVatAmount(
            37,
            3.33,
            fiveCentRoundingRule
        );

        expect(fareCalculation.basicFareExcludingVat).toBe(37);
        expect(fareCalculation.vatAmount).toBe(3.33);
        expect(fareCalculation.totalIncludingVatBeforeRounding).toBe(40.33);
        expect(fareCalculation.roundingAdjustment).toBe(0.02);
        expect(fareCalculation.finalTotalIncludingVat).toBe(40.35);
    });
});