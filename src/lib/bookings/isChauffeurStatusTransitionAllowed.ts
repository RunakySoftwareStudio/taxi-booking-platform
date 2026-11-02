
import type { BookingStatus } from "@/types/bookingStatusType";

/**
 * Purpose:
 * Validate chauffeur booking status transitions.
 *
 * Completed, cancelled and rejected bookings cannot be
 * changed through the ordinary chauffeur status action.
 *
 * Other existing transitions remain unchanged for now.
 */
export function isChauffeurStatusTransitionAllowed(
    currentStatus: BookingStatus,
    nextStatus: BookingStatus
): boolean {
    // A terminal booking cannot be reopened by a chauffeur.
    if (["completed", "cancelled", "rejected"].includes(currentStatus)) {
        return currentStatus === nextStatus;
    }

    /*
    * Protect terminal status transitions.
    * Chauffeurs cannot cancel, reject or complete bookings through the ordinary status-update action.
    * Completion must use the dedicated complete_booking() RPC.
    */
    if (
        nextStatus === "cancelled" ||
        nextStatus === "rejected" ||
        nextStatus === "completed"
    ) {
        return false;
    }

    return true;
}
