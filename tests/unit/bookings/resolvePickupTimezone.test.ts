import { describe, expect, it } from "vitest";
import { resolvePickupTimezone, calculatePickupAt } from "@/lib/bookings/resolvePickupTimezone";

/* Verify geographic timezone resolution and correct UTC conversion. */
describe("Booking pickup timezone", () => {
    it("resolves Amsterdam coordinates", () => {
        const timezone = resolvePickupTimezone({
            latitude: 52.3676,
            longitude: 4.9041,
        });

        expect(timezone).toBe("Europe/Amsterdam");
    });

    it("converts winter pickup time to UTC", () => {
        const result = calculatePickupAt(
            "2026-12-15", "11:30", "Europe/Amsterdam"
        );

        expect(result).toBe("2026-12-15T10:30:00.000Z");
    });

    it("converts summer pickup time to UTC", () => {
        const result = calculatePickupAt(
            "2026-07-15", "11:30", "Europe/Amsterdam"
        );

        expect(result).toBe("2026-07-15T09:30:00.000Z");
    });

    it("rejects invalid pickup coordinates", () => {
        expect(() => resolvePickupTimezone({
            latitude: 100,
            longitude: 4.9041,
        })).toThrow("Invalid pickup coordinates.");
    });

    it("rejects nonexistent spring pickup times", () => {
        expect(() => calculatePickupAt(
            "2026-03-29", "02:30", "Europe/Amsterdam"
        )).toThrow();
    });

    it("rejects ambiguous autumn pickup times", () => {
        expect(() => calculatePickupAt(
            "2026-10-25", "02:30", "Europe/Amsterdam"
        )).toThrow("Pickup time is ambiguous due to daylight saving.");
    });
});