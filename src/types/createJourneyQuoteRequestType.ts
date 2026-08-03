/**
 * Purpose:
 * Defines the journey information that the browser sends
 * when requesting a temporary price quote.
 */
export type CreateJourneyQuoteRequest = {
    distanceKm: number;
    estimatedDurationMinutes: number;
};