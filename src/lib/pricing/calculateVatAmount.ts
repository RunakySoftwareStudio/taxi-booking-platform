import type { CountryTaxRule } from "@/types/countryTaxRuleType";

/**
 * Purpose:
 * Calculates the VAT amount using a configurable country tax rule.
 *
 * Example:
 * €37.00 excluding VAT × 9%
 * = €3.33 VAT.
 *
 * This function does not apply final currency rounding.
 * Rounding will be handled by a separate country rounding rule.
 */
export function calculateVatAmount(fareExcludingVat: number, taxRule: CountryTaxRule): number {
    const vatRate = taxRule.taxRatePercentage / 100;
    const vatAmount = fareExcludingVat * vatRate;

    // Return the calculated VAT amount before final currency rounding.
    return vatAmount;
}