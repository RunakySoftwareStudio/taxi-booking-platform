import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type RouteContext = {params: Promise<{ operatorId: string }>;};

/**
 * Updates editable taxi-operator business and contact details.
 *
 * Verification status changes are handled separately through
 * update_taxi_operator_verification_status and must never be updated here.
 */
export async function PATCH(_request: Request, { params }: RouteContext) {
    const { operatorId } = await params;

    /* ===== Confirm logged-in administrator ===== */
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    if (!user) {
        return NextResponse.json(
            { message: "Not logged in." },
            { status: 401 }
        );
    }

    const { data: profile, error: profileError } = await authSupabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError) {
        console.error("Could not verify administrator access:", profileError);

        return NextResponse.json(
            { message: "Could not verify administrator access." },
            { status: 500 }
        );
    }

    if (profile?.role !== "admin") {
        return NextResponse.json(
            { message: "Not allowed." },
            { status: 403 }
        );
    }

    /* ===== Read editable operator fields ===== */
    const body = await _request.json();

    const companyName = String(body.companyName || "").trim();
    const kvkNumber = String(body.kvkNumber || "").trim();
    const vatNumber = String(body.vatNumber || "").trim();
    const pNumber = String(body.pNumber || "").trim();
    const contactEmail = String(body.contactEmail || "").trim();
    const contactPhone = String(body.contactPhone || "").trim();
    const street = String(body.street || "").trim();
    const houseNumber = String(body.houseNumber || "").trim();
    const postalCode = String(body.postalCode || "").trim();
    const city = String(body.city || "").trim();
    const countryCode = String(body.countryCode || "").trim().toUpperCase();
    /* ===== Validate required operator fields ===== */
    if (!companyName || !kvkNumber || !contactEmail || !contactPhone || !countryCode) {
        return NextResponse.json(
            { message: "Please fill in all required operator fields." },
            { status: 400 }
        );
    }

    /* ===== Validate country code ===== 
        So for example:
            NL  → valid
            BE  → valid
            NLD → invalid
            N1  → invalid
    */
    if (!/^[A-Z]{2}$/.test(countryCode)) {
        return NextResponse.json(
            { message: "Country code must contain exactly two letters." },
            { status: 400 }
        );
    }

    /* ===== Update editable operator details ===== */
    const { data: updatedOperator, error } = await supabaseAdmin
        .from("taxi_operators")
        .update({
            company_name: companyName,
            kvk_number: kvkNumber,
            vat_number: vatNumber || null,
            p_number: pNumber || null,
            contact_email: contactEmail,
            contact_phone: contactPhone,
            street: street || null,
            house_number: houseNumber || null,
            postal_code: postalCode || null,
            city: city || null,
            country_code: countryCode,
        })
        .eq("id", operatorId)
        .select("id")
        .maybeSingle();

    if (error) {
        console.error("Could not update taxi operator:", {
            operatorId,
            error,
        });

        if (error.code === "23505") {
            return NextResponse.json(
                { message: "KvK, VAT number, or P-number is already used by another operator." },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { message: "Could not update taxi operator." },
            { status: 500 }
        );
    }
    
    if (!updatedOperator) {
        return NextResponse.json(
            { message: "Taxi operator was not found." },
            { status: 404 }
        );
    }

    return NextResponse.json({
        message: "Taxi operator details updated successfully.",
    });
}