import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY is missing.");
}

/*
 * Defines the country boundary files currently supported by
 * this import script.
 *
 * More countries can later be added here, for example DE.
 * The important new part is:

    const countryCode = process.argv[2]?.trim().toUpperCase();
    process.argv[2] reads the country code that we put after the script command.

    So later:
    node --env-file=.env.local .\scripts\importCountryBoundary.mjs NL
    means:
        process.argv[2]
        → "NL"
        → Netherlands configuration
        
    node --env-file=.env.local .\scripts\importCountryBoundary.mjs BE
    means:
        process.argv[2]
        → "BE"
        → Belgium configuration
 */
const countryConfigurations = {
    NL: {
        countryName: "Netherlands",
        fileName: "NLD-ADM0.geojson",
        sourceReference: "NLD ADM0",
    },
    BE: {
        countryName: "Belgium",
        fileName: "BEL-ADM0.geojson",
        sourceReference: "BEL ADM0",
    },
};

const countryCode = process.argv[2]?.trim().toUpperCase();
const countryConfiguration = countryConfigurations[countryCode];

if (!countryConfiguration) {
    throw new Error("Supported country code is required. Example: NL or BE.");
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

const filePath =
    `./database/geodata/country-boundaries/${countryConfiguration.fileName}`;


/*
 * Converts GeoJSON MultiPolygon coordinates into WKT format
 * understood by PostGIS.
 */
function multiPolygonToWkt(coordinates) {
    const polygons = coordinates.map((polygon) => {
        const rings = polygon.map((ring) => {
            const points = ring.map(
                ([longitude, latitude]) => `${longitude} ${latitude}`
            );

            return `(${points.join(", ")})`;
        });

        return `(${rings.join(", ")})`;
    });

    return `MULTIPOLYGON(${polygons.join(", ")})`;
}


const fileContent = await readFile(filePath, "utf8");
const geoJson = JSON.parse(fileContent);
const feature = geoJson.features?.[0];

if (!feature || feature.geometry?.type !== "MultiPolygon") {
    throw new Error("Expected one GeoJSON MultiPolygon feature.");
}

const boundaryWkt =
    `SRID=4326;${multiPolygonToWkt(feature.geometry.coordinates)}`;

const { error } = await supabase
    .from("country_boundaries")
    .upsert(
        {
            country_code: countryCode,
            country_name: countryConfiguration.countryName,
            boundary: boundaryWkt,
            source_name: "geoBoundaries",
            source_license: "CC BY 4.0",
            source_reference: countryConfiguration.sourceReference,
        },
        {
            onConflict: "country_code",
        }
    );

if (error) {
    throw new Error(
        `Could not import ${countryConfiguration.countryName} boundary: ${error.message}`
    );
}

console.log(
    `${countryConfiguration.countryName} country boundary imported successfully.`
);