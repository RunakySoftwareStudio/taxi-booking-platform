import { describe, expect, it } from "vitest";

import { createBookingDataFingerprint } from "@/lib/pricing/createBookingDataFingerprint";

/**
 * Purpose:
 * Tests the journey fingerprint used to connect
 * a temporary quote to the booking being confirmed.
 *
 * Version 2 includes:
 * - pickup coordinates;
 * - destination coordinates;
 * - journey date;
 * - journey time.
 */
describe("createBookingDataFingerprint", () => {

    it("returns the same fingerprint for the same pricing inputs", () => {
        const pickup = { longitude: 4.9041, latitude: 52.3676 };
        const destination = { longitude: 4.4777, latitude: 51.9244 };

        const firstFingerprint = createBookingDataFingerprint(
            pickup, destination, "2026-08-12", "14:30"
        );

        const secondFingerprint = createBookingDataFingerprint(
            pickup, destination, "2026-08-12", "14:30"
        );

        expect(firstFingerprint).toBe(secondFingerprint);
    });

    it("returns a different fingerprint when the destination changes", () => {
        const pickup = { longitude: 4.9041, latitude: 52.3676 };
        const firstDestination = { longitude: 4.4777, latitude: 51.9244 };
        const secondDestination = { longitude: 5.4697, latitude: 51.4416 };

        const firstFingerprint = createBookingDataFingerprint(
            pickup, firstDestination, "2026-08-12", "14:30"
        );

        const secondFingerprint = createBookingDataFingerprint(
            pickup, secondDestination, "2026-08-12", "14:30"
        );

        expect(firstFingerprint).not.toBe(secondFingerprint);
    });

    it("returns a different fingerprint when the journey date changes", () => {
        const pickup = { longitude: 4.9041, latitude: 52.3676 };
        const destination = { longitude: 4.4777, latitude: 51.9244 };

        const firstFingerprint = createBookingDataFingerprint(
            pickup, destination, "2026-08-12", "14:30"
        );

        const secondFingerprint = createBookingDataFingerprint(
            pickup, destination, "2026-08-13", "14:30"
        );

        expect(firstFingerprint).not.toBe(secondFingerprint);
    });

    it("returns a different fingerprint when the journey time changes", () => {
        const pickup = { longitude: 4.9041, latitude: 52.3676 };
        const destination = { longitude: 4.4777, latitude: 51.9244 };

        const firstFingerprint = createBookingDataFingerprint(
            pickup, destination, "2026-08-12", "14:30"
        );

        const secondFingerprint = createBookingDataFingerprint(
            pickup, destination, "2026-08-12", "23:30"
        );

        expect(firstFingerprint).not.toBe(secondFingerprint);
    });

    it("returns a SHA-256 hexadecimal fingerprint", () => {
        const fingerprint = createBookingDataFingerprint(
            { longitude: 4.9041, latitude: 52.3676 },
            { longitude: 4.4777, latitude: 51.9244 },
            "2026-08-12",
            "14:30"
        );

        expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });
});