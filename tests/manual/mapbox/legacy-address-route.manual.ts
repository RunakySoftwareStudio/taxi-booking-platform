/*
 * File purpose:
 * This temporary API route tests the complete Mapbox calculation process.
 *
 * It converts two written addresses into geographic coordinates and then
 * calculates the driving distance and estimated travel duration between them.
 *
 * Later, the fixed addresses will be replaced by the pickup and destination
 * entered by the client in the booking form.
 */

import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/mapbox/mapboxGeocodingService";
import { calculateRouteEstimate } from "@/lib/mapbox/mapboxRouteService";

// Tests geocoding and route calculation with two written locations.
export async function GET() {
    try {
        // Fixed addresses used only for this development test.
        const pickupText = "Amsterdam Centraal, Amsterdam";
        const destinationText = "Schiphol Airport";

        // Converts both written addresses into longitude and latitude.
        const pickupLocation = await geocodeAddress(pickupText, { countryCode: "nl", });
        const destinationLocation = await geocodeAddress(destinationText, { countryCode: "nl", });

        // Calculates the route between the two geocoded locations.
        const routeEstimate = await calculateRouteEstimate(
            pickupLocation.coordinate,
            destinationLocation.coordinate,
        );

        // Returns the complete test result.
        return NextResponse.json({
            pickup: {
                searchText: pickupText,
                formattedAddress: pickupLocation.formattedAddress,
                coordinate: pickupLocation.coordinate,
            },
            destination: {
                searchText: destinationText,
                formattedAddress: destinationLocation.formattedAddress,
                coordinate: destinationLocation.coordinate,
            },
            route: routeEstimate,
        });
    } catch (error) {
        console.error("Mapbox address-route test error:", error);

        return NextResponse.json(
            { message: "The address route could not be calculated." },
            { status: 500 },
        );
    }
}