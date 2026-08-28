
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

/* Defines the chauffeur and document IDs received from the API URL. */
type RouteContext = {
    params: Promise<{
        chauffeurId: string;
        documentId: string;
    }>;
};

const bucketName = "chauffeur-documents";
const signedUrlLifetimeSeconds = 5 * 60;

/* Creates a short-lived private document URL for an administrator. */
export async function GET(_request: Request, { params }: RouteContext) {
    const { chauffeurId, documentId } = await params;

    /* Confirms that the current user is logged in. */
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ message: "Not logged in." }, { status: 401 });
    }

    /* Confirms that the logged-in user is an administrator. */
    const { data: profile, error: profileError } = await authSupabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError || profile?.role !== "admin") {
        return NextResponse.json({ message: "Not allowed." }, { status: 403 });
    }

    /* Loads the private Storage path and confirms ownership by this chauffeur. */
    const { data: documentRow, error: documentError } = await supabaseAdmin
        .from("chauffeur_documents")
        .select("id, storage_path")
        .eq("id", documentId)
        .eq("chauffeur_id", chauffeurId)
        .maybeSingle();

    if (documentError) {
        console.error("Could not load chauffeur document:", documentError);
        return NextResponse.json(
            { message: "Could not load the document." },
            { status: 500 }
        );
    }

    if (!documentRow) {
        return NextResponse.json(
            { message: "Document could not be found." },
            { status: 404 }
        );
    }

    /* Creates a private URL that automatically expires after five minutes. */
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from(bucketName)
        .createSignedUrl(documentRow.storage_path, signedUrlLifetimeSeconds);

    if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error("Could not create chauffeur document signed URL:", signedUrlError);

        return NextResponse.json(
            { message: "Could not open the document." },
            { status: 500 }
        );
    }

    /* Returns the temporary URL without exposing the permanent Storage path. */
    return NextResponse.json({
        signedUrl: signedUrlData.signedUrl
    });
}