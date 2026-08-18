import type { JourneyFareCalculation } from "./journeyFareCalculationType";

/**
 * Purpose:
 * Defines a temporary journey quote shown to the customer
 * before the booking is confirmed.
 *
 * The quote records the pricing version and calculated amounts
 * that were used at the moment the quote was created.
 *
 * Important fields:
 * - quoteId: uniquely identifies the quote.
 * - pricingProfileCode and pricingProfileVersion:
 *   record which pricing configuration was used.
 * - taxRatePercentage: stores the single VAT rate for a domestic quote; is null for a multi-country quote, where exact tax rates are stored in journey_quote_tax_allocations.
 * - fareCalculation: contains the calculated amounts.
 * - expiresAt: prevents confirmation of an outdated quote.
 */
export type TemporaryJourneyQuote = {
    quoteId: string;
    pricingProfileCode: string;
    pricingProfileVersion: number;
    countryCode: string;
    currencyCode: string;
    distanceKm: number;
    estimatedDurationMinutes: number;
    /*
     * Domestic quote → one VAT rate.
     * Multi-country quote → null; exact rates are stored
     * in the country tax allocations.
     */
    taxRatePercentage: number | null;
    fareCalculation: JourneyFareCalculation;
    createdAt: string;
    expiresAt: string;
};