/**
 * Purpose:
 * Defines the journey information that the browser sends
 * when requesting a temporary price quote.
 *
 * The browser sends only the selected pickup and destination coordinates.
 *
 * The server uses these coordinates to:
 * - calculate the trusted route distance;
 * - calculate the trusted route duration;
 * - determine the pickup country for pricing.
 *
 * The browser does NOT decide the distance, duration or pricing market.
 * bookingSessionId connects temporary quotes that belong to the same unfinished booking attempt.
 */

import type { MapboxCoordinate } from "@/types/mapboxType";

export type CreateJourneyQuoteRequest = {
    bookingSessionId: string;
    pickupCoordinate: MapboxCoordinate;
    destinationCoordinate: MapboxCoordinate;
};