import type { RouteCountryDistance } from "./calculateRouteCountryDistances";

/**
 * Purpose:
 * Verifies that the country-distance portions reconstruct the
 * complete Mapbox route closely enough to be trusted for tax allocation.
 *
 * This catches both:
 * - missing route distance;
 * - overlapping/double-counted country distance.
 *
 * Example:
 *
 * Mapbox route:   204400 m
 * Country total:  204406 m
 * Difference:          6 m
 *
 * If the difference is within the allowed tolerance, validation passes.
 */
export function validateRouteCountryDistanceCoverage(routeDistanceMeters: number, countryDistances: RouteCountryDistance[]): void {

    const allowedDifferenceMeters = Math.max(100, routeDistanceMeters * 0.001);

    if (!Number.isFinite(routeDistanceMeters) || routeDistanceMeters <= 0) {throw new Error("The complete route distance must be greater than zero.");}
    if (!Number.isFinite(allowedDifferenceMeters) || allowedDifferenceMeters < 0) {throw new Error("The allowed route-distance difference must be a valid non-negative number."); }
    if (countryDistances.length === 0) {throw new Error("At least one country distance is required.");}

    const countryDistanceTotalMeters = countryDistances.reduce((totalDistance, countryDistance) => totalDistance + countryDistance.distanceMeters,0);
    if (!Number.isFinite(countryDistanceTotalMeters) || countryDistanceTotalMeters <= 0) {throw new Error("The total country distance must be greater than zero.");}

    const distanceDifferenceMeters = Math.abs(routeDistanceMeters - countryDistanceTotalMeters);
    if (distanceDifferenceMeters > allowedDifferenceMeters) {throw new Error(`Route country-distance coverage differs by ${distanceDifferenceMeters.toFixed(2)} metres.`);}
}