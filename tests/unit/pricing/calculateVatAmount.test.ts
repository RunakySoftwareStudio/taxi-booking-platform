import { describe, expect, it } from "vitest";

import { dutchPassengerTransportTaxRule } from "../../../src/data/countryTaxRuleData";
import { calculateVatAmount } from "../../../src/lib/pricing/calculateVatAmount";

/**
 * Purpose:
 * Tests the VAT calculation using the Dutch passenger-transport tax rule.
 *
 * Example:
 * €37.00 excluding VAT × 9%
 * = approximately €3.33 VAT.
 */
describe("calculateVatAmount", () => {
    it("calculates 9 percent VAT on a fare excluding VAT", () => {
        const vatAmount = calculateVatAmount(
            37,
            dutchPassengerTransportTaxRule
        );
        console.log("Fare calculation result:", vatAmount);
        expect(vatAmount).toBeCloseTo(3.33, 2);
    });
});