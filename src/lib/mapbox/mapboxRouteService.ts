/*
 * File purpose:
 * This server-only service connects the Voya Taxi application to Mapbox.
 *
 * Mapbox is an online mapping and location platform. It can:
 * - convert addresses into geographic coordinates;
 * - calculate driving routes between locations;
 * - estimate travel distance and duration;
 * - provide map, navigation and traffic-related services.
 *
 * This file currently uses the Mapbox Directions API to calculate the driving
 * distance and estimated travel time between two geographic coordinates.
 *
 * The Mapbox access token stays on the server, so it is not exposed to users.
 * The service returns simplified values such as distance in metres/kilometres
 * and duration in seconds/minutes.
 *
 * This file can later be reused for booking estimates, chauffeur availability,
 * fare calculations and other route-related features.
 */

import "server-only";

// Represents one geographic point in Mapbox longitude-latitude order.
export type MapboxCoordinate = {
    longitude: number;
    latitude: number;
};

// Represents the useful route values returned to the application.
export type RouteEstimate = {
    distanceMeters: number;
    distanceKilometers: number;
    durationSeconds: number;
    durationMinutes: number;
};

/**
  routes is an array because Mapbox can return more than one possible route between the same two locations.
    For example:

    Route 1 → fastest route
    Route 2 → alternative route avoiding another road
    Route 3 → another possible alternative

    Mapbox can return the main route plus up to two alternative routes when alternatives=true.
 */
// Represents only the Mapbox response fields that this service needs.
type MapboxDirectionsResponse = {
    code?: string;
    message?: string;
    routes?: Array<{ distance: number; duration: number; }>;
};

const directionsBaseUrl = "https://api.mapbox.com/directions/v5/mapbox/driving";

// Calculates driving distance and estimated duration between two coordinates.
export async function calculateRouteEstimate( startCoordinate: MapboxCoordinate, endCoordinate: MapboxCoordinate): Promise<RouteEstimate> {
    // Reads the private token only on the Next.js server.
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;

    if (!accessToken) {
        throw new Error("MAPBOX_ACCESS_TOKEN is missing.");
    }

    // Mapbox requires longitude first and latitude second.
    const coordinates =
        `${startCoordinate.longitude},${startCoordinate.latitude};` +
        `${endCoordinate.longitude},${endCoordinate.latitude}`;

    const requestUrl = new URL(`${directionsBaseUrl}/${coordinates}`);

    //Sends your Mapbox access token so Mapbox can authorize the request.
    requestUrl.searchParams.set("access_token", accessToken);
    //Tells Mapbox not to return the full route geometry. We only need distance and duration, so this keeps the response smaller.
    requestUrl.searchParams.set("overview", "false");
    //Requests only the main recommended route, without additional alternative routes.
    requestUrl.searchParams.set("alternatives", "false");
    //Tells Mapbox not to return turn-by-turn navigation instructions. We only need the total route information.
    requestUrl.searchParams.set("steps", "false");

    // Sends the route request without storing an old result in the cache.
    const response = await fetch(requestUrl, { cache: "no-store" });
    const result = await response.json() as MapboxDirectionsResponse;
    const firstRoute = result.routes?.[0];

    if (!response.ok || result.code !== "Ok" || !firstRoute) {
        throw new Error(result.message || "Mapbox could not calculate the route.");
    }

    // Converts Mapbox meters and seconds into values suitable for the UI.
    return {
        distanceMeters: Math.round(firstRoute.distance),
        distanceKilometers: Math.round(firstRoute.distance / 100) / 10,
        durationSeconds: Math.round(firstRoute.duration),
        durationMinutes: Math.ceil(firstRoute.duration / 60),
    };
}