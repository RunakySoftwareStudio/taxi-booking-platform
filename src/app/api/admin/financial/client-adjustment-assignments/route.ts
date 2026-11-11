/* ============================================================
   VOYA TAXI — CLIENT ADJUSTMENT ASSIGNMENTS API

   Creates client-specific assignments of reusable discounts
   and surcharges through an administrator-protected endpoint.
============================================================ */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type AssignmentInput = {
    client_id?: unknown;
    adjustment_definition_id?: unknown;
    effective_from?: unknown;
    effective_until?: unknown;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/* Validate real calendar dates in YYYY-MM-DD format. */
const isValidDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;

/* SECTION 1: Authenticate and authorize the administrator. */
export async function POST(request: Request) {
    try {
        const supabase = await createClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user)
            return NextResponse.json({ message: "Not logged in." }, { status: 401 });

        const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();

        if (profileError || profile?.role !== "admin")
            return NextResponse.json({ message: "Administrator access required." }, { status: 403 });

        /* SECTION 2: Validate client, definition, and effective dates. */
        const body = await request.json() as AssignmentInput;

        const clientId = typeof body.client_id === "string" ? body.client_id : "";
        const definitionId = typeof body.adjustment_definition_id === "string" ? body.adjustment_definition_id : "";
        const effectiveFrom = typeof body.effective_from === "string" ? body.effective_from : "";
        const effectiveUntil = typeof body.effective_until === "string" ? body.effective_until : "";

        if (!uuidPattern.test(clientId) || !uuidPattern.test(definitionId))
            return NextResponse.json({ message: "Invalid client or adjustment definition ID." }, { status: 400 });

        if (!isValidDate(effectiveFrom))
            return NextResponse.json({ message: "Enter a valid Effective From date." }, { status: 400 });

        if (effectiveUntil && !isValidDate(effectiveUntil))
            return NextResponse.json({ message: "Invalid Effective Until date." }, { status: 400 });

        if (effectiveUntil && effectiveUntil < effectiveFrom)
            return NextResponse.json({ message: "Effective Until cannot precede Effective From." }, { status: 400 });

        /* SECTION 2A: Only active adjustment definitions can be assigned. */
        const { data: definition, error: definitionError } = await supabaseAdmin
            .from("client_adjustment_definitions")
            .select("id, is_active")
            .eq("id", definitionId)
            .maybeSingle();

        if (definitionError) {
            console.error("Could not verify adjustment definition:", definitionError);
            return NextResponse.json(
                { message: "Could not verify the adjustment definition." },
                { status: 500 }
            );
        }

        if (!definition)
            return NextResponse.json(
                { message: "Adjustment definition not found." },
                { status: 404 }
            );

        if (!definition.is_active)
            return NextResponse.json(
                { message: "Inactive adjustment definitions cannot be assigned." },
                { status: 400 }
            );
            
        /* SECTION 3: Create the assignment through the trusted database client. */
        const { data, error } = await supabaseAdmin.from("client_adjustment_assignments")
            .insert({
                client_id: clientId,
                adjustment_definition_id: definitionId,
                effective_from: effectiveFrom,
                effective_until: effectiveUntil || null,
                is_active: true,
            })
            .select("id")
            .single();

    
        /* SECTION 4: Translate database validation errors into API responses. */
        if (error) {
            if (error.code === "23P01")
                return NextResponse.json({
                    message: "This adjustment is already assigned to the client during an overlapping period.",
                }, { status: 409 });

            if (error.code === "23503")
                return NextResponse.json({
                    message: "Client or adjustment definition not found.",
                }, { status: 400 });

            if (error.message.includes("Assignment cannot") ||
                error.message.includes("Adjustment definition not found"))
                return NextResponse.json({ message: error.message }, { status: 400 });

            console.error("Could not create client adjustment assignment:", error);
            return NextResponse.json({ message: "Could not create the client adjustment assignment." }, { status: 500 });
        }

        /* SECTION 5: Return the newly created assignment. */
        return NextResponse.json({
            success: true,
            id: data.id,
            message: "Client adjustment assigned successfully.",
        }, { status: 201 });

    } catch (error) {
        console.error("Client adjustment assignment error:", error);
        return NextResponse.json({ message: "Invalid request or server error." }, { status: 500 });
    }
}