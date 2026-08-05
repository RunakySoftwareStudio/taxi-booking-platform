/**
 * Purpose:
 * Defines one detailed calculation line belonging to a journey quote.
 *
 * Examples:
 * - Base fare
 * - Distance fare
 * - Duration fare
 * - Minimum-fare adjustment
 *
 * Monetary calculation values are stored with up to four decimals.
 * Final customer-facing currency rounding is stored on the quote header.
 * 
 * The quoteId is intentionally not included here. This type represents the calculated line; 
 * the API route will add the quote ID when inserting the line into Supabase.
 */

export type JourneyQuoteItemCode =
    | "BASE_FARE"
    | "DISTANCE_FARE"
    | "DURATION_FARE"
    | "MINIMUM_FARE_ADJUSTMENT";

export type JourneyQuoteItem = {
    itemCode: JourneyQuoteItemCode;
    description: string;

    quantity: number;
    unit: string;

    unitAmountExcludingVat: number;
    amountExcludingVat: number;

    vatRatePercentage: number;
    vatAmount: number;

    amountIncludingVat: number;
    calculationOrder: number;
};