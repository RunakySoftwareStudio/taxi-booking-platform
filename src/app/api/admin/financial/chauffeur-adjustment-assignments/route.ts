/* ============================================================
   VOYA TAXI — CHAUFFEUR ADJUSTMENT ASSIGNMENTS API

   Creates chauffeur-specific service-fee adjustments
   through an administrator-protected endpoint.
============================================================ */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type AssignmentInput = {
    chauffeur_id?: unknown;
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

        /* SECTION 2: Validate chauffeur, definition, and effective dates. */
        const body = await request.json() as AssignmentInput;

        const chauffeurId = typeof body.chauffeur_id === "string" ? body.chauffeur_id : "";
        const definitionId = typeof body.adjustment_definition_id === "string" ? body.adjustment_definition_id : "";
        const effectiveFrom = typeof body.effective_from === "string" ? body.effective_from : "";
        const effectiveUntil = typeof body.effective_until === "string" ? body.effective_until : "";

        if (!uuidPattern.test(chauffeurId) || !uuidPattern.test(definitionId))
            return NextResponse.json({ message: "Invalid chauffeur or adjustment definition ID." }, { status: 400 });

        if (!isValidDate(effectiveFrom))
            return NextResponse.json({ message: "Enter a valid Effective From date." }, { status: 400 });

        if (effectiveUntil && !isValidDate(effectiveUntil))
            return NextResponse.json({ message: "Invalid Effective Until date." }, { status: 400 });

        if (effectiveUntil && effectiveUntil < effectiveFrom)
            return NextResponse.json({ message: "Effective Until cannot precede Effective From." }, { status: 400 });

        /* SECTION 2A: Only active adjustment definitions can be assigned. */
        const { data: definition, error: definitionError } = await supabaseAdmin
            .from("chauffeur_adjustment_definitions")
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
            
        /* SECTION 3: Create the assignment and initial financial period
        atomically through the protected database workflow. */
        const { data, error } = await supabaseAdmin.rpc(
            "create_chauffeur_adjustment_assignment_financial",
            {
                p_chauffeur_id: chauffeurId,
                p_adjustment_definition_id: definitionId,
                p_effective_from: effectiveFrom,
                p_effective_until: effectiveUntil || null,
            }
        );
    
        /* SECTION 4: Translate database validation errors into API responses. */
        if (error) {
            if (error.code === "23P01")
                return NextResponse.json({
                    message: "This adjustment is already assigned to the chauffeur during an overlapping period.",
                }, { status: 409 });

            if (error.code === "23503")
                return NextResponse.json({
                    message: "Chauffeur or adjustment definition not found.",
                }, { status: 400 });

            if (error.message.includes("Assignment cannot") ||
                error.message.includes("Adjustment definition not found"))
                return NextResponse.json({ message: error.message }, { status: 400 });

            console.error("Could not create chauffeur adjustment assignment:", error);
            return NextResponse.json({ message: "Could not create the chauffeur adjustment assignment." }, { status: 500 });
        }

        /* SECTION 5: Return the assignment UUID from the protected RPC. */
        return NextResponse.json({
            success: true,
            id: data,
            message: "Chauffeur adjustment assigned successfully.",
        }, { status: 201 });

    } catch (error) {
        console.error("Chauffeur adjustment assignment error:", error);
        return NextResponse.json({ message: "Invalid request or server error." }, { status: 500 });
    }
}