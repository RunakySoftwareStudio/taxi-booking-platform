import { createHash } from "node:crypto";

import type { MapboxCoordinate } from "@/types/mapboxType";

/**
 * PURPOSE: CREATE A STABLE FINGERPRINT FOR THE JOURNEY USED FOR PRICING
 *
 * The fingerprint connects a temporary quote to the journey
 * for which that quote was originally calculated.
 *
 * Current Version 1 uses:
 * - pickup longitude + latitude;
 * - destination longitude + latitude.
 *
 * Example:
 *
 * pickup + destination coordinates
 *          ↓
 * normalized text
 *          ↓
 * SHA-256
 *          ↓
 * "a81f..."
 *
 * We store only the resulting fingerprint in journey_quotes.
 *
 * Later, when the customer confirms the booking, the server
 * creates the fingerprint again from the booking coordinates.
 *
 * same fingerprint     → quote belongs to this journey
 * different fingerprint → reject the quote
 *
 * IMPORTANT:
 * When more booking information starts affecting the price
 * (for example date, time, discounts or extra options),
 * those pricing inputs must also become part of a newer
 * fingerprint version.
 */
export function createBookingDataFingerprint(pickupCoordinate: MapboxCoordinate, destinationCoordinate: MapboxCoordinate): string {

    /*
     * Six decimal places provide a stable representation of
     * Mapbox coordinates while avoiding insignificant floating
     * point representation differences.
     */
    const fingerprintData = [
        "booking-pricing-input-v1",
        pickupCoordinate.longitude.toFixed(6),
        pickupCoordinate.latitude.toFixed(6),
        destinationCoordinate.longitude.toFixed(6),
        destinationCoordinate.latitude.toFixed(6),
    ].join("|");

    return createHash("sha256")
        .update(fingerprintData)
        .digest("hex");
}