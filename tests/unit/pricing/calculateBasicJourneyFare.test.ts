import { describe, expect, it } from "vitest";

import { dutchDaytimePricingProfile } from "../../../src/data/pricingProfileData";
import { calculateBasicJourneyFare } from "../../../src/lib/pricing/calculateBasicJourneyFare";

/**
 * Purpose:
 * Tests the basic journey fare calculation.
 *How it works:
    describe: groups tests belonging to this calculation function.
    it: describes the behaviour we are testing.
    calculatedFare contains the returned result.
    expect(calculatedFare).toBe(37) verifies the exact expected fare.

 * Example:
 * €4.00 base fare
 * + 10 km × €2.50
 * + 20 minutes × €0.40
 * = €37.00 excluding VAT.
 */
describe("calculateBasicJourneyFare", () => {
    it("calculates the basic fare for a normal journey", () => {
        const calculatedFare = calculateBasicJourneyFare(
            dutchDaytimePricingProfile,
            10,
            20
        );
        console.log("Fare calculation result:", calculatedFare);
        expect(calculatedFare).toBe(37);
    });
    

    it("returns the minimum fare when the calculated fare is too low", () => {
        const calculatedFare = calculateBasicJourneyFare(dutchDaytimePricingProfile, 1, 1);
        console.log("Fare calculation result:", calculatedFare);
        expect(calculatedFare).toBe(15);
    });
});