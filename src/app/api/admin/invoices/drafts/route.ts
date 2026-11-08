/*
    VOYA TAXI — ADMIN INVOICE DRAFT API

    Creates or refreshes a monthly chauffeur invoice draft.
    PostgreSQL enforces billing eligibility, locking and duplicate prevention.
*/

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type DraftRequest = {
    chauffeurId: string;
    billingMonth: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])-01$/;

export async function POST(request: Request) {
    try {
        /* Block invoice creation until the financial workflow is approved. */
        const invoiceDraftCreationEnabled = false;
        if (!invoiceDraftCreationEnabled) {
            return NextResponse.json(
                { message: "Invoice draft creation is not enabled yet." },
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
        if (profileError || profile?.role !== "admin") {return NextResponse.json({ message: "Administrator access required." }, { status: 403 });}

        /* SECTION 2: Validate the chauffeur and billing month. */
        const body = (await request.json()) as Partial<DraftRequest>;
        const chauffeurId = body.chauffeurId;
        const billingMonth = body.billingMonth;

        if (typeof chauffeurId !== "string" || !uuidPattern.test(chauffeurId) ||
            typeof billingMonth !== "string" || !monthPattern.test(billingMonth)) {
            return NextResponse.json({ message: "Valid chauffeur ID and billing month are required." }, { status: 400 });
        }

        /* SECTION 3: Create or refresh the draft through the protected RPC. */
        const { data: invoiceId, error: draftError } = await supabaseAdmin.rpc(
            "create_chauffeur_invoice_draft", { p_chauffeur_id: chauffeurId, p_billing_month: billingMonth }
        );

        if (draftError) {
            console.error("Invoice draft creation failed:", draftError);
            if (draftError.code === "22023") {return NextResponse.json({ message: draftError.message }, { status: 400 });}
            if (draftError.code === "23514") {return NextResponse.json({ message: draftError.message }, { status: 409 });}

            return NextResponse.json({ message: "Could not create chauffeur invoice draft." }, { status: 500 });
        }

        /* SECTION 4: Refresh invoice overview and return the invoice ID. */
        revalidatePath("/admin/financial-settings/invoices");
        revalidatePath(`/admin/financial-settings/invoices/${invoiceId}`);

        return NextResponse.json({
            success: true,
            invoiceId,
            message: "Chauffeur invoice draft created or refreshed successfully.",
        });

    } catch (error) {
        console.error("Unexpected invoice draft API error:", error);
        return NextResponse.json({ message: "Unable to create chauffeur invoice draft." }, { status: 500 });
    }
}