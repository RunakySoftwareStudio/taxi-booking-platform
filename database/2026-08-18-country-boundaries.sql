/* ============================================================
   COUNTRY BOUNDARIES

   Purpose:
   Stores geographic country borders used for route-based
   calculations.

   Example:
        A Mapbox route from Amsterdam to Brussels can later be
        intersected with the NL and BE boundaries to calculate
        how many kilometres were driven inside each country.

   A few important parts for learning:
        MultiPolygon → supports countries consisting of several separate geographic areas
        4326 → longitude/latitude coordinate system used by GeoJSON/Mapbox
        GiST index → spatial index for fast geographic intersection searches
        source_name / source_license / source_reference → records where our geographic data came from

    For the Netherlands later we can store roughly:
        country_code      NL
        country_name      Netherlands
        source_name       geoBoundaries
        source_license    CC BY 4.0
        boundary          imported MultiPolygon
    
    source_license: 
        records the legal license under which we are allowed to use that geographic boundary data.
        For the Netherlands boundary we downloaded from geoBoundaries, the source is external data. We did not create that country polygon ourselves.
        So we want to remember:
            source_name → where did this data come from?
            source_license → under what legal terms may we use it?
            source_reference → which exact dataset/source was used?
        For example:
            source_name      = geoBoundaries
            source_license   = CC BY 4.0
            source_reference = NLD ADM0 dataset
============================================================ */

CREATE TABLE IF NOT EXISTS public.country_boundaries (
    country_code TEXT PRIMARY KEY,
    country_name TEXT NOT NULL,

    /*
     * MultiPolygon is used because one country may consist of
     * several separate geographic areas.
     *
     * SRID 4326 represents normal longitude/latitude coordinates
     * and matches the coordinate system used by Mapbox GeoJSON.
     */
    boundary extensions.geometry(MultiPolygon, 4326) NOT NULL,

    /*
     * Keep the origin of the geographic data traceable.
     * This is useful for maintenance, licensing and auditing.
     */
    source_name TEXT NOT NULL,
    source_license TEXT NOT NULL,
    source_reference TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT country_boundaries_country_code_valid
        CHECK (
            LENGTH(country_code) = 2
            AND country_code = UPPER(country_code)
        ),

    CONSTRAINT country_boundaries_name_not_empty
        CHECK (
            LENGTH(TRIM(country_name)) > 0
        )
);


/*
 * A GiST spatial index helps PostGIS quickly find which country
 * boundaries intersect a route geometry.
 */
CREATE INDEX IF NOT EXISTS country_boundaries_boundary_idx
ON public.country_boundaries
USING gist (boundary);


/* Automatically refresh updated_at when a boundary is changed. */
CREATE TRIGGER update_country_boundaries_updated_at
BEFORE UPDATE ON public.country_boundaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


/*
 * Country-boundary data is used only by trusted server-side code.
 * Public browser roles do not need direct table access.
 */
ALTER TABLE public.country_boundaries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.country_boundaries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.country_boundaries
TO service_role;