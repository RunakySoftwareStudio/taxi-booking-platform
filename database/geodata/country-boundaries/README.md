# Country Boundary Data

This folder contains country boundary GeoJSON files used by Voya Taxi
for server-side route geography calculations.

The boundary data is used with PostGIS to calculate how much of an
international journey takes place inside each country.

Example:

Amsterdam -> Brussels

- Netherlands -> part of the route
- Belgium -> part of the route

The geographic split can later be used by the pricing system for
country-specific tax allocation.

---

## Data source

Source: geoBoundaries

Project:
https://www.geoboundaries.org/

Repository:
https://github.com/wmgeolab/geoBoundaries

The files currently stored here were downloaded from the geoBoundaries
gbOpen ADM0 country-boundary dataset.

ADM0 represents national-level administrative boundaries.

---

## Included boundaries

### Netherlands

File:

NLD-ADM0.geojson

Application country code:

NL

Source reference:

geoBoundaries gbOpen - NLD ADM0

---

### Belgium

File:

BEL-ADM0.geojson

Application country code:

BE

Source reference:

geoBoundaries gbOpen - BEL ADM0

---

## License

The downloaded boundary data is recorded in this project as:

CC BY 4.0 - Creative Commons Attribution 4.0 International

License information:

https://creativecommons.org/licenses/by/4.0/

geoBoundaries license:

https://github.com/wmgeolab/geoBoundaries/blob/main/LICENSE

Attribution:

Boundary data provided by geoBoundaries / William & Mary geoLab.

The original geographic source and license are also stored in the
`country_boundaries` database table using:

- source_name
- source_license
- source_reference

This keeps the origin of every imported country boundary traceable.

---

## Important

These geographic boundaries support route calculations inside the
application.

They should not by themselves be treated as an authoritative legal
determination of taxation or national jurisdiction.

Tax rules and legal treatment are maintained separately by the
financial pricing system.