/*
 * File purpose:
 * This temporary API route tests whether the Voya Taxi application can connect
 * to Mapbox and calculate a driving route.
 *
 * It uses fixed coordinates for Amsterdam Central Station and Schiphol Airport.
 * Later, these fixed coordinates will be replaced by coordinates calculated
 * from the pickup and destination entered in the booking form.
 */

import { NextResponse } from "next/server";
import { calculateRouteEstimate } from "@/lib/mapbox/mapboxRouteService";

// Tests the reusable Mapbox route service with two fixed locations.
export async function GET() {
    try {
        // Amsterdam Central Station.
        const startCoordinate = {
            longitude: 4.9003,
            latitude: 52.3791,
        };

        // Amsterdam Airport Schiphol.
        const endCoordinate = {
            longitude: 4.7683,
            latitude: 52.3105,
        };

        // Requests the driving distance and estimated travel time from Mapbox.
        const routeEstimate = await calculateRouteEstimate(
            startCoordinate,
            endCoordinate,
        );

        // Returns simplified route information for testing.
        return NextResponse.json({
            from: "Amsterdam Central Station",
            to: "Schiphol Airport",
            ...routeEstimate,
        });
    } catch (error) {
        console.error("Mapbox test-route error:", error);

        return NextResponse.json(
            { message: "The Mapbox route could not be calculated." },
            { status: 500 },
        );
    }
}