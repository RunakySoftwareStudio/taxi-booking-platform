
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {supabaseAdmin} from "@/lib/supabaseServer";

/* Same accepted document categories as the chauffeur upload API. */
const allowedDocumentTypes: string[] = [
    "identity_document", "driving_license", "chauffeur_card",
    "taxi_diploma", "vog", "medical_certificate",
    "residence_permit", "work_authorization",
    "employment_contract", "other"
];

/* Same file restrictions as the chauffeur upload API. */
const maximumFileSize = 8 * 1024 * 1024;
const allowedFileTypes: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png"
};

/* Defines the selected chauffeur supplied by the Admin API route. */
type RouteContext = {params: Promise<{chauffeurId: string}>};

/* ============================================================
   ADMIN-ASSISTED CHAUFFEUR DOCUMENT UPLOAD
   Verifies the logged-in user's Admin role before allowing
   access. File uploading will be implemented in the next step.
============================================================ */
export async function POST(request: Request, {params}: RouteContext) {
    const {chauffeurId} = await params;
    const authSupabase = await createClient();
    const {data: {user}, error: authError} = await authSupabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({message: "Not logged in."}, {status: 401});
    }

    /* Confirm that the authenticated user has the Admin role. */
    const {data: profile, error: profileError} = await authSupabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError || profile?.role !== "admin") {
        return NextResponse.json({message: "Not allowed."}, {status: 403});
    }
    
    /* ============================================================
       ADMIN-ASSISTED DOCUMENT UPLOAD
       Validates the document and saves it for the selected chauffeur.
       Records the actual Admin user as the uploader.
    ============================================================ */

    /* Confirm that the selected chauffeur exists. */
    const {data: chauffeur, error: chauffeurError} = await supabaseAdmin
        .from("chauffeurs")
        .select("id")
        .eq("id", chauffeurId)
        .maybeSingle();

    if (chauffeurError || !chauffeur) {
        return NextResponse.json({message: "Chauffeur not found."}, {status: 404});
    }

    /* Read and validate the submitted document. */
    const formData = await request.formData();
    const uploadedFile = formData.get("document");
    const documentType = String(formData.get("documentType") ?? "").trim();

    if (!allowedDocumentTypes.includes(documentType)) {
        return NextResponse.json({message: "Invalid document type."}, {status: 400});
    }

    if (!(uploadedFile instanceof File) || uploadedFile.size === 0) {
        return NextResponse.json({message: "Please select a document."}, {status: 400});
    }

    const fileExtension = allowedFileTypes[uploadedFile.type];

    if (!fileExtension) {
        return NextResponse.json({message: "Only PDF, JPEG and PNG files are allowed."}, {status: 400});
    }

    if (uploadedFile.size > maximumFileSize) {
        return NextResponse.json({message: "The document may not exceed 8 MB."}, {status: 400});
    }

    /* Generate a unique file ID and private Storage path. */
    const documentId = crypto.randomUUID();
    const storagePath = `chauffeurs/${chauffeurId}/${documentType}/${documentId}.${fileExtension}`;
    const fileBuffer = await uploadedFile.arrayBuffer();

    /* Store the document in the existing private Storage bucket. */
    const {error: uploadError} = await supabaseAdmin.storage
        .from("chauffeur-documents")
        .upload(storagePath, fileBuffer, {
            contentType: uploadedFile.type,
            cacheControl: "3600",
            upsert: false
        });

    if (uploadError) {
        console.error("Admin document upload failed:", uploadError);
        return NextResponse.json({message: "Could not upload the document."}, {status: 500});
    }

    /* Register the document with the Admin as uploader.
       Verification remains pending; upload is not approval. */
    const {data: documentRow, error: insertError} = await supabaseAdmin
        .from("chauffeur_documents")
        .insert({
            id: documentId,
            chauffeur_id: chauffeurId,
            document_type: documentType,
            storage_path: storagePath,
            original_file_name: uploadedFile.name,
            mime_type: uploadedFile.type,
            file_size_bytes: uploadedFile.size,
            uploaded_by: user.id
        })
        .select("id, document_type, verification_status, uploaded_at")
        .single();

    /* Remove the private file if saving its metadata fails. */
    if (insertError || !documentRow) {
        console.error("Admin document metadata insert failed:", insertError);
        await supabaseAdmin.storage.from("chauffeur-documents").remove([storagePath]);
        return NextResponse.json({message: "Could not save document metadata."}, {status: 500});
    }

    return NextResponse.json(
        {message: "Document uploaded on behalf of chauffeur.", document: documentRow},
        {status: 201}
    );
}
