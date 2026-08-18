import { describe, expect, it } from "vitest";

import { validateRouteCountryDistanceCoverage } from "@/lib/pricing/validateRouteCountryDistanceCoverage";
import type { RouteCountryDistance } from "@/lib/pricing/calculateRouteCountryDistances";

/**
 * This checks both sides of the safety rule:
    Amsterdam → Brussels
    204,400 m Mapbox
    204,406.11 m country total
    difference ≈ 6.11 m
    → allowed with 10 m tolerance ✅

    and:

    Only NL loaded
    118,313.28 m
    vs complete route 204,400 m
    → huge missing distance
    → rejected ✅ 
 */
describe("validateRouteCountryDistanceCoverage", () => {
    it("accepts country distances when they closely reconstruct the complete route", () => {
        const countryDistances: RouteCountryDistance[] = [
            {
                countryCode: "NL",
                countryName: "Netherlands",
                distanceMeters: 118_313.28,
                distanceKilometers: 118.313,
            },
            {
                countryCode: "BE",
                countryName: "Belgium",
                distanceMeters: 86_092.83,
                distanceKilometers: 86.093,
            },
        ];

        expect(() =>
            validateRouteCountryDistanceCoverage(
                204_400,
                countryDistances
            )
        ).not.toThrow();
    });

    it("rejects country distances when a large part of the route is missing", () => {
        const countryDistances: RouteCountryDistance[] = [
            {
                countryCode: "NL",
                countryName: "Netherlands",
                distanceMeters: 118_313.28,
                distanceKilometers: 118.313,
            },
        ];

        expect(() =>
            validateRouteCountryDistanceCoverage(
                204_400,
                countryDistances
            )
        ).toThrow("Route country-distance coverage differs");
    });
});