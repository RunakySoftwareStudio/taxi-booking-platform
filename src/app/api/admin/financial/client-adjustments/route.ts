/* ============================================================
   VOYA TAXI — CLIENT ADJUSTMENT DEFINITIONS API

   Allow authenticated administrators to create reusable
   client discounts and surcharges.
   No client assignments or booking price changes.
============================================================ */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type AdjustmentInput = {
    name?: unknown;
    description?: unknown;
    adjustment_type?: unknown;
    value_type?: unknown;
    value?: unknown;
    currency_code?: unknown;
    effective_from?: unknown;
    effective_until?: unknown;
    is_active?: unknown;
};

const isValidDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;

export async function POST(request: Request) {
    try {
        /* SECTION 1: Verify administrator authorization. */
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ message: "Not logged in." }, { status: 401 });

        const { data: profile, error: profileError } = await supabase.from("user_profiles")
            .select("role").eq("user_id", user.id).maybeSingle();

        if (profileError || profile?.role !== "admin")
            return NextResponse.json({ message: "Administrator access required." }, { status: 403 });

        /* SECTION 2: Read and normalize the adjustment definition. */
        const body = await request.json() as AdjustmentInput;

        const name = typeof body.name === "string" ? body.name.trim() : "";
        const description = typeof body.description === "string" ? body.description.trim() : "";
        const adjustmentType = body.adjustment_type;
        const valueType = body.value_type;
        const valueText = typeof body.value === "string" || typeof body.value === "number" ? String(body.value) : "";
        const value = Number(valueText);
        const currencyCode = typeof body.currency_code === "string" ? body.currency_code.trim().toUpperCase() : "";
        const effectiveFrom = typeof body.effective_from === "string" ? body.effective_from : "";
        const effectiveUntil = typeof body.effective_until === "string" ? body.effective_until : "";
        const isActive = body.is_active === undefined ? true : body.is_active;

        /* SECTION 3: Validate financial values and effective dates. */
        if (!name || name.length > 150)
            return NextResponse.json({ message: "Enter a valid adjustment name (maximum 150 characters)." }, { status: 400 });

        if (adjustmentType !== "discount" && adjustmentType !== "surcharge")
            return NextResponse.json({ message: "Invalid adjustment type." }, { status: 400 });

        if (valueType !== "percentage" && valueType !== "fixed")
            return NextResponse.json({ message: "Invalid value type." }, { status: 400 });

        if (!/^\d+(\.\d{1,4})?$/.test(valueText) || !Number.isFinite(value) || value <= 0 || value > 9999999999.9999)
            return NextResponse.json({ message: "Enter a positive value with up to four decimal places." }, { status: 400 });

        if (valueType === "percentage" && adjustmentType === "discount" && value > 100)
            return NextResponse.json({ message: "A percentage discount cannot exceed 100%." }, { status: 400 });

        if (valueType === "fixed" && !/^[A-Z]{3}$/.test(currencyCode))
            return NextResponse.json({ message: "Select a valid three-letter currency code." }, { status: 400 });

        /* Every adjustment must have a valid effective starting date. */
        if (!effectiveFrom || !isValidDate(effectiveFrom))
            return NextResponse.json({ message: "Effective From is required and must be a valid date." }, { status: 400 });

        if (effectiveUntil && !isValidDate(effectiveUntil))
            return NextResponse.json({ message: "Invalid Effective Until date." }, { status: 400 });

        if (effectiveFrom && effectiveUntil && effectiveUntil < effectiveFrom)
            return NextResponse.json({ message: "End date cannot precede start date." }, { status: 400 });

        if (typeof isActive !== "boolean")
            return NextResponse.json({ message: "Invalid active status." }, { status: 400 });

        /* SECTION 4: Save the reusable definition through the trusted server. */
        const { data, error } = await supabaseAdmin.from("client_adjustment_definitions")
            .insert({
                name, description: description || null,
                adjustment_type: adjustmentType, value_type: valueType, value,
                currency_code: valueType === "fixed" ? currencyCode : null,
                effective_from: effectiveFrom || null, effective_until: effectiveUntil || null,
                is_active: isActive,
            })
            .select("id").single();

        /* SECTION 4A: Return a clear conflict response for overlapping periods. */
        if (error) {
            if (error.code === "23P01") {
                return NextResponse.json({
                    message: `Cannot save: this ${adjustmentType} period overlaps with an existing adjustment. Please change the effective dates.`,
                }, { status: 409 });
            }

            console.error("Could not create client adjustment:", error);
            return NextResponse.json({ message: "Could not save the client adjustment." }, { status: 500 });
        }

        /* SECTION 5: Refresh the Admin management page. */
        revalidatePath("/admin/financial-settings/client-adjustments");
        return NextResponse.json({ success: true, id: data.id, message: "Client adjustment created successfully." }, { status: 201 });

    } catch (error) {
        console.error("Unexpected client adjustment API error:", error);
        return NextResponse.json({ message: "Invalid request or server error." }, { status: 500 });
    }
}