import { describe, expect, it } from "vitest";

import { dutchEuroRoundingRule } from "../../../src/data/countryRoundingRuleData";
import { roundCurrencyAmount } from "../../../src/lib/pricing/roundCurrencyAmount";

/**
 * Purpose:
 * Tests currency rounding using the Dutch euro rounding rule.
 *
 * Example:
 * €40.329 rounded to the nearest €0.01
 * = €40.33.
 */
describe("roundCurrencyAmount", () => {
    it("rounds an amount to the nearest euro cent", () => {
        const roundedAmount = roundCurrencyAmount(40.329, dutchEuroRoundingRule);

        console.log("Fare calculation result:", roundedAmount);
        expect(roundedAmount).toBe(40.33);
    });
});