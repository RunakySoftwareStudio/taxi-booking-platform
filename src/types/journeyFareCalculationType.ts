/**
 * Purpose:
 * Defines the complete result of a journey-fare calculation.
 *
 * It keeps the individual amounts available so the customer,
 * administrator, invoice, and database can see how the final fare
 * was calculated.
 */

export type JourneyFareCalculation = {
    basicFareExcludingVat: number;
    vatAmount: number;
    totalIncludingVatBeforeRounding: number;
    roundingAdjustment: number;
    finalTotalIncludingVat: number;
};