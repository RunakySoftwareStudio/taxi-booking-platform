
import { describe, expect, it } from "vitest";
import { isChauffeurStatusTransitionAllowed } from "@/lib/bookings/isChauffeurStatusTransitionAllowed";

/**
 * Purpose:
 * Verify that chauffeurs cannot reopen terminal bookings
 * or submit cancellation/rejection through the status action.
 */
describe("isChauffeurStatusTransitionAllowed", () => {

    /*
    * SECURITY TEST — PROTECTED BOOKING COMPLETION
    *
    * The ordinary chauffeur status action must reject
    * completion from every active booking status.
    *
    * Completion requires the dedicated complete_booking() RPC.
    */
    it.each(["pending", "accepted", "confirmed"] as const)(
        "prevents %s from changing directly to completed",
        (status) => {
            expect(
                isChauffeurStatusTransitionAllowed(status, "completed")
            ).toBe(false);
        }
    );

    /* Terminal bookings cannot be reopened. */
    it.each([
        ["completed", "pending"],
        ["completed", "accepted"],
        ["completed", "confirmed"],
        ["cancelled", "confirmed"],
        ["rejected", "accepted"],
    ] as const)(
        "blocks %s to %s",
        (currentStatus, nextStatus) => {
            expect(isChauffeurStatusTransitionAllowed(currentStatus, nextStatus)).toBe(false);
        }
    );

    /* Ordinary chauffeur updates cannot cancel or reject a booking. */
    it.each(["cancelled", "rejected"] as const)(
        "blocks chauffeur transition to %s",
        (nextStatus) => {
            expect(isChauffeurStatusTransitionAllowed("confirmed", nextStatus)).toBe(false);
        }
    );

    /* Saving an unchanged terminal status is permitted. */
    it.each(["completed", "cancelled", "rejected"] as const)(
        "allows unchanged %s status",
        (status) => {
            expect(isChauffeurStatusTransitionAllowed(status, status)).toBe(true);
        }
    );
});
