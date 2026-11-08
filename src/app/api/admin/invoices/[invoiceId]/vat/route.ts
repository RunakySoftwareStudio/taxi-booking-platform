/*
    VOYA TAXI — ADMIN INVOICE VAT API

    Allows an authenticated Admin to select the VAT percentage
    for a draft invoice. PostgreSQL enforces invoice status.
*/

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type RouteContext = { params: Promise<{ invoiceId: string }> };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        /* Keep VAT updates disabled until invoice workflow validation. */
        const invoiceVatUpdatesEnabled = false;

        if (!invoiceVatUpdatesEnabled) {
            return NextResponse.json(
                { message: "Invoice VAT updates are not enabled yet." },
                { status: 403 }
            );
        }
        /* SECTION 1: Authenticate the administrator. */
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {return NextResponse.json({ message: "Not logged in." }, { status: 401 });}

        const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();
        if (profileError || profile?.role !== "admin") {return NextResponse.json({ message: "Administrator access required." }, { status: 403 }); }

        /* SECTION 2: Validate invoice ID and VAT percentage. */
        const { invoiceId } = await params;
        const body: unknown = await request.json();
        const vatPercentage = body !== null && typeof body === "object" && "vatPercentage" in body
            ? body.vatPercentage
            : undefined;

        if (!uuidPattern.test(invoiceId) || typeof vatPercentage !== "number" 
            || !Number.isFinite(vatPercentage) || vatPercentage < 0 
            || vatPercentage > 100 || !Number.isInteger(vatPercentage * 10000)) 
        {
            return NextResponse.json(
                { message: "A valid invoice ID and VAT percentage between 0 and 100 (up to four decimal places) are required." },
                { status: 400 }
            );
        }

        /* SECTION 3: Save the VAT rate through the protected database function. */
        const { error: vatError } = await supabaseAdmin.rpc("set_chauffeur_invoice_vat_rate", {p_invoice_id: invoiceId, p_vat_percentage: vatPercentage,});

        if (vatError) {
            console.error("Invoice VAT selection failed:", invoiceId, vatError);

            if (vatError.code === "P0002") {return NextResponse.json({ message: "Invoice not found." }, { status: 404 });}
            if (vatError.code === "22023") {return NextResponse.json({ message: vatError.message }, { status: 400 });}
            if (vatError.code === "23514") {return NextResponse.json({ message: vatError.message }, { status: 409 });}

            return NextResponse.json({ message: "Could not update invoice VAT percentage." }, { status: 500 });
        }

        /* SECTION 4: Refresh invoice details and overview. */
        revalidatePath(`/admin/financial-settings/invoices/${invoiceId}`);
        revalidatePath("/admin/financial-settings/invoices");

        return NextResponse.json({
            success: true,
            message: "Invoice VAT percentage saved successfully.",
        });

    } catch (error) {
        console.error("Unexpected invoice VAT API error:", error);

        return NextResponse.json(
            { message: "Unable to update invoice VAT percentage." },
            { status: 500 }
        );
    }
}