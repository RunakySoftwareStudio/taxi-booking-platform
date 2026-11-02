/* ============================================================
   VOYA TAXI - ADMIN BOOKING COMPLETION API

   Purpose:
   Allow authenticated administrators to officially complete
   eligible bookings through the protected PostgreSQL RPC.

   Completion records its timestamp and trusted source
   atomically, without changing chauffeur availability.
============================================================ */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type RouteContext = { params: Promise<{ bookingId: string }> };

/* Validate booking IDs before making privileged database calls. */
const bookingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: RouteContext) {
    try {
        /* SECTION 1: Verify the authenticated administrator. */
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ message: "Not logged in." }, { status: 401 });
        }

        const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();

        if (profileError || profile?.role !== "admin") {
            return NextResponse.json({ message: "Administrator access required." }, { status: 403 });
        }

        /* SECTION 2: Validate the booking identifier. */
        const { bookingId } = await params;

        if (!bookingIdPattern.test(bookingId)) {
            return NextResponse.json({ message: "Invalid booking ID." }, { status: 400 });
        }

        /* SECTION 3: Complete the booking through the protected RPC.
           The server controls completed_by; the client cannot choose it. */
        const { error: completionError } = await supabaseAdmin.rpc("complete_booking", {
            p_booking_id: bookingId,
            p_completed_by: "admin",
        });

        if (completionError) {
            console.error("Admin booking completion failed:", completionError);

            if (completionError.code === "22023" || completionError.code === "23514") {
                return NextResponse.json(
                    { message: completionError.message },
                    { status: 400 }
                );
            }

            if (completionError.code === "P0002") {
                return NextResponse.json({ message: "Booking not found." }, { status: 404 });
            }

            return NextResponse.json(
                { message: "Could not complete the booking." },
                { status: 500 }
            );
        }

        /* SECTION 4: Refresh affected Admin booking pages. */
        revalidatePath("/admin/bookings");
        revalidatePath(`/admin/bookings/${bookingId}`);

        return NextResponse.json({
            success: true,
            message: "Booking completed successfully.",
        });

    } catch (error) {
        console.error("Unexpected Admin booking completion error:", error);

        return NextResponse.json(
            { message: "Unable to complete the booking." },
            { status: 500 }
        );
    }
}