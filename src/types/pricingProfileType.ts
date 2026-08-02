/**
 * Purpose:
 * Defines the required values for one configurable pricing profile.
 *
 * Example:
 * A Dutch daytime profile can have a €4.00 base fare,
 * €2.50 per kilometre and €0.40 per estimated minute.
 *
 * This file defines only the data structure.
 * It does not calculate the journey price.
 */
export type PricingProfile = {
    countryCode: string;
    currencyCode: string;
    baseFareExcludingVat: number;
    distanceRatePerKmExcludingVat: number;
    durationRatePerMinuteExcludingVat: number;
    minimumFareExcludingVat: number;
};