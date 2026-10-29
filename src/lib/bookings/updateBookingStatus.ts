import "server-only";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { sendBookingCancelledEmails } from "@/lib/email/bookingEmailNotifications";
import type { BookingEmailData } from "@/lib/email/emailTypes";

/* ============================================================
   CENTRAL BOOKING UPDATE SERVICE

   Purpose:
   Execute a booking database update and detect whether
   its status actually changed.

   Authorization must be completed by the calling server
   action or API before invoking this service.

   Email notification handling will be added next.
============================================================ */
/* Return the original database error so callers can handle error codes. */
export type BookingUpdateResult = {
    error: { message: string; code?: string } | null;
    statusChanged: boolean;
    wasCancelled: boolean;
};

/**
 * Purpose:
 * Execute an authorized booking update and centrally handle
 * cancellation notifications after a successful database change.
 *
 * The calling server action/API remains responsible for authorization.
 */
export async function updateBookingStatus(
    bookingId: string,
    updateOperation: () => Promise<{ error: { message: string; code?: string } | null }>
): Promise<BookingUpdateResult> {

    /* SECTION 1: Read the original booking status and email details. */
    const { data: booking, error: lookupError } = await supabaseAdmin
        .from("bookings")
        .select(`
            id, status, pickup_location, destination, pickup_date,
            pickup_time, passengers, luggage, trip_type, has_pets,
            notes, clients(name, email, phone)
        `)
        .eq("id", bookingId)
        .maybeSingle();

    if (lookupError || !booking) {
        return {
            error: lookupError ?? { message: "Booking not found." },
            statusChanged: false,
            wasCancelled: false,
        };
    }

    /* SECTION 2: Execute the existing protected database operation. */
    const { error: updateError } = await updateOperation();

    if (updateError) {
        return { error: updateError, statusChanged: false, wasCancelled: false };
    }

    /* SECTION 3: Verify the resulting booking status. */
    const { data: updatedBooking, error: verifyError } = await supabaseAdmin
        .from("bookings")
        .select("status")
        .eq("id", bookingId)
        .maybeSingle();

    if (verifyError || !updatedBooking) {
        return {
            error: verifyError ?? { message: "Could not verify updated booking." },
            statusChanged: false,
            wasCancelled: false,
        };
    }

    /* SECTION 4: Detect the booking status transition. */
    const statusChanged = booking.status !== updatedBooking.status;
    const wasCancelled = statusChanged && updatedBooking.status === "cancelled";

    /* SECTION 5: Send cancellation notifications centrally. */
    if (wasCancelled) {
        try {
            const client = Array.isArray(booking.clients)
                ? booking.clients[0]
                : booking.clients;

            const emailData: BookingEmailData = {
                id: booking.id,
                name: client?.name ?? "Customer",
                email: client?.email ?? "",
                phone: client?.phone ?? "",
                pickup: booking.pickup_location,
                destination: booking.destination,
                date: booking.pickup_date,
                time: booking.pickup_time,
                passengers: String(booking.passengers),
                luggage: String(booking.luggage ?? 0),
                tripType: booking.trip_type,
                status: "cancelled",
                hasPets: booking.has_pets ?? false,
                notes: booking.notes ?? "",
            };

            const results = await sendBookingCancelledEmails(emailData);

            if (!results.clientEmail.success || !results.adminEmail.success ||
                results.clientEmail.skipped || results.adminEmail.skipped) {
                console.error("Booking cancelled, but notifications were not fully sent:", results);
            }
        } catch (notificationError) {
            /* Email failures must not reverse a successful booking cancellation. */
            console.error("Could not send cancellation notifications:", notificationError);
        }
    }

    return { error: null, statusChanged, wasCancelled };
}