
/*
    VOYA TAXI — ADMIN CHAUFFEUR INVOICE PDF API

    Provides protected PDF access for administrators.
    Reads stored invoice information without modifying financial records.
*/

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { generateChauffeurInvoicePdf, type ChauffeurInvoicePdfData,} from "@/lib/invoices/generateChauffeurInvoicePdf";
/* PDF font files are loaded from the local filesystem. */
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ invoiceId: string }> };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: RouteContext) {
    /* SECTION 1: Authenticate the administrator. */
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ message: "Not logged in." }, { status: 401 });
    }

    /* SECTION 2: Verify administrator authorization. */
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

    /* SECTION 3: Validate the invoice identifier. */
    const { invoiceId } = await params;

    if (!uuidPattern.test(invoiceId)) {
        return NextResponse.json({ message: "Invalid invoice ID." }, { status: 400 });
    }

    /* SECTION 4: Retrieve the stored chauffeur invoice header. */
    const { data: invoice, error: invoiceError } = await supabaseAdmin
        .from("chauffeur_invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();

    if (invoiceError) {
        console.error("Unable to retrieve chauffeur invoice for PDF:", invoiceError);
        return NextResponse.json(
            { message: "Unable to load chauffeur invoice." },
            { status: 500 }
        );
    }

    if (!invoice) {
        return NextResponse.json(
            { message: "Chauffeur invoice not found." },
            { status: 404 }
        );
    }

    /* SECTION 5: Retrieve the stored invoice commission lines. */
    const { data: invoiceItems, error: itemsError } = await supabaseAdmin
        .from("chauffeur_invoice_items")
        .select("description, amount_excluding_vat, vat_percentage, vat_amount, total_including_vat")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true });

    if (itemsError) {
        console.error("Unable to retrieve chauffeur invoice items:", itemsError);

        return NextResponse.json(
            { message: "Unable to load chauffeur invoice items." },
            { status: 500 }
        );
    }

    /* Prevent PDF generation from proceeding with missing invoice items. */
    if (!invoiceItems?.length) {
        return NextResponse.json(
            { message: "This invoice has no commission items." },
            { status: 409 }
        );
    }

    /* SECTION 6: Validate invoice status and frozen sender information. */
    if (!["draft", "issued", "paid"].includes(invoice.status)) {
        return NextResponse.json(
            { message: "Invoice status is not supported for PDF generation." },
            { status: 409 }
        );
    }

    /* Official invoices must contain their original sender snapshots. */
    if (invoice.status !== "draft") {
        const requiredSenderFields = [
            invoice.sender_legal_name,
            invoice.sender_business_address,
            invoice.sender_kvk_number,
            invoice.sender_vat_number,
            invoice.sender_contact_email,
            invoice.sender_iban,
        ];

        if (requiredSenderFields.some(
            (value) => typeof value !== "string" || !value.trim()
        ) || !invoice.invoice_number || !invoice.issued_at) {
            return NextResponse.json(
                { message: "Issued invoice information is incomplete." },
                { status: 409 }
            );
        }
    }
    /* SECTION 7: Load provisional sender details only for draft previews. */
    let draftSenderSettings: {
        legal_name: string | null;
        business_address: string | null;
        kvk_number: string | null;
        vat_number: string | null;
        contact_email: string | null;
        iban: string | null;
        bic: string | null;
        payment_terms_days: number;
    } | null = null;

    if (invoice.status === "draft") {
        const { data: settings, error: settingsError } = await supabaseAdmin
            .from("platform_invoice_settings")
            .select("legal_name, business_address, kvk_number, vat_number, contact_email, iban, bic, payment_terms_days")
            .eq("id", 1)
            .maybeSingle();

        if (settingsError || !settings) {
            console.error("Unable to load draft invoice sender settings:", settingsError);

            return NextResponse.json(
                { message: "Unable to load draft invoice sender information." },
                { status: 500 }
            );
        }

        draftSenderSettings = settings;
    }

    /* SECTION 8: Map stored invoice information to the PDF data contract.
        Only draft previews use current platform settings.
        Financial amounts are copied without recalculation. */
    const pdfData: ChauffeurInvoicePdfData = {
            invoice_number: invoice.invoice_number,
            status: invoice.status,
            billing_month: invoice.billing_month,
            currency_code: invoice.currency_code,
            created_at: invoice.created_at,
            issued_at: invoice.issued_at,
            paid_at: invoice.paid_at,

            recipient_name: invoice.recipient_name,
            recipient_email: invoice.recipient_email,
            recipient_address: invoice.recipient_address,

            sender_legal_name: draftSenderSettings?.legal_name ?? invoice.sender_legal_name,
            sender_business_address: draftSenderSettings?.business_address ?? invoice.sender_business_address,
            sender_kvk_number: draftSenderSettings?.kvk_number ?? invoice.sender_kvk_number,
            sender_vat_number: draftSenderSettings?.vat_number ?? invoice.sender_vat_number,
            sender_contact_email: draftSenderSettings?.contact_email ?? invoice.sender_contact_email,
            sender_iban: draftSenderSettings?.iban ?? invoice.sender_iban,
            sender_bic: draftSenderSettings?.bic ?? invoice.sender_bic,
            payment_terms_days: draftSenderSettings?.payment_terms_days ?? invoice.payment_terms_days,

            vat_percentage: invoice.vat_percentage == null ? null : String(invoice.vat_percentage),
            subtotal_excluding_vat: String(invoice.subtotal_excluding_vat),
            vat_amount: String(invoice.vat_amount),
            total_including_vat: String(invoice.total_including_vat),

            /* Preserve the stored commission line values and ordering. */
            items: invoiceItems.map((item) => ({
                description: item.description,
                amount_excluding_vat: String(item.amount_excluding_vat),
                vat_percentage: String(item.vat_percentage),
                vat_amount: String(item.vat_amount),
                total_including_vat: String(item.total_including_vat),
            })),
        };

    /* SECTION 9: Reject incomplete official billing information.
    Draft previews may contain provisional or missing recipient details. */
    if (invoice.status !== "draft") {
        const requiredRecipientFields = [
            pdfData.recipient_name,
            pdfData.recipient_email,
            pdfData.recipient_address,
        ];

        if (requiredRecipientFields.some((value) => typeof value !== "string" || !value.trim()) || pdfData.payment_terms_days == null) {
            return NextResponse.json(
                { message: "Official invoice billing information is incomplete." },
                { status: 409 }
            );
        }
    }

    /* SECTION 10: Generate the invoice PDF without modifying database records. */
    try {
        const pdfBytes = await generateChauffeurInvoicePdf(pdfData);
        const isDraft = invoice.status === "draft";

        /* Use a safe filename derived from the stored invoice information. */
        const invoiceReference = isDraft
            ? `draft-${invoiceId}`
            : invoice.invoice_number;

        const safeReference = String(invoiceReference).replace(/[^a-zA-Z0-9_-]/g, "_");
        const filename = `Voya-Taxi-Invoice-${safeReference}.pdf`;

        /* Return the document privately, without browser or proxy caching. */
        return new NextResponse(new Uint8Array(pdfBytes), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "private, no-store, no-cache, max-age=0",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        /* Do not expose invoice data or internal PDF errors to the browser. */
        console.error("Chauffeur invoice PDF generation failed:", invoiceId, error);

        return NextResponse.json(
            { message: "Unable to generate chauffeur invoice PDF." },
            {
                status: 500,
                headers: { "Cache-Control": "no-store" },
            }
        );
    }

}
