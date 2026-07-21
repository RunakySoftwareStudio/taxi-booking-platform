/*
 * File purpose:
 * This temporary API route tests the Mapbox Search Box service.
 *
 * It searches for Amsterdam Centraal, returns the available suggestions,
 * selects the first result and retrieves its exact geographic coordinates.
 *
 * This confirms that Voya Taxi can find stations, airports, addresses and
 * other points of interest before calculating a driving route.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
    retrieveLocation,
    suggestLocations,
} from "@/lib/mapbox/mapboxSearchBoxService";

// Tests the complete suggest-and-retrieve Search Box process.
export async function GET() {
    try {
        // One session token connects the suggest and retrieve requests.
        const sessionToken = randomUUID();

        // Searches for matching locations in the Netherlands.
        const suggestions = await suggestLocations(
            "Amsterdam Centraal",
            sessionToken,
            {
                countryCode: "nl",
                languageCode: "nl",
                limit: 5,
            },
        );

        // Stops when Mapbox returns no matching locations.
        const firstSuggestion = suggestions[0];

        if (!firstSuggestion) {
            return NextResponse.json(
                { message: "No location suggestions were found." },
                { status: 404 },
            );
        }

        // Retrieves the coordinates of the first suggestion.
        const selectedLocation = await retrieveLocation(
            firstSuggestion.mapboxId,
            sessionToken,
            "nl",
        );

        // Returns the suggestions and selected location for inspection.
        return NextResponse.json({
            searchText: "Amsterdam Centraal",
            suggestions,
            selectedLocation,
        });
    } catch (error) {
        console.error("Mapbox Search Box test error:", error);

        return NextResponse.json(
            { message: "The Mapbox location search could not be completed." },
            { status: 500 },
        );
    }
}