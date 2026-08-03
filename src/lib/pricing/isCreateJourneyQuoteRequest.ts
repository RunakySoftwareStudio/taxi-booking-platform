import type { CreateJourneyQuoteRequest } from "@/types/createJourneyQuoteRequestType";

/**
 * Purpose:
 * Checks whether data received from the browser contains a valid journey distance and estimated duration.
 * Important:
    unknown: means we do not trust the browser data yet.
    Number.isFinite(...): rejects invalid values such as Infinity and NaN.
    inputValue is CreateJourneyQuoteRequest: tells TypeScript that successfully validated data has the correct request structure.

    If all those runtime checks passed and the function returned true, treat inputValue as a CreateJourneyQuoteRequest.
    Is it an object?
       ↓
    Does it contain the required numeric properties?
        ↓
    Are those numbers finite and greater than zero?
        ↓
    Return true
    Then this type predicate:
        inputValue is CreateJourneyQuoteRequest
        does not perform another check. It only tells TypeScript: If all those runtime checks passed and returned true, treat inputValue as a CreateJourneyQuoteRequest.
 */
export function isCreateJourneyQuoteRequest(inputValue: unknown): inputValue is CreateJourneyQuoteRequest {
    if (typeof inputValue !== "object" || inputValue === null) {
        return false;
    }

    const requestData = inputValue as Record<string, unknown>;

    // Return true only when both values are finite positive numbers.
    return (
        typeof requestData.distanceKm === "number" &&
        Number.isFinite(requestData.distanceKm) &&
        requestData.distanceKm > 0 &&
        typeof requestData.estimatedDurationMinutes === "number" &&
        Number.isFinite(requestData.estimatedDurationMinutes) &&
        requestData.estimatedDurationMinutes > 0
    );
}