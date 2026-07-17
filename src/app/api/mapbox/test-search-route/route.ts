/*
 * File purpose:
 * This temporary API route tests the full Mapbox location and route workflow.
 *
 * It searches for Amsterdam Centraal and Schiphol Airport, retrieves their
 * exact coordinates and calculates the driving distance and estimated duration.
 *
 * Separate Search Box session tokens are used for pickup and destination.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
    retrieveLocation,
    suggestLocations,
} from "@/lib/mapbox/mapboxSearchBoxService";
import { calculateRouteEstimate } from "@/lib/mapbox/mapboxRouteService";

// Searches for two locations and calculates the route between them.
export async function GET() {
    try {
        // Each independent location search receives its own session token.
        const pickupSessionToken = randomUUID();
        const destinationSessionToken = randomUUID();

        // Searches for the pickup location.
        const pickupSuggestions = await suggestLocations(
            "Amsterdam Centraal",
            pickupSessionToken,
            { countryCode: "nl", languageCode: "nl", limit: 5 },
        );

        const pickupSuggestion = pickupSuggestions[0];

        if (!pickupSuggestion) {
            return NextResponse.json(
                { message: "The pickup location was not found." },
                { status: 404 },
            );
        }

        // Searches for the destination location.
        const destinationSuggestions = await suggestLocations(
            "Schiphol Airport",
            destinationSessionToken,
            { countryCode: "nl", languageCode: "nl", limit: 5 },
        );

        const destinationSuggestion = destinationSuggestions[0];

        if (!destinationSuggestion) {
            return NextResponse.json(
                { message: "The destination was not found." },
                { status: 404 },
            );
        }

        // Retrieves exact coordinates for both selected suggestions.
        const pickupLocation = await retrieveLocation(
            pickupSuggestion.mapboxId,
            pickupSessionToken,
            "nl",
        );

        const destinationLocation = await retrieveLocation(
            destinationSuggestion.mapboxId,
            destinationSessionToken,
            "nl",
        );

        // Calculates the driving route between both selected locations.
        const routeEstimate = await calculateRouteEstimate(
            pickupLocation.coordinate,
            destinationLocation.coordinate,
        );

        return NextResponse.json({
            pickup: pickupLocation,
            destination: destinationLocation,
            route: routeEstimate,
        });
    } catch (error) {
        console.error("Mapbox Search Box route test error:", error);

        return NextResponse.json(
            { message: "The Mapbox route could not be calculated." },
            { status: 500 },
        );
    }
}