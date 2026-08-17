import type { CountryTaxRule } from "@/types/countryTaxRuleType";

/**
 * Purpose:
 * Calculates VAT over the total fare excluding VAT and rounds
 * the VAT amount mathematically to whole cents.
 *
 * Example:
 * €37.01 × 9% = €3.3309
 *              → €3.33 VAT.
 *
 * Final payable-price rounding is handled separately by the
 * configured currency rounding rule.
 */
export function calculateVatAmount(fareExcludingVat: number, taxRule: CountryTaxRule): number {
    const vatRate = taxRule.taxRatePercentage / 100;
    const vatAmount = fareExcludingVat * vatRate;

    // Return the calculated VAT amount before final currency rounding.
    return Number(vatAmount.toFixed(2));
}