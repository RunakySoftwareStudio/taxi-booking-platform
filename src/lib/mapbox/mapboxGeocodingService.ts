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
/* =============================Explation:======================================
 * 1. 
    The booking form calls your own API
        The browser does not contact Mapbox directly. It calls your Next.js route, for example:
        fetch("/api/mapbox/location-suggestions?..."); 
    That request goes to your own server:
        Browser
        → Voya Taxi Next.js server
2. 
    Your API route calls the Mapbox service
    The API route imports a service such as:
    import { suggestLocations } from "@/lib/mapbox/mapboxSearchBoxService";
    It then calls that function:
        const suggestions = await suggestLocations(
            searchText,
            sessionToken,
            options );

3. The service reads the environment variable
    Inside the Mapbox service, the code reads:
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    At runtime, this becomes something like:
    const accessToken = "pk.eyJ...";
    The variable name tells our code where the token is stored.

4. Our code builds a Mapbox URL
    The service contains a Mapbox address, such as:
    const url = new URL( "https://api.mapbox.com/search/searchbox/v1/suggest");
    This part tells the server where to send the request: api.mapbox.com
    Then the token is added as a query parameter: url.searchParams.set("access_token", accessToken);
    The resulting request becomes approximately: https://api.mapbox.com/search/searchbox/v1/suggest
        ?q=amsterdam
        &access_token=pk.eyJ...
    Then our server sends it: const response = await fetch(url);
    The important distinction, These three things have separate jobs:
    MAPBOX_ACCESS_TOKEN
        This is the name used by our Next.js code to retrieve the value.
    pk.eyJ...
        This is the actual Mapbox token value.

    https://api.mapbox.com/...
        This is the destination where our server sends the request.

    The pk. prefix does not tell Next.js where to send anything. It only tells Mapbox that this is a public access token.
    Complete flow:
        .env.local
        MAPBOX_ACCESS_TOKEN=pk.eyJ...
                ↓
        process.env.MAPBOX_ACCESS_TOKEN
                ↓
        accessToken variable contains "pk.eyJ..."
                ↓
        Our code adds it as:
        access_token=pk.eyJ...
                ↓
        fetch("https://api.mapbox.com/...")
                ↓
        Mapbox receives and validates the token
    So the simplest answer is:
    The server knows because our TypeScript code explicitly reads MAPBOX_ACCESS_TOKEN, adds its value to the access_token parameter, and sends the request to api.mapbox.com.
 =========================================================================*/
import "server-only";

import type { MapboxCoordinate } from "@/lib/mapbox/mapboxRouteService";

// Represents the simplified location returned to the Voya Taxi application.
export type GeocodedLocation = {
    mapboxId: string;
    formattedAddress: string;
    coordinate: MapboxCoordinate;
};

export type ReverseGeocodedLocation = {
    countryCode: string;
};

// Represents optional filters for an address search.
export type GeocodeAddressOptions = {
    countryCode?: string;
};

/*
    PURPOSE: DETERMINE THE COUNTRY OF A COORDINATE

    This function:
    - receives longitude and latitude;
    - validates the coordinate;
    - asks Mapbox which country contains that coordinate;
    - returns the ISO two-letter country code such as NL or BE.

    This runs only on the server.
    The browser does not decide the pricing country.
*/


// Represents only the Mapbox response fields required by this service.
type MapboxGeocodingResponse = {
    features?: Array<{
        id?: string;
        geometry?: { coordinates?: [number, number]; };
        properties?: {
            full_address?: string;
            name?: string;
            place_formatted?: string;
            feature_type?: string;
            country_code?: string;
            context?: {country?: {country_code?: string;};};
        };
    }>;
};

/**
 * const geocodingBaseUrl = "https://api.mapbox.com/search/geocode/v6/forward"; (FORWARD )
    * Address → Coordinates
    * "Damrak 1, Amsterdam"
    *         ↓
    * 4.89, 52.3
*
* const reverseGeocodingBaseUrl = "https://api.mapbox.com/search/geocode/v6/reverse"; (REVERSE)
    Coordinates → Location information
    4.89, 52.37
        ↓
    Netherlands / NL
 */

//“I have a written address. Tell me where it is.” does not send a request. It only saves the Mapbox destination address in a constant.
const geocodingBaseUrl = "https://api.mapbox.com/search/geocode/v6/forward";

//"The internet address of Mapbox's reverse-geocoding service". only stores the Mapbox endpoint address in a variable.
const reverseGeocodingBaseUrl = "https://api.mapbox.com/search/geocode/v6/reverse";

/*
    PURPOSE: DETERMINE THE COUNTRY OF A COORDINATE

    Coordinate → Mapbox reverse geocoding → country code

    Example:
    { longitude: 4.9041, latitude: 52.3676 }
        ↓
    { countryCode: "NL" }
*/
export async function reverseGeocodeCoordinate(coordinateValue: MapboxCoordinate): Promise<ReverseGeocodedLocation> {

    const { longitude, latitude } = coordinateValue;

    if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
    ) {
        throw new Error("The coordinate is invalid.");
    }

    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!accessToken) { throw new Error("MAPBOX_ACCESS_TOKEN is missing."); }

    const requestUrl = new URL(reverseGeocodingBaseUrl);

    requestUrl.searchParams.set("longitude", String(longitude));
    requestUrl.searchParams.set("latitude", String(latitude));
    requestUrl.searchParams.set("access_token", accessToken);

    const response = await fetch(requestUrl, { cache: "no-store" });
    const result = await response.json() as MapboxGeocodingResponse;

    if (!response.ok) {
        throw new Error("Mapbox reverse geocoding failed.");
    }

    const countryCode = result.features
        ?.map((feature) =>
            feature.properties?.context?.country?.country_code ||
            (feature.properties?.feature_type === "country"
                ? feature.properties?.country_code
                : undefined)
        )
        .find(Boolean);

    if (!countryCode) {
        throw new Error("The pickup country could not be determined.");
    }

    return {
        countryCode: countryCode.toUpperCase(),
    };
}
// Converts written address text into coordinates.
export async function geocodeAddress( addressText: string, options: GeocodeAddressOptions = {}): Promise<GeocodedLocation> {
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