
import { describe, expect, it } from "vitest";
import { isBookingCompletionAllowed } from "@/lib/bookings/isBookingCompletionAllowed";

/**
 * Purpose:
 * Verify which booking statuses are eligible for completion.
 *
 * These tests do not modify bookings or connect to Supabase.
 */
describe("isBookingCompletionAllowed", () => {
    const chauffeurId = "chauffeur-test-id";

    /* Assigned bookings may be completed from these statuses. */
    it.each(["pending", "accepted", "confirmed"] as const)(
        "allows assigned %s bookings",
        (status) => {
            expect(isBookingCompletionAllowed(status, chauffeurId)).toBe(true);
        }
    );

    /* A booking without a chauffeur must not be completed. */
    it("rejects unassigned pending bookings", () => {
        expect(isBookingCompletionAllowed("pending", null)).toBe(false);
    });

    /* Cancelled and rejected bookings are not eligible. */
    it.each(["cancelled", "rejected"] as const)(
        "rejects %s bookings",
        (status) => {
            expect(isBookingCompletionAllowed(status, chauffeurId)).toBe(false);
        }
    );

    /* Already completed bookings must not be completed again. */
    it("rejects already completed bookings", () => {
        expect(isBookingCompletionAllowed("completed", chauffeurId)).toBe(false);
    });
});
