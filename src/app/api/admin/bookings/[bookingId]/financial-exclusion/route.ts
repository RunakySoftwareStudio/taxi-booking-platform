/* ============================================================
   VOYA TAXI — ADMIN BOOKING FINANCIAL EXCLUSION API

   Purpose:
   Allow authenticated administrators to update financial
   exclusion settings through the protected PostgreSQL RPC.

   The RPC updates the booking and audit record atomically.
============================================================ */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type RouteContext = { params: Promise<{ bookingId: string }> };

const bookingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        /* SECTION 1: Authenticate the administrator. */
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

        /* SECTION 2: Validate the booking identifier and request body. */
        const { bookingId } = await params;

        if (!bookingIdPattern.test(bookingId)) {
            return NextResponse.json({ message: "Invalid booking ID." }, { status: 400 });
        }

        const body: unknown = await request.json();

        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
        }

        const values = body as Record<string, unknown>;
        const excluded = values.isFinanciallyExcluded;
        const reason = values.financialExclusionReason;

        if (typeof excluded !== "boolean" ||
            (reason !== null && typeof reason !== "string")) {
            return NextResponse.json({ message: "Invalid financial exclusion values." }, { status: 400 });
        }

        if (excluded && (typeof reason !== "string" || !reason.trim())) {
            return NextResponse.json({ message: "An exclusion reason is required." }, { status: 400 });
        }

        /* SECTION 3: Update booking and audit atomically. */
        const { data: changed, error: updateError } = await supabaseAdmin.rpc(
            "update_booking_financial_exclusion",
            {
                p_booking_id: bookingId,
                p_is_financially_excluded: excluded,
                p_financial_exclusion_reason: excluded ? (reason as string).trim() : null,
                p_changed_by_user_id: user.id,
            }
        );

        if (updateError) {
            console.error("Financial exclusion update failed:", updateError);

            if (updateError.code === "P0002") {
                return NextResponse.json({ message: "Booking not found." }, { status: 404 });
            }

            if (updateError.code === "22023" || updateError.code === "23514") {
                return NextResponse.json({ message: updateError.message }, { status: 400 });
            }

            return NextResponse.json({ message: "Could not update financial exclusion." }, { status: 500 });
        }

        /* SECTION 4: Refresh the Admin booking pages. */
        revalidatePath("/admin/bookings");
        revalidatePath(`/admin/bookings/${bookingId}`);

        return NextResponse.json({
            success: true,
            changed,
            message: changed ? "Financial exclusion saved." : "No financial changes were needed.",
        });

    } catch (error) {
        console.error("Unexpected financial exclusion API error:", error);
        return NextResponse.json({ message: "Unable to update financial exclusion." }, { status: 500 });
    }
}