import type { PricingProfile } from "@/types/pricingProfileType";

/**
 * Purpose:
 * Stores the temporary Dutch daytime pricing profile used for testing.
 *
 *  pricingProfileCode identifies the pricing policy.
    pricingProfileVersion identifies the precise version.
    effectiveFrom determines when it becomes valid.
    effectiveUntil: null means it currently has no end date.

 * Example:
 * A journey starts with a €4.00 base fare, plus €2.50 per kilometre
 * and €0.40 per estimated driving minute.
 *
 * These values exclude VAT.
 * Later, the active pricing profile will come from Supabase.
 */
export const dutchDaytimePricingProfile: PricingProfile = {
    pricingProfileCode: "NL_DAYTIME_STANDARD",
    pricingProfileVersion: 1,
    countryCode: "NL",
    currencyCode: "EUR",
    baseFareExcludingVat: 4.00,
    distanceRatePerKmExcludingVat: 2.50,
    durationRatePerMinuteExcludingVat: 0.40,
    minimumFareExcludingVat: 15.00,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
};