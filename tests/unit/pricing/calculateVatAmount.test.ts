import { describe, expect, it } from "vitest";

import { dutchPassengerTransportTaxRule } from "../../../src/data/countryTaxRuleData";
import { calculateVatAmount } from "../../../src/lib/pricing/calculateVatAmount";

/**
 * Purpose:
 * Tests VAT calculation and VAT cent rounding using the
 * Dutch passenger-transport tax rule.
 */
describe("calculateVatAmount", () => {

    it("calculates 9 percent VAT on a fare excluding VAT", () => {
        const vatAmount = calculateVatAmount(
            37,
            dutchPassengerTransportTaxRule
        );

        expect(vatAmount).toBe(3.33);
    });

    it("rounds the VAT amount mathematically to 2 decimals", () => {
        const vatAmount = calculateVatAmount(
            37.06,
            dutchPassengerTransportTaxRule
        );

        expect(vatAmount).toBe(3.34);
    });

});