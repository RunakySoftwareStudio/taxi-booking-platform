import type { BookingStatus } from "@/types/bookingStatusType";

/**
 * Purpose:
 * Determines whether an assigned booking can be completed.
 *
 * The waiting period and actual assignment are verified
 * separately when automatic completion runs.
 */
export function isBookingCompletionAllowed(
    status: BookingStatus,
    chauffeurId: string | null
): boolean {
    return (
        chauffeurId !== null &&
        (status === "pending" ||
         status === "accepted" ||
         status === "confirmed")
    );
}