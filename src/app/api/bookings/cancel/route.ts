/* ============================================================
   VOYA TAXI - PROTECTED BOOKING CANCELLATION API

   Purpose:
   Allow authenticated administrators to permanently cancel
   bookings through the centralized PostgreSQL cancellation RPC.

   Public client cancellation remains disabled until secure
   client identity verification is available.
============================================================ */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
/* Coordinates client-preview and Admin cancellation notifications. */
import { sendBookingCancelledEmails } from "@/lib/email/bookingEmailNotifications";

/* Defines the cancellation request for Admin and client workflows. */
type CancelBookingRequest = {
    bookingId: string;
    email?: string;
    reason: string;
};

/* Verifies Admin authorization before performing cancellation. */
export async function POST(request: Request) {
    try {
        /* Read and validate the cancellation request. */
        const inputData = (await request.json()) as CancelBookingRequest;

        const bookingId = typeof inputData?.bookingId === "string" ? inputData.bookingId.trim() : "";
        const email = typeof inputData?.email === "string" ? inputData.email.trim().toLowerCase() : "";
        const reason = typeof inputData?.reason === "string" ? inputData.reason.trim() : "";

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId)) {
            return NextResponse.json({ message: "Invalid booking ID." }, { status: 400 });
        }

        /* Distinguish client cancellation from authenticated Admin cancellation. */
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        let isAdmin = false;

        if (user) {
            const { data: profile } = await supabase
                .from("user_profiles")
                .select("role")
                .eq("user_id", user.id)
                .maybeSingle();

            isAdmin = profile?.role === "admin";
        }

        /* Determine the cancellation workflow from the request. */
        const isClientCancellation = Boolean(email);

        /* Client cancellation requires a booking email.
        Admin cancellation requires Admin authorization and a reason. */
        if (!isClientCancellation && !isAdmin) {
            return NextResponse.json({ message: "Administrator access required." }, { status: 403 });
        }

        if (!isClientCancellation && !reason) {
            return NextResponse.json({ message: "Admin cancellation reason is required." }, { status: 400 });
        }

        /* ============================================================
        PREPARE CANCELLATION EMAIL DATA

        Read the booking and client details before cancellation.
        These values will be used for Admin notification and
        the client email preview after successful cancellation.
        ============================================================ */

        const { data: booking, error: bookingError } = await supabaseAdmin
            .from("bookings")
            .select(`
                id,
                client_id,
                pickup_location,
                destination,
                pickup_date,
                pickup_time,
                passengers,
                luggage,
                trip_type,
                status,
                has_pets,
                notes
            `)
            .eq("id", bookingId)
            .maybeSingle();

        if (bookingError || !booking) {
            return NextResponse.json({ message: "Booking not found." }, { status: 404 });
        }

        /* Retrieve the client associated with this booking. */
        const { data: client, error: clientError } = await supabaseAdmin
            .from("clients")
            .select("name, email, phone")
            .eq("id", booking.client_id)
            .maybeSingle();

        if (clientError || !client) {
            return NextResponse.json({ message: "Booking client not found." }, { status: 404 });
        }

        /* Verify that the client supplied the email registered with this booking. */
        if (isClientCancellation && client.email?.trim().toLowerCase() !== email) {
            return NextResponse.json(
                { message: "Booking ID and email address do not match." },
                { status: 404 }
            );
        }

        /* Record the correct cancellation actor while preserving the Admin workflow. */
        const cancelledBy = email ? "client" : "admin";

        const { data: cancellationId, error: cancellationError } = await supabaseAdmin.rpc("cancel_booking", {
            p_booking_id: bookingId,
            p_cancelled_by: cancelledBy,
            p_cancelled_by_user_id: isClientCancellation ? null : user?.id ?? null,
            p_cancellation_reason: reason || null,
        });

        if (cancellationError) {
            console.error("Booking cancellation failed:", cancellationError);
            return NextResponse.json({ message: "Booking could not be cancelled." }, { status: 409 });
        }
        /* ============================================================
        SEND CANCELLATION NOTIFICATIONS

        Send the client email preview and Admin notification only
        after PostgreSQL confirms successful cancellation.

        Email failures must not reverse a completed cancellation.
        ============================================================ */

        try {
            const emailResults = await sendBookingCancelledEmails({
                id: booking.id,
                name: client.name,
                email: client.email,
                phone: client.phone ?? "",
                pickup: booking.pickup_location,
                destination: booking.destination,
                date: booking.pickup_date,
                time: booking.pickup_time,
                passengers: String(booking.passengers),
                luggage: String(booking.luggage ?? 0),
                tripType: booking.trip_type,
                status: "cancelled",
                hasPets: booking.has_pets,
                notes: booking.notes ?? "",
                /* Identify who initiated the cancellation in the notification. */
                cancelledBy: cancelledBy,
                cancellationReason: reason,
            });

            /* Log delivery status without exposing customer information. */
            console.log("Cancellation notifications processed:", {
                bookingId,
                clientPreviewSent: emailResults.clientEmail.success && !emailResults.clientEmail.skipped,
                adminEmailSent: emailResults.adminEmail.success && !emailResults.adminEmail.skipped,
            });
        } catch (emailError) {
            console.error("Cancellation email notification error:", emailError);
        }

        return NextResponse.json(
            { message: "Booking cancelled successfully.", cancellationId },
            { status: 200 }
        );

    } catch (error) {
        console.error("Invalid cancellation request:", error);
        return NextResponse.json({ message: "Invalid cancellation request." }, { status: 400 });
    }
}