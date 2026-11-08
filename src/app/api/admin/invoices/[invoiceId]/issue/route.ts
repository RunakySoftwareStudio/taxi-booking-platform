
/*
    VOYA TAXI — ADMIN INVOICE ISSUANCE API

    Issues a draft chauffeur invoice through the protected PostgreSQL RPC.
    Financial issuance remains disabled until controlled validation.
*/

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type RouteContext = { params: Promise<{ invoiceId: string }> };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: RouteContext) {
    try {
        /* SECTION 1: Block financial issuance until approved. */
        const invoiceIssuanceEnabled = false;
        if (!invoiceIssuanceEnabled) {
            return NextResponse.json(
                { message: "Invoice issuance is not enabled yet." },
                { status: 403 }
            );
        }

        /* SECTION 2: Authenticate the administrator. */
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) { return NextResponse.json({ message: "Not logged in." }, { status: 401 }); }

        const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();
        if (profileError || profile?.role !== "admin") {return NextResponse.json({ message: "Administrator access required." }, { status: 403 });}

        /* SECTION 3: Validate the invoice identifier. */
        const { invoiceId } = await params;
        if (!uuidPattern.test(invoiceId)) { return NextResponse.json({ message: "Invalid invoice ID." }, { status: 400 }); }

        /* SECTION 4: Issue the invoice atomically through PostgreSQL. */
        const { data: invoiceNumber, error: issueError } = await supabaseAdmin.rpc("issue_chauffeur_invoice", { p_invoice_id: invoiceId });
        if (issueError) {
            console.error("Invoice issuance failed:", invoiceId, issueError);

            if (issueError.code === "P0002") { return NextResponse.json({ message: "Invoice not found." }, { status: 404 }); }
            if (issueError.code === "22023") { return NextResponse.json({ message: issueError.message }, { status: 400 }); }
            if (issueError.code === "23514") {return NextResponse.json({ message: issueError.message }, { status: 409 }); }

            return NextResponse.json({ message: "Could not issue chauffeur invoice." }, { status: 500 });
        }

        /* SECTION 5: Refresh the invoice pages after issuance. */
        revalidatePath(`/admin/financial-settings/invoices/${invoiceId}`);
        revalidatePath("/admin/financial-settings/invoices");

        return NextResponse.json({
            success: true,
            invoiceNumber,
            message: "Chauffeur invoice issued successfully.",
        });

    } catch (error) {
        console.error("Unexpected invoice issuance API error:", error);
        return NextResponse.json({ message: "Unable to issue chauffeur invoice." }, { status: 500 });
    }
}
