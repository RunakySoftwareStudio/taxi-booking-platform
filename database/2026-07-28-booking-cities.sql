/* ============================================================
   BOOKING PICKUP AND DESTINATION CITIES

   Stores privacy-safe city names separately from the complete
   pickup and destination addresses.

   The open-bookings page may show these city fields while the
   exact addresses remain hidden until the booking is assigned.

   The columns are nullable because existing bookings were
   created before city information was stored.
============================================================ */

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS pickup_city TEXT,
ADD COLUMN IF NOT EXISTS destination_city TEXT;


/* Describes the purpose of the two privacy-safe city fields. */
COMMENT ON COLUMN public.bookings.pickup_city IS
'Privacy-safe pickup city derived from the selected Mapbox location.';

COMMENT ON COLUMN public.bookings.destination_city IS
'Privacy-safe destination city derived from the selected Mapbox location.';