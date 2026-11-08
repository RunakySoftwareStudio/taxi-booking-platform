
/*
    VOYA TAXI — PLATFORM INVOICE SETTINGS API

    Allows an authenticated Administrator to update the platform's
    business identity and payment settings through a protected RPC.
*/

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";

type SettingsInput = {
    legalName: string | null;
    businessAddress: string | null;
    kvkNumber: string | null;
    vatNumber: string | null;
    contactEmail: string | null;
    iban: string | null;
    bic: string | null;
    paymentTermsDays: number;
};

export async function PATCH(request: Request) {
    /* SECTION 1: Verify Administrator authorization. */
    const adminUser = await requireAdminUser();

    /* SECTION 2: Parse and validate the request. */
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: "Invalid JSON request." }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ message: "Invalid settings data." }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const textFields = ["legalName", "businessAddress", "kvkNumber", "vatNumber", "contactEmail", "iban", "bic"] as const;

    /* Allow optional text fields to be empty, but reject invalid types. */
    for (const field of textFields) {
        const value = input[field];
        if (value !== null && value !== undefined && (typeof value !== "string" || value.length > 2000)) {
            return NextResponse.json({ message: `Invalid value for ${field}.` }, { status: 400 });
        }
    }

    if (typeof input.paymentTermsDays !== "number" ||
        !Number.isInteger(input.paymentTermsDays) ||
        input.paymentTermsDays < 1 || input.paymentTermsDays > 365) {
        return NextResponse.json({ message: "Payment terms must be between 1 and 365 days." }, { status: 400 });
    }

    const settings = input as SettingsInput;

    /* SECTION 3: Update the singleton record through PostgreSQL. */
    const { error } = await supabaseAdmin.rpc("update_platform_invoice_settings", {
        p_legal_name: settings.legalName ?? null,
        p_business_address: settings.businessAddress ?? null,
        p_kvk_number: settings.kvkNumber ?? null,
        p_vat_number: settings.vatNumber ?? null,
        p_contact_email: settings.contactEmail ?? null,
        p_iban: settings.iban ?? null,
        p_bic: settings.bic ?? null,
        p_payment_terms_days: settings.paymentTermsDays,
        p_updated_by: adminUser.id,
    });

    if (error) {
        console.error("Platform invoice settings update failed:", error);
        return NextResponse.json(
            { message: "Could not save platform invoice settings." },
            { status: error.code === "22023" ? 400 : 500 }
        );
    }

    /* SECTION 4: Refresh the Admin settings page. */
    revalidatePath("/admin/financial-settings/platform-invoice-settings");

    return NextResponse.json({
        success: true,
        message: "Platform invoice settings saved successfully.",
    });
}
