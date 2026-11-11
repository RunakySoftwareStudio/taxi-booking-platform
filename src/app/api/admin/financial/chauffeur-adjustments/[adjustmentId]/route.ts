/* ============================================================
   VOYA TAXI — UPDATE CHAUFFEUR ADJUSTMENT

   Allows Admin to edit reusable discount and surcharge definitions.
   Existing bookings, quotations and invoices are not modified.
============================================================ */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type RouteContext = { params: Promise<{ adjustmentId: string }> };
type AdjustmentInput = {
    name?: unknown; description?: unknown; adjustment_type?: unknown;
    value_type?: unknown; value?: unknown; currency_code?: unknown;
    effective_from?: unknown; effective_until?: unknown;
    is_active?: unknown;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;

export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        /* SECTION 1: Authenticate the administrator. */
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ message: "Not logged in." }, { status: 401 });

        const { data: profile, error: profileError } = await supabase.from("user_profiles")
            .select("role").eq("user_id", user.id).maybeSingle();

        if (profileError || profile?.role !== "admin")
            return NextResponse.json({ message: "Administrator access required." }, { status: 403 });

        /* SECTION 2: Validate adjustment ID and request data. */
        const { adjustmentId } = await params;
        if (!uuidPattern.test(adjustmentId))
            return NextResponse.json({ message: "Invalid adjustment ID." }, { status: 400 });

        const body = await request.json() as AdjustmentInput;
        /* SECTION 2A: Handle activation/deactivation independently of financial edits. */
        /* Process status-only requests separately from full adjustment edits. */
        if (Object.keys(body).length === 1 && Object.prototype.hasOwnProperty.call(body, "is_active")) {
            if (Object.keys(body).length !== 1 || typeof body.is_active !== "boolean")
                return NextResponse.json({ message: "Invalid activation request." }, { status: 400 });

            const { data, error } = await supabaseAdmin.from("chauffeur_adjustment_definitions")
                .update({ is_active: body.is_active })
                .eq("id", adjustmentId).select("id, is_active").maybeSingle();

            if (error) {
                console.error("Could not update adjustment status:", error);
                return NextResponse.json({ message: "Could not update adjustment status." }, { status: 500 });
            }

            if (!data) return NextResponse.json({ message: "Adjustment not found." }, { status: 404 });

            revalidatePath("/admin/financial-settings/chauffeur-adjustments");
            return NextResponse.json({
                success: true, is_active: data.is_active,
                message: data.is_active ? "Adjustment activated successfully." : "Adjustment deactivated successfully."
            });
        }
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const description = typeof body.description === "string" ? body.description.trim() : "";
        const adjustmentType = body.adjustment_type;
        const valueType = body.value_type;
        const valueText = typeof body.value === "string" || typeof body.value === "number" ? String(body.value) : "";
        const value = Number(valueText);
        const currencyCode = typeof body.currency_code === "string" ? body.currency_code.trim().toUpperCase() : "";
        const effectiveFrom = typeof body.effective_from === "string" ? body.effective_from : "";
        const effectiveUntil = typeof body.effective_until === "string" ? body.effective_until : "";

        /* SECTION 3: Enforce the same financial rules as creation. */
        if (!name || name.length > 150)
            return NextResponse.json({ message: "Enter a valid adjustment name (maximum 150 characters)." }, { status: 400 });

        if (adjustmentType !== "discount" && adjustmentType !== "surcharge")
            return NextResponse.json({ message: "Invalid adjustment type." }, { status: 400 });

        if (valueType !== "percentage" && valueType !== "fixed")
            return NextResponse.json({ message: "Invalid calculation type." }, { status: 400 });

        if (!/^\d+(\.\d{1,4})?$/.test(valueText) || !Number.isFinite(value) || value <= 0 || value > 9999999999.9999)
            return NextResponse.json({ message: "Enter a positive value with up to four decimal places." }, { status: 400 });

        if (valueType === "percentage" && adjustmentType === "discount" && value > 100)
            return NextResponse.json({ message: "A percentage discount cannot exceed 100%." }, { status: 400 });

        if (valueType === "fixed" && !/^[A-Z]{3}$/.test(currencyCode))
            return NextResponse.json({ message: "Select a valid three-letter currency code." }, { status: 400 });

        if (!effectiveFrom || !isValidDate(effectiveFrom))
            return NextResponse.json({ message: "Effective From is required and must be a valid date." }, { status: 400 });

        if (effectiveUntil && !isValidDate(effectiveUntil))
            return NextResponse.json({ message: "Invalid Effective Until date." }, { status: 400 });

        if (effectiveUntil && effectiveUntil < effectiveFrom)
            return NextResponse.json({ message: "End date cannot precede start date." }, { status: 400 });

        /* SECTION 4: Update only the selected adjustment definition. */
        const { data, error } = await supabaseAdmin.from("chauffeur_adjustment_definitions")
            .update({
                name, description: description || null, adjustment_type: adjustmentType,
                value_type: valueType, value,
                currency_code: valueType === "fixed" ? currencyCode : null,
                effective_from: effectiveFrom, effective_until: effectiveUntil || null,
            })
            .eq("id", adjustmentId).select("id").maybeSingle();

        /* SECTION 4A: Return clear errors for protected financial periods. */
        if (error) {
            /* Prevent overlapping adjustment definition periods. */
            if (error.code === "23P01") {
                return NextResponse.json({
                    message: `Cannot save: this ${adjustmentType} period overlaps with an existing adjustment. Please change the effective dates.`,
                }, { status: 409 });
            }

            console.error("Could not update chauffeur adjustment:", error);
            return NextResponse.json({ message: "Could not update the chauffeur adjustment." }, { status: 500 });
        }

        if (!data) return NextResponse.json({ message: "Adjustment not found." }, { status: 404 });

        /* SECTION 5: Refresh the adjustment management page. */
        revalidatePath("/admin/financial-settings/chauffeur-adjustments");
        return NextResponse.json({ success: true, message: "Chauffeur adjustment updated successfully." });

    } catch (error) {
        console.error("Unexpected chauffeur adjustment update error:", error);
        return NextResponse.json({ message: "Invalid request or server error." }, { status: 500 });
    }
}