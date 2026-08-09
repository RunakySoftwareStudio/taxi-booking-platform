import { describe, expect, it } from "vitest";

import { isCreateJourneyQuoteRequest } from "@/lib/pricing/isCreateJourneyQuoteRequest";

/**
 * Purpose:
 * Tests the journey-quote request validator.
 *
 * The browser now sends only:
 * - pickup coordinates;
 * - destination coordinates.
 *
 * Distance and duration are no longer trusted browser inputs.
 * They are calculated later by the server using Mapbox.
 */
describe("isCreateJourneyQuoteRequest", () => {

    it("returns true for valid pickup and destination coordinates", () => {
        const requestData: unknown = {
            bookingSessionId: "7e7794f1-4715-4ca7-a93a-85a0a756ee93",
            pickupCoordinate: {
                longitude: 4.9041,
                latitude: 52.3676,
            },
            destinationCoordinate: {
                longitude: 4.4777,
                latitude: 51.9244,
            },
        };

        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(true);
    });


    it("returns false when a coordinate value is not a number", () => {
        const requestData: unknown = {
            bookingSessionId: "7e7794f1-4715-4ca7-a93a-85a0a756ee93",
            pickupCoordinate: {
                longitude: "4.9041",
                latitude: 52.3676,
            },
            destinationCoordinate: {
                longitude: 4.4777,
                latitude: 51.9244,
            },
        };

        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(false);
    });


    it("returns false when longitude is outside the valid range", () => {
        const requestData: unknown = {
            bookingSessionId: "7e7794f1-4715-4ca7-a93a-85a0a756ee93",
            pickupCoordinate: {
                longitude: 181,
                latitude: 52.3676,
            },
            destinationCoordinate: {
                longitude: 4.4777,
                latitude: 51.9244,
            },
        };

        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(false);
    });


    it("returns false when latitude is outside the valid range", () => {
        const requestData: unknown = {
            bookingSessionId: "7e7794f1-4715-4ca7-a93a-85a0a756ee93",
            pickupCoordinate: {
                longitude: 4.9041,
                latitude: 91,
            },
            destinationCoordinate: {
                longitude: 4.4777,
                latitude: 51.9244,
            },
        };

        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(false);
    });


    it("returns false when one required coordinate is missing", () => {
        const requestData: unknown = {
            bookingSessionId: "7e7794f1-4715-4ca7-a93a-85a0a756ee93",
            pickupCoordinate: {
                longitude: 4.9041,
                latitude: 52.3676,
            },
        };

        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(false);
    });


    it("returns false when the input is not an object", () => {
        const requestData: unknown = "invalid request";
        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(false);
    });

    it("returns false when the booking session ID is missing", () => {
        const requestData: unknown = {
            pickupCoordinate: {
                longitude: 4.9041,
                latitude: 52.3676,
            },
            destinationCoordinate: {
                longitude: 4.4777,
                latitude: 51.9244,
            },
        };

        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(false);
    });

    it("returns false when the booking session ID is empty", () => {
        const requestData: unknown = {
            bookingSessionId: "",
            pickupCoordinate: {
                longitude: 4.9041,
                latitude: 52.3676,
            },
            destinationCoordinate: {
                longitude: 4.4777,
                latitude: 51.9244,
            },
        };

        const isValidRequest = isCreateJourneyQuoteRequest(requestData);
        expect(isValidRequest).toBe(false);
    });
});