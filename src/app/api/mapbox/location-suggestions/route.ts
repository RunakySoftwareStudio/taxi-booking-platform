/*
 * File purpose:
 * This server API returns Mapbox address and POI suggestions to the booking form.
 * The Mapbox access token remains on the server and is never exposed to users.
 */

import { type NextRequest, NextResponse } from "next/server";
import { suggestLocations } from "@/lib/mapbox/mapboxSearchBoxService";

// Languages supported by Voya Taxi.
const supportedLanguageCodes = new Set(["en", "nl", "ar", "tr", "fa"]);

// Returns matching addresses, stations, airports and other locations.
export async function GET(request: NextRequest) {
    try {
        
        /**
            Reads and cleans the request values.
            q             → text entered by the client
            sessionToken  → connects the search requests belonging together
            languageCode  → preferred result language
            Example request:
                /api/mapbox/location-suggestions
                ?q=Amsterdam Centraal
                &sessionToken=...
                &languageCode=nl
         */
        const searchText = request.nextUrl.searchParams.get("q")?.trim() || "";
        const sessionToken = request.nextUrl.searchParams.get("sessionToken")?.trim() || "";
        const requestedLanguage = request.nextUrl.searchParams.get("languageCode")?.trim() || "en";

        // Validates the request before contacting Mapbox.
        if (searchText.length < 3) { return NextResponse.json({ suggestions: [] }); }
        if (!sessionToken) { return NextResponse.json({ message: "A location-search session token is required." }, { status: 400 }); }
        if (searchText.length > 256) { return NextResponse.json({ message: "The location search text is too long." }, { status: 400 }); }

        // Uses English when the requested language is unsupported.
        const languageCode = supportedLanguageCodes.has(requestedLanguage) ? requestedLanguage : "en";

        // Requests up to five Dutch location suggestions.
        const suggestions = await suggestLocations(searchText, sessionToken, { countryCode: "nl", languageCode, limit: 5 });

        return NextResponse.json({ suggestions });
    } catch (error) {
        console.error("Location-suggestions API error:", error);
        return NextResponse.json({ message: "Location suggestions could not be loaded." }, { status: 500 });
    }
}