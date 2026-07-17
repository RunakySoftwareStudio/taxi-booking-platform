/*
 * File purpose:
 * This server-only service converts a written address into geographic
 * coordinates by using the Mapbox Geocoding API.
 *
 * Mapbox searches for the address and returns matching locations. This service
 * selects the most relevant result and returns its longitude, latitude,
 * formatted address and Mapbox location ID.
 *
 * The returned coordinates can then be passed to mapboxRouteService.ts to
 * calculate driving distance and estimated travel duration.
 *
 * This file can later be reused for booking estimates, address validation,
 * chauffeur searching, map markers and route-related features.
 * 
    mapboxGeocodingService.ts
        Written address → longitude and latitude
    mapboxRouteService.ts
        Coordinates → distance and duration
 */

import "server-only";

import type { MapboxCoordinate } from "@/lib/mapbox/mapboxRouteService";

// Represents the simplified location returned to the Voya Taxi application.
export type GeocodedLocation = {
    mapboxId: string;
    formattedAddress: string;
    coordinate: MapboxCoordinate;
};

// Represents optional filters for an address search.
export type GeocodeAddressOptions = {
    countryCode?: string;
};

// Represents only the Mapbox response fields required by this service.
type MapboxGeocodingResponse = {
    features?: Array<{
        id?: string;
        geometry?: { coordinates?: [number, number]; };
        properties?: { full_address?: string; name?: string; place_formatted?: string; };
    }>;
};

const geocodingBaseUrl = "https://api.mapbox.com/search/geocode/v6/forward";

// Converts written address text into coordinates.
export async function geocodeAddress(
    addressText: string,
    options: GeocodeAddressOptions = {},
): Promise<GeocodedLocation> {
    // Cleans and validates the provided search text.
    const cleanedAddress = addressText.trim();
    if (cleanedAddress.length < 3) { throw new Error("The address is too short."); }

    // Reads the token only from the Next.js server environment.
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!accessToken) { throw new Error("MAPBOX_ACCESS_TOKEN is missing."); }

    // Creates the Mapbox forward-geocoding request.
    const requestUrl = new URL(geocodingBaseUrl);

    requestUrl.searchParams.set("q", cleanedAddress);
    requestUrl.searchParams.set("access_token", accessToken);
    requestUrl.searchParams.set("autocomplete", "false");
    requestUrl.searchParams.set("limit", "1");
    // Optionally limits results to a country such as nl or be.
    if (options.countryCode) { requestUrl.searchParams.set("country", options.countryCode.toLowerCase(), );  }

    // Temporary geocoding results are requested without application caching.
    const response = await fetch(requestUrl, { cache: "no-store", });
    const result = await response.json() as MapboxGeocodingResponse;
    const firstLocation = result.features?.[0];
    const coordinates = firstLocation?.geometry?.coordinates;

    // Stops when Mapbox cannot find a usable location.
    if (!response.ok || !firstLocation || !coordinates || coordinates.length < 2 ) { throw new Error(`No location was found for: ${cleanedAddress}`); }

    const [longitude, latitude] = coordinates;
    const properties = firstLocation.properties;

    // Builds readable text when full_address is unavailable.
    const formattedAddress = properties?.full_address || [properties?.name, properties?.place_formatted].filter(Boolean).join(", ") ||  cleanedAddress;

    // Returns only the location information needed by the application.
    return {
        mapboxId: firstLocation.id || "",
        formattedAddress,
        coordinate: {longitude, latitude,},
    };
}