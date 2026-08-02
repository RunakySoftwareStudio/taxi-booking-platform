import { describe, expect, it } from "vitest";

import { dutchEuroRoundingRule } from "../../../src/data/countryRoundingRuleData";
import { dutchPassengerTransportTaxRule } from "../../../src/data/countryTaxRuleData";
import { dutchDaytimePricingProfile } from "../../../src/data/pricingProfileData";
import { calculateJourneyFare } from "../../../src/lib/pricing/calculateJourneyFare";

/**
 * Purpose:
 * Tests the complete journey-fare calculation.
 *
 * Example:
 * Basic fare excluding VAT: €37.00
 * VAT at 9%:               €3.33
 * Final total:            €40.33
 */
describe("calculateJourneyFare", () => {
    it("calculates the complete fare for a normal journey", () => {
        const fareCalculation = calculateJourneyFare(
            dutchDaytimePricingProfile,
            dutchPassengerTransportTaxRule,
            dutchEuroRoundingRule,
            10,
            20
        );
        console.log("Fare calculation result:", fareCalculation);
        
        expect(fareCalculation.basicFareExcludingVat).toBe(37);
        expect(fareCalculation.vatAmount).toBeCloseTo(3.33, 2);
        expect(fareCalculation.totalIncludingVatBeforeRounding).toBeCloseTo(40.33, 2);
        expect(fareCalculation.finalTotalIncludingVat).toBe(40.33);
    });
});