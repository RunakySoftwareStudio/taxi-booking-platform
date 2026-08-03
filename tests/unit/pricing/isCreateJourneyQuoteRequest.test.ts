import { describe, expect, it } from "vitest";
import { isCreateJourneyQuoteRequest } from "../../../src/lib/pricing/isCreateJourneyQuoteRequest";

/**
 * Purpose:
 * Tests whether journey-quote request data received from the browser
 * is accepted only when both required values are valid.
 */
describe("isCreateJourneyQuoteRequest", () => {
    it("returns true for a valid journey quote request", () => {
        const requestData: unknown = {distanceKm: 10, estimatedDurationMinutes: 20};
        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(true);
    });

    it("returns false when a required value is not a number", () => {
        const requestData: unknown = {distanceKm: "10", estimatedDurationMinutes: 20};
        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(false);
    });

    it("returns false when a required number is zero or negative", () => {
        const requestData: unknown = {distanceKm: 0, estimatedDurationMinutes: -5};
        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(false);
    });

    it("returns false when the input is not an object", () => {
        const requestData: unknown = null;
        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(false);
    });
});