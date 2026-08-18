/* ============================================================
   ROUTE DISTANCE PER COUNTRY

   Purpose:
   Receives one Mapbox GeoJSON LineString and calculates how
   many metres/kilometres of that route lie inside each stored
   country boundary.

   Example:

   Amsterdam → Brussels
            ↓
   NL → part of route
   BE → part of route
            ↓
   distance per country

   This function only calculates geography.
   VAT calculation will be handled separately.

   The three new PostGIS ideas are:
        ST_Intersection → cuts out the part of the Mapbox route shared with a country polygon
        ST_CollectionExtract(..., 2) → keeps only LineString parts from that intersection
        ST_Length(...::geography) → measures that route portion in metres

    ST_Intersection is specifically intended for obtaining the portion of geometry 
    lying inside a region, while ST_CollectionExtract(..., 2) extracts line components. 
    ST_Length on a geography value returns the length in metres.

    Also, ST_GeomFromGeoJSON expects a GeoJSON geometry fragment, which is exactly what Mapbox gives us as:
        {type: "LineString", coordinates: [...]}
    —not a whole FeatureCollection.
============================================================ */

CREATE OR REPLACE FUNCTION public.calculate_route_country_distances(p_route_geojson JSONB)
RETURNS TABLE (
    country_code TEXT,
    country_name TEXT,
    distance_meters NUMERIC,
    distance_kilometers NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $function$

DECLARE  v_route_geometry extensions.geometry;
BEGIN
    IF p_route_geojson IS NULL THEN
        RAISE EXCEPTION 'Route GeoJSON is required.';
    END IF;

    /*
     * Converts the Mapbox GeoJSON LineString into a PostGIS
     * geometry.
     *
     * Mapbox coordinates already use longitude/latitude, so the
     * geometry is marked with SRID 4326.
     */
    v_route_geometry :=
        extensions.ST_SetSRID(
            extensions.ST_GeomFromGeoJSON(p_route_geojson),
            4326
        );

    IF extensions.ST_GeometryType(v_route_geometry) <> 'ST_LineString' THEN
        RAISE EXCEPTION 'Route geometry must be a LineString.';
    END IF;


    /*
     * 1. Find country boundaries touched by the route.
     * 2. Cut the route at each country boundary.
     * 3. Keep only line parts from the intersection.
     * 4. Measure those line parts as geography so the result
     *    is returned in metres.
     */
    RETURN QUERY

    WITH route_parts AS (
        SELECT
            boundary.country_code,
            boundary.country_name,
            extensions.ST_CollectionExtract(
                extensions.ST_Intersection(
                    v_route_geometry,
                    boundary.boundary
                ),
                2
            ) AS route_part
        FROM public.country_boundaries boundary
        WHERE extensions.ST_Intersects(
            v_route_geometry,
            boundary.boundary
        )
    ),

    measured_parts AS (
        SELECT
            route_parts.country_code,
            route_parts.country_name,
            extensions.ST_Length(
                route_parts.route_part::extensions.geography
            ) AS measured_meters
        FROM route_parts
        WHERE NOT extensions.ST_IsEmpty(route_parts.route_part)
    )

    SELECT
        measured_parts.country_code,
        measured_parts.country_name,
        ROUND(measured_parts.measured_meters::NUMERIC, 2),
        ROUND((measured_parts.measured_meters / 1000)::NUMERIC, 3)

    FROM measured_parts
    WHERE measured_parts.measured_meters > 0
    ORDER BY measured_parts.country_code;
END;

$function$;


/*
 * Route-country calculations are server-side financial logic.
 * Browser roles may not execute this function directly.
 */
REVOKE ALL
ON FUNCTION public.calculate_route_country_distances(JSONB)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.calculate_route_country_distances(JSONB)
TO service_role;