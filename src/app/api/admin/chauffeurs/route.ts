import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

/* ============================================================
   CREATE CHAUFFEUR

   Creates a chauffeur from the Admin new-chauffeur page.
   Returns the new chauffeur ID so the UI can redirect to the
   normal chauffeur detail/compliance page.
============================================================ */

export async function POST(request: Request) {
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    if (!user) { return NextResponse.json({ message: "Not logged in." }, { status: 401 }); }

    const { data: profile } = await authSupabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profile?.role !== "admin") { return NextResponse.json({ message: "Not allowed." }, { status: 403 }); }

    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const operatorId = String(body.operatorId || "").trim();
    const serviceArea = String(body.serviceArea || "").trim();
    const accountStatus = String(body.accountStatus || "").trim();
    const operationalStatus = String(body.operationalStatus || "").trim();
    const statusReason = String(body.statusReason || "").trim();
    const acceptsPets = Boolean(body.acceptsPets);

    if (!name || !email || !phone || !accountStatus || !operationalStatus) {
        return NextResponse.json({ message: "Please fill in all required fields." }, { status: 400 });
    }

    /* Validate the optional taxi operator before creating the chauffeur. */
    if (operatorId) {
        const { data: operatorRow, error: operatorError } = await supabaseAdmin
            .from("taxi_operators")
            .select("id")
            .eq("id", operatorId)
            .maybeSingle();

        if (operatorError) {
            console.error("Could not validate taxi operator:", operatorError);
            return NextResponse.json({ message: "Could not validate taxi operator." }, { status: 500 });
        }

        if (!operatorRow) { return NextResponse.json({ message: "Selected taxi operator was not found." }, { status: 400 }); }
    }

    /* Validate chauffeur account status against the database enum. */
    const { data: allowedStatuses, error: statusesError } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "chauffeur_account_status" });

    if (statusesError) {
        console.error("Could not load chauffeur account statuses:", statusesError);
        return NextResponse.json({ message: "Could not validate chauffeur account status." }, { status: 500 });
    }

    if (!((allowedStatuses ?? []) as string[]).includes(accountStatus)) {
        return NextResponse.json({ message: "Invalid account status." }, { status: 400 });
    }

    /* Validate chauffeur operational status against the database enum. */
    const { data: allowedOperationalStatuses, error: operationalStatusesError } = await supabaseAdmin.rpc(
        "get_enum_values",
        { p_enum_type_name: "chauffeur_operational_status" }
    );

    if (operationalStatusesError) {
        console.error("Could not load chauffeur operational statuses:", operationalStatusesError);
        return NextResponse.json({ message: "Could not validate chauffeur operational status." }, { status: 500 });
    }

    if (!((allowedOperationalStatuses ?? []) as string[]).includes(operationalStatus)) {
        return NextResponse.json({ message: "Invalid chauffeur operational status." }, { status: 400 });
    }

    /* Create the chauffeur and return its generated ID. */
    const { data: chauffeurRow, error } = await supabaseAdmin
        .from("chauffeurs")
        .insert({
            name,
            email,
            phone,
            operator_id: operatorId || null,
            service_area: serviceArea || null,
            account_status: accountStatus,
            accepts_pets: acceptsPets,
            operational_status: operationalStatus,
            status_reason: operationalStatus === "available" ? null : statusReason || null,
        })
        .select("id")
        .single();

    if (error) {
        console.error("Could not create chauffeur:", error);
        if (error.code === "23505") { return NextResponse.json({ message: "A chauffeur with this email already exists." }, { status: 409 }); }
        return NextResponse.json({ message: "Could not create chauffeur." }, { status: 500 });
    }

    return NextResponse.json({
        message: "Chauffeur created successfully.",
        chauffeurId: chauffeurRow.id,
    });
}