import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Defines the chauffeur ID received from the API URL.
type RouteContext = { params: Promise<{ chauffeurId: string }> };

// Defines the values that may be submitted by the profile form.
type ProfileRequestBody = { phone?: unknown; serviceArea?: unknown; acceptsPets?: unknown; bio?: unknown; preferredLanguage?: unknown };

// Updates only the profile fields managed by the logged-in chauffeur.
export async function PATCH(request: Request, { params }: RouteContext) {
    // Reads the route ID and logged-in Supabase user.
    const { chauffeurId } = await params;
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    // Blocks visitors who are not logged in.
    if (!user) { return NextResponse.json({ message: "Not logged in." }, { status: 401 }); }

    // Confirms that this chauffeur owns the requested account.
    const { data: profile, error: profileError } = await authSupabase.from("user_profiles").select("role, chauffeur_id").eq("user_id", user.id).maybeSingle();
    if (profileError || profile?.role !== "chauffeur" || profile.chauffeur_id !== chauffeurId) { return NextResponse.json({ message: "Not allowed." }, { status: 403 }); }

    // Reads and prepares the submitted values.
    const body = await request.json() as ProfileRequestBody;
    const phone = String(body.phone ?? "").trim();
    const serviceArea = String(body.serviceArea ?? "").trim();
    const acceptsPets = body.acceptsPets;
    const bio = String(body.bio ?? "").trim();
    const preferredLanguage = String(body.preferredLanguage ?? "").trim();
    const supportedLanguages = ["en", "nl", "ar", "tr", "fa"];

    // Validates the required chauffeur fields.
    if (!phone || typeof acceptsPets !== "boolean") { return NextResponse.json({ message: "Please provide valid profile information." }, { status: 400 }); }

    // Validates optional biography and language values when they are submitted.
    if ("bio" in body && bio.length > 1000) { return NextResponse.json({ message: "Biography may contain a maximum of 1000 characters." }, { status: 400 }); }
    if ("preferredLanguage" in body && !supportedLanguages.includes(preferredLanguage)) { return NextResponse.json({ message: "Invalid preferred language." }, { status: 400 }); }

    // Creates a whitelist containing only chauffeur-table fields.
    const chauffeurUpdates: { phone: string; service_area: string | null; accepts_pets: boolean; bio?: string | null } = { phone, service_area: serviceArea || null, accepts_pets: acceptsPets };
    if ("bio" in body) { chauffeurUpdates.bio = bio || null; }

    // Updates the chauffeur business and public-profile information.
    const { data: updatedChauffeur, error: chauffeurError } = await supabaseAdmin.from("chauffeurs").update(chauffeurUpdates).eq("id", chauffeurId).select("id").maybeSingle();
    if (chauffeurError || !updatedChauffeur) { console.error("Could not update chauffeur profile:", chauffeurError); return NextResponse.json({ message: "Could not update chauffeur profile." }, { status: 500 }); }

    // Updates the logged-in user's preferred interface language when submitted.
    if ("preferredLanguage" in body) {
        const { data: updatedProfile, error: languageError } = await supabaseAdmin.from("user_profiles").update({ preferred_language: preferredLanguage }).eq("user_id", user.id).select("user_id").maybeSingle();
        if (languageError || !updatedProfile) { console.error("Could not update preferred language:", languageError); return NextResponse.json({ message: "Profile was updated, but the preferred language could not be saved." }, { status: 500 }); }
    }

    // Confirms that the permitted information was updated.
    return NextResponse.json({ message: "Chauffeur profile updated successfully." });
}