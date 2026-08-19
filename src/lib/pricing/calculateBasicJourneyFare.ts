import type { PricingProfile } from "@/types/pricingProfileType";

/**
 * Purpose:
 * Calculates the basic journey fare excluding VAT.
 *
 * Calculation:
 * Base fare + distance cost + duration cost.
 *
 * Example:
 * €4.00 + (10 km × €2.50) + (20 minutes × €0.40)
 * = €37.00 excluding VAT.
 *
 * If the calculated amount is below the minimum fare,
 * the minimum fare is returned instead.
 */
export function calculateBasicJourneyFare(
    pricingProfile: PricingProfile,
    distanceKm: number,
    estimatedDurationMinutes: number
): number {
    const distanceCost =
        distanceKm * 
        pricingProfile.distanceRatePerKmExcludingVat;

    const durationCost =
        estimatedDurationMinutes *  
        pricingProfile.durationRatePerMinuteExcludingVat;

    let basicFareExcludingVat =
        pricingProfile.baseFareExcludingVat +
        distanceCost +
        durationCost;

    if (basicFareExcludingVat < pricingProfile.minimumFareExcludingVat) {
        basicFareExcludingVat = pricingProfile.minimumFareExcludingVat;
    }

    /*
    * Normalize the financial amount to the same four-decimal
    * precision used by the database NUMERIC(12,4) columns.
    *
    * Example:
    *
    * JavaScript calculation:
    * 119.70000000000002
    *
    * Financial value:
    * 119.7000
    */
    basicFareExcludingVat = Number(basicFareExcludingVat.toFixed(4));

    // Return the normalized basic fare before VAT and final currency rounding.
    return basicFareExcludingVat;
}