
/* ============================================================
   VOYA TAXI — ADMIN COMMISSION GENERATION API

   Purpose:
   Allow authenticated administrators to generate a frozen
   commission for an eligible, completed booking.

   PostgreSQL handles eligibility, locking and duplicate
   prevention through the existing protected RPC.
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

        if (authError || !user) {
            return NextResponse.json(
                { message: "Not logged in." },
                { status: 401 }
            );
        }

        const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();

        if (profileError || profile?.role !== "admin") {
            return NextResponse.json(
                { message: "Administrator access required." },
                { status: 403 }
            );
        }

        /* SECTION 2: Validate the booking identifier. */
        const { bookingId } = await params;

        if (!bookingIdPattern.test(bookingId)) {
            return NextResponse.json(
                { message: "Invalid booking ID." },
                { status: 400 }
            );
        }

        /* SECTION 3: Generate the frozen commission atomically. */
        const { data: commissionId, error: generationError } = await supabaseAdmin.rpc("generate_chauffeur_booking_commission",{ p_booking_id: bookingId });

        if (generationError) {
            console.error("Commission generation failed:", bookingId, generationError);

            if (generationError.code === "P0002") {
                return NextResponse.json(
                    { message: "Booking not found." },
                    { status: 404 }
                );
            }

            if (generationError.code === "22023") {
                return NextResponse.json(
                    { message: generationError.message },
                    { status: 400 }
                );
            }

            return NextResponse.json(
                { message: "Could not generate chauffeur commission." },
                { status: 500 }
            );
        }

        /* SECTION 4: Refresh the commission overview. */
        revalidatePath("/admin/financial-settings/commissions");

        return NextResponse.json({
            success: true,
            commissionId,
            message: "Chauffeur commission generated successfully.",
        });

    } catch (error) {
        console.error("Unexpected commission generation API error:", error);

        return NextResponse.json(
            { message: "Unable to generate chauffeur commission." },
            { status: 500 }
        );
    }
}
