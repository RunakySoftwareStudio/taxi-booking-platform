/*
 * File purpose:
 * This server API calculates the driving distance and estimated travel time
 * between the pickup and destination coordinates selected in the booking form.
 *
 * The browser sends coordinates only. The Mapbox access token remains safely
 * on the server inside mapboxRouteService.ts.
 */

import { NextResponse } from "next/server";
import { calculateRouteEstimate, type MapboxCoordinate } from "@/lib/mapbox/mapboxRouteService";

type RouteEstimateRequest = { pickup?: Partial<MapboxCoordinate>; destination?: Partial<MapboxCoordinate> };

// Checks that a coordinate contains valid longitude and latitude values.
function isValidCoordinate(coordinateValue: Partial<MapboxCoordinate> | undefined): coordinateValue is MapboxCoordinate {
    return !!coordinateValue &&
        typeof coordinateValue.longitude === "number" &&
        typeof coordinateValue.latitude === "number" &&
        coordinateValue.longitude >= -180 &&
        coordinateValue.longitude <= 180 &&
        coordinateValue.latitude >= -90 &&
        coordinateValue.latitude <= 90;
}

// Calculates a route between two selected locations.
export async function POST(request: Request) {
    try {
        const requestBody = await request.json() as RouteEstimateRequest;

        if (!isValidCoordinate(requestBody.pickup) || !isValidCoordinate(requestBody.destination)) {
            return NextResponse.json({ message: "Valid pickup and destination coordinates are required." }, { status: 400 });
        }

        const routeEstimate = await calculateRouteEstimate(requestBody.pickup, requestBody.destination);

        return NextResponse.json({ route: routeEstimate });
    } catch (error) {
        console.error("Route-estimate API error:", error);
        return NextResponse.json({ message: "The route estimate could not be calculated." }, { status: 500 });
    }
}