import "server-only";

import { supabaseAdmin } from "@/lib/supabaseServer";
import type { RouteGeometry } from "@/lib/mapbox/mapboxRouteService";

export type RouteCountryDistance = {
    countryCode: string;
    countryName: string;
    distanceMeters: number;
    distanceKilometers: number;
};

/**
 * Purpose:
 * Sends one Mapbox route LineString to PostGIS and returns
 * how much of the route lies inside each stored country.
 *
 * Example:
 * Amsterdam → Brussels
 *        ↓
 * NL → 120.500 km
 * BE → 89.700 km
 * 
 * The important flow is:
    routeGeometry → 2,553 Mapbox coordinates
    .rpc(...) → sends that LineString to our PostgreSQL function
    PostGIS → intersects it with NL and BE polygons
    data → snake_case database result
    .map(...) → converts it to our normal TypeScript camelCase result
    And this: Number(countryDistance.distance_kilometers)
        is useful because PostgreSQL NUMERIC values may come back through Supabase as strings.

 */
export async function calculateRouteCountryDistances(routeGeometry: RouteGeometry): Promise<RouteCountryDistance[]> {

    const { data, error } = await supabaseAdmin.rpc("calculate_route_country_distances", {p_route_geojson: routeGeometry});
    if (error) {throw new Error(`Could not calculate route country distances: ${error.message}`);}
    
    type RouteCountryDistanceRow = {
        country_code: string;
        country_name: string;
        distance_meters: number | string;
        distance_kilometers: number | string;
    };

    return ((data ?? []) as RouteCountryDistanceRow[]).map((countryDistance) => ({
        countryCode: countryDistance.country_code,
        countryName: countryDistance.country_name,
        distanceMeters: Number(countryDistance.distance_meters),
        distanceKilometers: Number(countryDistance.distance_kilometers),
    }));
}