import tzLookup from "tz-lookup";
import { DateTime } from "luxon";
import type { MapboxCoordinate } from "@/types/mapboxType";

/*
 * Resolve the IANA timezone from the booking pickup coordinates.
 * Timezones depend on geographic location, not website language.
 * What the functions do
    resolvePickupTimezone() accepts our existing MapboxCoordinate, validates the geographic values and returns a timezone such as Europe/Amsterdam.
    calculatePickupAt() uses that timezone to convert the scheduled local pickup date/time to UTC. It rejects invalid or ambiguous times instead of silently choosing the wrong time.

  This will eventually support both client cancellation deadlines and automatic journey completion.
 */
export function resolvePickupTimezone(coordinate: MapboxCoordinate): string {
    const { latitude, longitude } = coordinate;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180) {
        throw new Error("Invalid pickup coordinates.");
    }

    return tzLookup(latitude, longitude);
}

/*
 * Convert a local pickup date/time into an exact UTC timestamp.
 * Reject nonexistent or ambiguous times during daylight-saving changes.
 */
export function calculatePickupAt(pickupDate: string, pickupTime: string, pickupTimezone: string): string {
    const localDateTime = DateTime.fromISO(`${pickupDate}T${pickupTime}`, {
        zone: pickupTimezone,
    });

    if (!localDateTime.isValid) {
        throw new Error("Invalid pickup date, time or timezone.");
    }

    // Detect times that do not exist because clocks move forward.
    if (localDateTime.toFormat("yyyy-MM-dd") !== pickupDate ||
        localDateTime.toFormat("HH:mm") !== pickupTime.substring(0, 5)) {
        throw new Error("Pickup time does not exist in the selected timezone.");
    }

    // Some local times occur twice when clocks move backward.
    if (localDateTime.getPossibleOffsets().length > 1) {
        throw new Error("Pickup time is ambiguous due to daylight saving.");
    }

    return localDateTime.toUTC().toISO()!;
}