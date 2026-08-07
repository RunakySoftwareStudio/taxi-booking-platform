/**
 * Current validation flow:
 *
 * Valid pickup coordinates?
 *      ↓
 * Valid destination coordinates?
 *      ↓
 * true
 *
 * Distance and duration are NOT accepted from the browser.
 * They are calculated by the server from these coordinates.
 */
import type { CreateJourneyQuoteRequest } from "@/types/createJourneyQuoteRequestType";
import type { MapboxCoordinate } from "@/types/mapboxType";

/**
 * Purpose:
 * Checks whether one value contains a valid longitude and latitude.
 *
 * Longitude must be between -180 and 180.
 * Latitude must be between -90 and 90.
 */
function isValidCoordinate(inputValue: unknown): inputValue is MapboxCoordinate {
    if (typeof inputValue !== "object" || inputValue === null) { return false; }

    const coordinateData = inputValue as Record<string, unknown>;

    return (
        typeof coordinateData.longitude === "number" &&
        Number.isFinite(coordinateData.longitude) &&
        coordinateData.longitude >= -180 &&
        coordinateData.longitude <= 180 &&
        typeof coordinateData.latitude === "number" &&
        Number.isFinite(coordinateData.latitude) &&
        coordinateData.latitude >= -90 &&
        coordinateData.latitude <= 90
    );
}

/**
 * Purpose:
 * Checks whether data received from the browser is a valid
 * temporary journey-quote request.
 *
 * The browser only needs to provide:
 * - pickup coordinates;
 * - destination coordinates.
 *
 * Distance and duration are calculated later on the server.
 */
export function isCreateJourneyQuoteRequest(inputValue: unknown): inputValue is CreateJourneyQuoteRequest {

    if (typeof inputValue !== "object" || inputValue === null) { return false; }

    const requestData = inputValue as Record<string, unknown>;

    return (
        isValidCoordinate(requestData.pickupCoordinate) &&
        isValidCoordinate(requestData.destinationCoordinate)
    );
}