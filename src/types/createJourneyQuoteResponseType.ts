import type { TemporaryJourneyQuote } from "@/types/temporaryJourneyQuoteType";

/**
 * Purpose:
 * Defines the successful response returned by the journey-quote API.
 * It will help the booking form understand the exact structure returned by the API.
 * The reason the type is exported from a separate file is that both sides can reuse it:
    API route creates the response
    Booking form receives the response
    Both use CreateJourneyQuoteResponse

    This ensures the server and booking form agree on the JSON structure. 
    If the route were the only place that needed the type, we could define it directly inside route.ts.
 */
export type CreateJourneyQuoteResponse = {
    journeyQuote: TemporaryJourneyQuote;
};