/**
 * Purpose:
 * Defines one configurable country rounding rule.
 *
 * Example:
 * A final euro amount can be rounded to the nearest €0.01.
 *
 * This file defines only the data structure.
 * It does not perform the rounding calculation.
 */
export type CountryRoundingRule = {
    countryCode: string;
    currencyCode: string;
    roundingIncrement: number;
    roundingMode: "nearest" | "up" | "down";
    effectiveFrom: string;
    effectiveUntil: string | null;
};