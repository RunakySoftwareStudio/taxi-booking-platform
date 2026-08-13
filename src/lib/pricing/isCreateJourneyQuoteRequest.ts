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
        typeof requestData.bookingSessionId === "string" &&
        requestData.bookingSessionId.trim() !== "" &&

        /*
         * /^\d{2}:\d{2}$/.test(requestData.time)
         * It validates the expected format: time → HH:MM
         * This is a regular expression (RegEx) used to check whether requestData.time has the expected time format.
            Break it apart:
            /                 start of the regular expression
            ^                 start of the text
            \d                one digit: 0–9
            {2}               exactly two of them
            :                 literal colon
            \d{2}             exactly two more digits
            $                 end of the text
            /                 end of the regular expression
            .test(...)        check whether the value matches

            /^\d{2}:\d{2}$/.test("7:30")     // false
            /^\d{2}:\d{2}$/.test("19.30")    // false
            /^\d{2}:\d{2}$/.test("19:30abc") // false
            /^\d{2}:\d{2}$/.test("23:59 ") // true
         */
        typeof requestData.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(requestData.date) &&

        typeof requestData.time === "string" &&
        /^\d{2}:\d{2}$/.test(requestData.time) &&

        isValidCoordinate(requestData.pickupCoordinate) &&
        isValidCoordinate(requestData.destinationCoordinate)
    );
}