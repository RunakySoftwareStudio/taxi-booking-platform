import type { TemporaryJourneyQuote } from "@/types/temporaryJourneyQuoteType";

/**
 * Purpose:
 * Checks whether a temporary journey quote has reached
 * or passed its expiration time.
 */
export function isTemporaryJourneyQuoteExpired(journeyQuote: TemporaryJourneyQuote): boolean {
    const currentTime = new Date().getTime();
    const expirationTime = new Date(journeyQuote.expiresAt).getTime();

    // The quote is expired when the current time reaches its expiration time.
    return currentTime >= expirationTime;
}