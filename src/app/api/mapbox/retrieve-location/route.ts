/*
 * File purpose:
 * This server API retrieves the exact coordinates of a location selected from
 * the Mapbox suggestion list. It uses the same search-session token that was
 * used when loading the suggestions.
 */

import { type NextRequest, NextResponse } from "next/server";
import { retrieveLocation } from "@/lib/mapbox/mapboxSearchBoxService";

// Languages supported by Voya Taxi.
const supportedLanguageCodes = new Set(["en", "nl", "ar", "tr", "fa"]);

// Returns the selected location with its exact coordinates.
export async function GET(request: NextRequest) {
    try {
        // Reads and validates the request values.
        const mapboxId = request.nextUrl.searchParams.get("mapboxId")?.trim() || "";
        const sessionToken = request.nextUrl.searchParams.get("sessionToken")?.trim() || "";
        const requestedLanguage = request.nextUrl.searchParams.get("languageCode")?.trim() || "en";

        if (!mapboxId) { return NextResponse.json({ message: "A Mapbox location ID is required." }, { status: 400 }); }
        if (!sessionToken) { return NextResponse.json({ message: "A location-search session token is required." }, { status: 400 }); }

        // Uses English when the requested language is unsupported.
        const languageCode = supportedLanguageCodes.has(requestedLanguage) ? requestedLanguage : "en";

        // Retrieves the exact coordinates of the selected suggestion.
        const location = await retrieveLocation(mapboxId, sessionToken, languageCode);

        return NextResponse.json({ location });
    } catch (error) {
        console.error("Retrieve-location API error:", error);
        return NextResponse.json({ message: "The selected location could not be loaded." }, { status: 500 });
    }
}