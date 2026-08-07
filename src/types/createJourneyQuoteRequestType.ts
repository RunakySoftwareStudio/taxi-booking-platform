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
 */

import type { MapboxCoordinate } from "@/types/mapboxType";

export type CreateJourneyQuoteRequest = {
    pickupCoordinate: MapboxCoordinate;
    destinationCoordinate: MapboxCoordinate;
};