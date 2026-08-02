import type { CountryRoundingRule } from "@/types/countryRoundingRuleType";

/**
 * Purpose:
 * Rounds a monetary amount using a configurable country rounding rule.
 *
 * Example:
 * €40.329 rounded to the nearest €0.01 becomes €40.33.
 */
export function roundCurrencyAmount( amountBeforeRounding: number, roundingRule: CountryRoundingRule): number {
    const roundingIncrement = roundingRule.roundingIncrement;

    if (roundingIncrement <= 0) throw new Error("Rounding increment must be greater than zero.");

    const unroundedUnits = amountBeforeRounding / roundingIncrement;
    let roundedUnits = Math.round(unroundedUnits);

    if (roundingRule.roundingMode === "up") roundedUnits = Math.ceil(unroundedUnits);
    if (roundingRule.roundingMode === "down") roundedUnits = Math.floor(unroundedUnits);

    const decimalPart = roundingIncrement.toString().split(".")[1];
    const decimalPlaces = decimalPart ? decimalPart.length : 0;
    const roundedAmount = roundedUnits * roundingIncrement;

    // Return the amount using the number of decimals defined by the increment.
    return Number(roundedAmount.toFixed(decimalPlaces));
}