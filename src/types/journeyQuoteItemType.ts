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

    /*
    * Domestic quote items can store one VAT calculation directly.
    *
    * For a multi-country quote, these fields are null because the
    * exact VAT breakdown is stored in journey_quote_tax_allocations.
    * So conceptually:
        Domestic NL item:
            BASE_FARE
            amountExcludingVat = €4.50
            vatRatePercentage  = 9
            vatAmount          = €0.41
            amountIncludingVat = €4.91

        Cross-border item:
            BASE_FARE
            amountExcludingVat = €4.50
            vatRatePercentage  = null
            vatAmount          = null
            amountIncludingVat = null

        Exact VAT  → journey_quote_tax_allocations
    */
    vatRatePercentage: number | null;
    vatAmount: number | null;
    amountIncludingVat: number | null;

    calculationOrder: number;
};