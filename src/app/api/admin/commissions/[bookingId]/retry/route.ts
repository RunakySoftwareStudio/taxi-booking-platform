
/* ============================================================
   VOYA TAXI — ADMIN COMMISSION RETRY API

   Retry automatic commission generation for completed bookings
   with unresolved financial failures. Admin access only.
============================================================ */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type RouteContext = { params: Promise<{ bookingId: string }> };
const bookingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: RouteContext) {
    try {
        /* SECTION 1: Authenticate the administrator. */
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ message: "Not logged in." }, { status: 401 });

        const { data: profile, error: profileError } = await supabase.from("user_profiles")
            .select("role").eq("user_id", user.id).maybeSingle();
        if (profileError || profile?.role !== "admin")
            return NextResponse.json({ message: "Administrator access required." }, { status: 403 });

        /* SECTION 2: Validate the booking identifier. */
        const { bookingId } = await params;
        if (!bookingIdPattern.test(bookingId))
            return NextResponse.json({ message: "Invalid booking ID." }, { status: 400 });

        /* SECTION 3: Require an unresolved financial failure. */
        const { data: failure, error: failureError } = await supabaseAdmin
            .from("chauffeur_commission_generation_failures")
            .select("id").eq("booking_id", bookingId).is("resolved_at", null).maybeSingle();

        if (failureError) throw failureError;
        if (!failure) return NextResponse.json({ message: "No unresolved commission failure found." }, { status: 404 });

        /* SECTION 4: Verify booking eligibility. */
        const { data: booking, error: bookingError } = await supabaseAdmin.from("bookings")
            .select("status, is_financially_excluded").eq("id", bookingId).maybeSingle();

        if (bookingError) throw bookingError;
        if (!booking || booking.status !== "completed" || booking.is_financially_excluded)
            return NextResponse.json({ message: "Booking is not eligible for commission retry." }, { status: 400 });

        /* SECTION 5: Retry through the existing protected database function. */
        const { error: retryError } = await supabaseAdmin.rpc("process_completed_booking_commission", { p_booking_id: bookingId });
        if (retryError) {
            console.error("Commission retry failed:", bookingId, retryError);
            return NextResponse.json({ message: "Commission retry could not be completed." }, { status: 500 });
        }

        /* SECTION 6: Confirm the frozen commission exists and the failure was resolved. */
        const { data: commission, error: commissionError } = await supabaseAdmin
            .from("chauffeur_booking_commissions").select("id").eq("booking_id", bookingId).maybeSingle();

        const { data: remainingFailure, error: reviewError } = await supabaseAdmin
            .from("chauffeur_commission_generation_failures")
            .select("error_message").eq("booking_id", bookingId).is("resolved_at", null).maybeSingle();

        if (commissionError || reviewError) {
            console.error("Could not verify commission retry:", commissionError, reviewError);
            return NextResponse.json({ message: "Could not verify commission retry result." }, { status: 500 });
        }

        if (!commission || remainingFailure)
            return NextResponse.json({ message: remainingFailure?.error_message ?? "Commission has not been generated." }, { status: 409 });

        /* SECTION 7: Refresh the financial review overview. */
        revalidatePath("/admin/financial-settings/commissions");
        return NextResponse.json({ success: true, commissionId: commission.id, message: "Commission generated successfully." });

    } catch (error) {
        console.error("Unexpected commission retry error:", error);
        return NextResponse.json({ message: "Unable to retry commission generation." }, { status: 500 });
    }
}
