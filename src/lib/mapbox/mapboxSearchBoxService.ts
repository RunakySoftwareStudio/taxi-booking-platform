/*
 * File purpose:
 * This server-only service connects Voya Taxi to the Mapbox Search Box API.
 *
 * Mapbox Search Box searches for street addresses, airports, stations, hotels
 * and other points of interest.
 *
 * The search process has two steps:
 * 1. suggestLocations() returns possible matching locations.
 * 2. retrieveLocation() returns the exact coordinates of the selected result.
 *
 * The same session token must be used for both steps.
 *
 * The returned coordinates can then be passed to mapboxRouteService.ts to
 * calculate driving distance and estimated travel duration.
 */

import "server-only";
import type { MapboxCoordinate } from "@/lib/mapbox/mapboxRouteService";

// Represents one result shown in the location suggestion list.
export type LocationSuggestion = {
    mapboxId: string;
    name: string;
    fullAddress: string;
    featureType: string;
};

// Represents the selected location with its exact coordinates.
export type RetrievedLocation = {
    mapboxId: string;
    name: string;
    fullAddress: string;
    featureType: string;
    coordinate: MapboxCoordinate;
};

// Represents optional filters for a suggestion request.
export type LocationSuggestionOptions = {
    countryCode?: string;
    languageCode?: string;
    limit?: number;
};

// Represents the useful parts of the Mapbox suggestion response.
type MapboxSuggestResponse = {
    message?: string;
    suggestions?: Array<{
        mapbox_id: string;
        name: string;
        full_address?: string;
        place_formatted?: string;
        feature_type?: string;
    }>;
};

// Represents the useful parts of the Mapbox retrieve response.
type MapboxRetrieveResponse = {
    message?: string;
    features?: Array<{
        geometry?: {coordinates?: [number, number]; };
        properties?: {
            mapbox_id?: string;
            name?: string;
            full_address?: string;
            place_formatted?: string;
            feature_type?: string;
            coordinates?: { longitude?: number; latitude?: number; };
        };
    }>;
};

const searchBoxBaseUrl ="https://api.mapbox.com/search/searchbox/v1";

// Returns the private Mapbox token used by the server.
function getMapboxAccessToken() {
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!accessToken) { throw new Error("MAPBOX_ACCESS_TOKEN is missing."); }

    return accessToken;
}

// Searches for matching addresses and points of interest.
export async function suggestLocations( searchText: string, sessionToken: string, options: LocationSuggestionOptions = {},): Promise<LocationSuggestion[]> {
    const cleanedSearchText = searchText.trim();
    const cleanedSessionToken = sessionToken.trim();
    if (cleanedSearchText.length < 3) { return []; }
    if (cleanedSearchText.length > 256) { throw new Error("The location search text is too long."); }
    if (!cleanedSessionToken) { throw new Error("A Mapbox session token is required."); }

    const requestUrl = new URL(`${searchBoxBaseUrl}/suggest`);
    requestUrl.searchParams.set("q", cleanedSearchText);
    requestUrl.searchParams.set("session_token", cleanedSessionToken);
    requestUrl.searchParams.set("access_token", getMapboxAccessToken());
    requestUrl.searchParams.set("limit", String(Math.min(Math.max(options.limit ?? 5, 1), 10)), );
    if (options.countryCode) {requestUrl.searchParams.set("country", options.countryCode.toUpperCase(), ); }
    if (options.languageCode) { requestUrl.searchParams.set("language", options.languageCode, ); }

    const response = await fetch(requestUrl, { cache: "no-store", });
    const result = await response.json() as MapboxSuggestResponse;
    if (!response.ok) { throw new Error( result.message || "Mapbox could not search for locations.", ); }

    return (result.suggestions ?? []).map((suggestion) => ({
        mapboxId: suggestion.mapbox_id,
        name: suggestion.name,
        fullAddress:
            suggestion.full_address ||
            suggestion.place_formatted ||
            suggestion.name,
        featureType: suggestion.feature_type || "location",
    }));
}

// Retrieves the exact coordinates of one selected suggestion.
export async function retrieveLocation(mapboxId: string, sessionToken: string, languageCode?: string,): Promise<RetrievedLocation> {
    const cleanedMapboxId = mapboxId.trim();
    const cleanedSessionToken = sessionToken.trim();
    if (!cleanedMapboxId || !cleanedSessionToken) { throw new Error( "A Mapbox location ID and session token are required.", ); }

    const requestUrl = new URL( `${searchBoxBaseUrl}/retrieve/${encodeURIComponent(cleanedMapboxId)}`,);
    requestUrl.searchParams.set("session_token", cleanedSessionToken);
    requestUrl.searchParams.set("access_token", getMapboxAccessToken());
    if (languageCode) { requestUrl.searchParams.set("language", languageCode); }

    const response = await fetch(requestUrl, { cache: "no-store", });
    const result = await response.json() as MapboxRetrieveResponse;
    const firstFeature = result.features?.[0];
    const properties = firstFeature?.properties;
    const geometryCoordinates = firstFeature?.geometry?.coordinates;
    const longitude =  geometryCoordinates?.[0] ?? properties?.coordinates?.longitude;
    const latitude = geometryCoordinates?.[1] ??  properties?.coordinates?.latitude;

    if (!response.ok || !firstFeature || typeof longitude !== "number" || typeof latitude !== "number" ) {
        throw new Error( result.message || "Mapbox could not retrieve the location.", );
    }

    return {
        mapboxId: properties?.mapbox_id || cleanedMapboxId,
        name: properties?.name || "Selected location",
        fullAddress:
            properties?.full_address ||
            properties?.place_formatted ||
            properties?.name ||
            "Selected location",
        featureType: properties?.feature_type || "location",
        coordinate: {longitude, latitude, },
    };
}