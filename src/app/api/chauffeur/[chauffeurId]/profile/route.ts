import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Defines the chauffeur ID received from the API URL.
type RouteContext = { params: Promise<{ chauffeurId: string }> };

// Updates only the chauffeur fields that the chauffeur is allowed to manage.
export async function PATCH(request: Request, { params }: RouteContext) {
    // Reads the chauffeur ID and currently logged-in user.
    const { chauffeurId } = await params;
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    // Stops visitors who are not logged in.
    if (!user) { return NextResponse.json({ message: "Not logged in." }, { status: 401 }); }

    // Reads the user's role and connected chauffeur record.
    const { data: profile, error: profileError } = await authSupabase.from("user_profiles").select("role, chauffeur_id").eq("user_id", user.id).maybeSingle();

    // Stops users without a valid application profile.
    if (profileError || !profile) { return NextResponse.json({ message: "User profile could not be verified." }, { status: 403 }); }

    // Allows an administrator or the chauffeur who owns this account.
    const isAdminUser = profile.role === "admin";
    if (!isAdminUser && profile.chauffeur_id !== chauffeurId) { return NextResponse.json({ message: "Not allowed." }, { status: 403 }); }

    // Reads only the three permitted values from the request.
    const body = await request.json() as { phone?: unknown; serviceArea?: unknown; acceptsPets?: unknown };
    const phone = String(body.phone ?? "").trim();
    const serviceArea = String(body.serviceArea ?? "").trim();
    const acceptsPets = body.acceptsPets;

    // Validates the required phone and checkbox values.
    if (!phone || typeof acceptsPets !== "boolean") { return NextResponse.json({ message: "Please provide valid profile information." }, { status: 400 }); }

    // Updates only the whitelisted chauffeur fields.
    const { data: updatedChauffeur, error } = await supabaseAdmin.from("chauffeurs").update({ phone, service_area: serviceArea || null, accepts_pets: acceptsPets }).eq("id", chauffeurId).select("id").maybeSingle();

    // Reports database errors or a missing chauffeur record.
    if (error || !updatedChauffeur) {
        console.error("Could not update chauffeur profile:", error);
        return NextResponse.json({ message: "Could not update chauffeur profile." }, { status: 500 });
    }

    // Returns success after the profile has been updated.
    return NextResponse.json({ message: "Chauffeur profile updated successfully." });
}