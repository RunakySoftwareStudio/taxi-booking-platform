/*
 * File purpose:
 * This file contains reusable TypeScript types for Mapbox location searches,
 * selected locations and route estimates used by the Voya Taxi frontend.
 *
 * These types can later be reused by the booking form, chauffeur matching,
 * fare calculations, availability checks and map-related components.
 * 
    mapboxSearchBoxService.ts → communicates with Mapbox
    mapboxRouteService.ts     → calculates the route
    mapboxType.ts             → describes data used by the frontend

 */

// Represents one geographic point in longitude-latitude order.
export type MapboxCoordinate = { longitude: number; latitude: number };

// Represents one item returned by the location-suggestions API.
export type LocationSuggestion = {
    mapboxId: string;
    name: string;
    fullAddress: string;
    featureType: string;
};

// Represents one selected location with exact coordinates.
export type RetrievedLocation = LocationSuggestion & { coordinate: MapboxCoordinate };

// Represents calculated route distance and travel duration.
export type RouteEstimate = {
    distanceMeters: number;
    distanceKilometers: number;
    durationSeconds: number;
    durationMinutes: number;
};

// Represents responses returned by our three Mapbox API routes.
export type LocationSuggestionsResponse = { suggestions: LocationSuggestion[] };
export type RetrievedLocationResponse = { location: RetrievedLocation };
export type RouteEstimateResponse = { route: RouteEstimate };