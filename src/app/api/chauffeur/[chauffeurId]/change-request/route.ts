import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Defines the chauffeur ID received from the API route.
type RouteContext = { params: Promise<{ chauffeurId: string }> };

// Defines the protected fields that a chauffeur may request to change.
type ChangeableField = "name" | "email" | "company_name" | "license_number";

// Creates a protected profile-change request for administrator review.
export async function POST(request: Request, { params }: RouteContext) {
    // Reads the chauffeur ID and logged-in Supabase user.
    const { chauffeurId } = await params;
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    // Stops visitors who are not logged in.
    if (!user) { return NextResponse.json({ message: "Not logged in." }, { status: 401 }); }

    // Confirms that the user is the chauffeur who owns this account.
    const { data: profile, error: profileError } = await authSupabase.from("user_profiles").select("role, chauffeur_id").eq("user_id", user.id).maybeSingle();
    if (profileError || profile?.role !== "chauffeur" || profile.chauffeur_id !== chauffeurId) { return NextResponse.json({ message: "Not allowed." }, { status: 403 }); }

    // Reads and validates the submitted request values.
    const body = await request.json() as { fieldName?: unknown; requestedValue?: unknown; reason?: unknown };
    const fieldName = String(body.fieldName ?? "") as ChangeableField;
    const requestedValue = String(body.requestedValue ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    const allowedFields: ChangeableField[] = ["name", "email", "company_name", "license_number"];

    if (!allowedFields.includes(fieldName) || !requestedValue) { return NextResponse.json({ message: "Please provide valid request information." }, { status: 400 }); }
    if (requestedValue.length > 200 || reason.length > 1000) { return NextResponse.json({ message: "The submitted information is too long." }, { status: 400 }); }

    // Loads the current protected chauffeur values.
    const { data: chauffeurRow, error: chauffeurError } = await supabaseAdmin.from("chauffeurs").select("name, email, company_name, license_number").eq("id", chauffeurId).maybeSingle();
    if (chauffeurError || !chauffeurRow) { return NextResponse.json({ message: "Chauffeur could not be found." }, { status: 404 }); }

    // Selects the current value that belongs to the requested field.
    const currentValues: Record<ChangeableField, string> = { name: chauffeurRow.name ?? "", email: chauffeurRow.email ?? "", company_name: chauffeurRow.company_name ?? "", license_number: chauffeurRow.license_number ?? "" };
    const currentValue = currentValues[fieldName];

    // Prevents submitting the same value that is already stored.
    if (currentValue.trim().toLowerCase() === requestedValue.toLowerCase()) { return NextResponse.json({ message: "The requested value is already in use." }, { status: 400 }); }

    // Stores the request without changing the real chauffeur record.
    const { data: savedRequest, error } = await supabaseAdmin.from("chauffeur_change_requests").insert({ chauffeur_id: chauffeurId, field_name: fieldName, current_value: currentValue || null, requested_value: requestedValue, reason: reason || null, status: "pending" }).select("id").single();

    // Reports duplicate pending requests and other database errors.
    if (error || !savedRequest) {
        console.error("Could not create chauffeur change request:", error);
        if (error?.code === "23505") { return NextResponse.json({ message: "A pending request already exists for this field." }, { status: 409 }); }
        return NextResponse.json({ message: "Could not create the change request." }, { status: 500 });
    }

    // Confirms that the request was saved for administrator review.
    return NextResponse.json({ message: "Change request submitted successfully." }, { status: 201 });
}