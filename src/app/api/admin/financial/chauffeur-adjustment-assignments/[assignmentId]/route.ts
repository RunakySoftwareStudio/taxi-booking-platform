/* ============================================================
   VOYA TAXI — UPDATE CHAUFFEUR ADJUSTMENT ASSIGNMENT

   Allows administrators to edit assignment dates and status.
   All changes remain subject to database protection and audit.
============================================================ */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";

type RouteContext = { params: Promise<{ assignmentId: string }> };

type AssignmentInput = {
    effective_from?: unknown;
    effective_until?: unknown;
    is_active?: unknown;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* Validate actual calendar dates in YYYY-MM-DD format. */
const isValidDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
/* SECTION 1: Authenticate and authorize the administrator. */

export async function PATCH(request: Request, { params }: RouteContext) {
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

        /* SECTION 2: Validate assignment ID. */
        const { assignmentId } = await params;

        if (!uuidPattern.test(assignmentId))
            return NextResponse.json({ message: "Invalid assignment ID." }, { status: 400 });

        /* SECTION 3: Read the request and handle status-only updates. */
        const body = await request.json() as AssignmentInput;

        if (Object.keys(body).length === 1 && Object.prototype.hasOwnProperty.call(body, "is_active")) {
            if (typeof body.is_active !== "boolean")
                return NextResponse.json({ message: "Invalid activation request." }, { status: 400 });

            /* Update only the assignment status; database trigger records the change. */
            const { data, error } = await supabaseAdmin.from("chauffeur_adjustment_assignments")
                .update({ is_active: body.is_active })
                .eq("id", assignmentId)
                .select("id, chauffeur_id, is_active")
                .maybeSingle();

            if (error) {
                console.error("Could not update chauffeur assignment status:", error);
                return NextResponse.json({ message: "Could not update assignment status." }, { status: 500 });
            }

            if (!data)
                return NextResponse.json({ message: "Assignment not found." }, { status: 404 });

            revalidatePath("/admin/financial-settings/chauffeur-adjustment-assignments");

            return NextResponse.json({
                success: true,
                is_active: data.is_active,
                message: data.is_active
                    ? "Chauffeur adjustment assignment activated successfully."
                    : "Chauffeur adjustment assignment deactivated successfully.",
            });
        }

        /* SECTION 4: Validate an effective-date update. */
        if (Object.keys(body).some((key) => !["effective_from", "effective_until"].includes(key)))
            return NextResponse.json({ message: "Invalid assignment update fields." }, { status: 400 });

        if (!Object.prototype.hasOwnProperty.call(body, "effective_from") ||
            !Object.prototype.hasOwnProperty.call(body, "effective_until"))
            return NextResponse.json({ message: "Both effective-date fields must be provided." }, { status: 400 });

        const effectiveFrom = typeof body.effective_from === "string" ? body.effective_from : "";
        const effectiveUntil = body.effective_until === null || body.effective_until === ""
            ? null : body.effective_until;

        if (!isValidDate(effectiveFrom) ||
            (effectiveUntil !== null && (typeof effectiveUntil !== "string" || !isValidDate(effectiveUntil))))
            return NextResponse.json({ message: "Enter valid assignment dates." }, { status: 400 });

        if (effectiveUntil && effectiveUntil < effectiveFrom)
            return NextResponse.json({ message: "Effective Until cannot precede Effective From." }, { status: 400 });

        /* SECTION 5: Update dates; database triggers enforce definition validity and overlap rules. */
        const { data, error } = await supabaseAdmin.from("chauffeur_adjustment_assignments")
            .update({ effective_from: effectiveFrom, effective_until: effectiveUntil })
            .eq("id", assignmentId)
            .select("id, chauffeur_id")
            .maybeSingle();

        if (error) {
            if (error.code === "23P01")
                return NextResponse.json({
                    message: "This assignment period overlaps another assignment of the same adjustment.",
                }, { status: 409 });

            if (error.code === "P0001" && error.message.startsWith("Assignment cannot"))
                return NextResponse.json({ message: error.message }, { status: 409 });

            console.error("Could not update chauffeur assignment dates:", error);
            return NextResponse.json({ message: "Could not update assignment dates." }, { status: 500 });
        }

        if (!data)
            return NextResponse.json({ message: "Assignment not found." }, { status: 404 });

        /* SECTION 6: Refresh the centralized chauffeur assignment management page. */
        revalidatePath("/admin/financial-settings/chauffeur-adjustment-assignments");

        return NextResponse.json({
            success: true,
            message: "Chauffeur adjustment assignment updated successfully.",
        });

    } catch (error) {
        console.error("Chauffeur adjustment assignment update error:", error);
        return NextResponse.json({ message: "Invalid request or server error." }, { status: 500 });
    }
}