/**
 * Purpose:
 * Defines one configurable country tax rule.
 *
 * Example:
 * Passenger transport in the Netherlands uses 9% VAT
 * for bookings made during the rule's effective period.
 *
 * This file defines only the data structure.
 * It does not calculate VAT.
 */
export type CountryTaxRule = {
    countryCode: string;
    taxName: string;
    serviceCategory: string;
    taxRatePercentage: number;
    effectiveFrom: string;
    effectiveUntil: string | null;
};