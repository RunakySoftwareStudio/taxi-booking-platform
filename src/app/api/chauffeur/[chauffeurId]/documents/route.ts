
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

/* Defines the chauffeur ID received from the API URL. */
type RouteContext = { params: Promise<{ chauffeurId: string }> };

/* Defines the chauffeur document types currently supported by Voya Taxi. */
const allowedDocumentTypes = [
    "identity_document",
    "driving_license",
    "chauffeur_card",
    "taxi_diploma",
    "vog",
    "medical_certificate",
    "residence_permit",
    "work_authorization",
    "employment_contract",
    "other"
] as const;

/* Defines the private Storage bucket and accepted upload formats. */
const bucketName = "chauffeur-documents";
const maximumFileSize = 8 * 1024 * 1024;

const allowedFileTypes: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png"
};

/* Checks whether the submitted value is a supported chauffeur document type. */
function isAllowedDocumentType(value: string) {
    return allowedDocumentTypes.some((documentType) => documentType === value);
}

/* Uploads one private compliance document for the logged-in chauffeur. */
export async function POST(request: Request, { params }: RouteContext) {
    /* Reads the chauffeur ID and logged-in Supabase user. */
    const { chauffeurId } = await params;
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ message: "Not logged in." }, { status: 401 });
    }

    /* Confirms that the logged-in chauffeur owns this chauffeur record. */
    const { data: profile, error: profileError } = await authSupabase
        .from("user_profiles")
        .select("role, chauffeur_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError || profile?.role !== "chauffeur" || profile.chauffeur_id !== chauffeurId) {
        return NextResponse.json({ message: "Not allowed." }, { status: 403 });
    }

    /* Reads the document and document type from multipart form data. */
    const formData = await request.formData();
    const uploadedFile = formData.get("document");
    const documentType = String(formData.get("documentType") || "").trim();

    if (!isAllowedDocumentType(documentType)) {
        return NextResponse.json({ message: "Invalid document type." }, { status: 400 });
    }

    if (!(uploadedFile instanceof File) || uploadedFile.size === 0) {
        return NextResponse.json({ message: "Please select a document." }, { status: 400 });
    }

    /* Validates file format and maximum size. */
    const fileExtension = allowedFileTypes[uploadedFile.type];

    if (!fileExtension) {
        return NextResponse.json(
            { message: "Only PDF, JPEG and PNG documents are allowed." },
            { status: 400 }
        );
    }

    if (uploadedFile.size > maximumFileSize) {
        return NextResponse.json(
            { message: "The document may not exceed 8 MB." },
            { status: 400 }
        );
    }

    /* Confirms that the chauffeur still exists before storing a document. */
    const { data: chauffeurRow, error: chauffeurError } = await supabaseAdmin
        .from("chauffeurs")
        .select("id")
        .eq("id", chauffeurId)
        .maybeSingle();

    if (chauffeurError || !chauffeurRow) {
        return NextResponse.json({ message: "Chauffeur could not be found." }, { status: 404 });
    }

    /* Creates a unique private Storage path without exposing the original filename. */
    const documentId = crypto.randomUUID();
    const storagePath = `chauffeurs/${chauffeurId}/${documentType}/${documentId}.${fileExtension}`;
    const fileBuffer = await uploadedFile.arrayBuffer();

    /* Uploads the document to the private chauffeur-documents bucket. */
    const { error: uploadError } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(storagePath, fileBuffer, {
            contentType: uploadedFile.type,
            cacheControl: "3600",
            upsert: false
        });

    if (uploadError) {
        console.error("Could not upload chauffeur document:", uploadError);
        return NextResponse.json({ message: "Could not upload the document." }, { status: 500 });
    }

    /*  Saves private Storage metadata and the pending-review document record. 
        Insert this document metadata into chauffeur_documents, return these four columns from the created row, 
        and because exactly one row is expected, return it as a single object.
    */
    const { data: documentRow, error: insertError } = await supabaseAdmin
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
        //return these four columns from the created row, return it as a single object. 
        .select("id, document_type, verification_status, uploaded_at")
        .single();

    /* Removes the uploaded file again if its database record could not be saved. */
    if (insertError || !documentRow) {
        console.error("Could not save chauffeur document metadata:", insertError);
        await supabaseAdmin.storage.from(bucketName).remove([storagePath]);

        return NextResponse.json(
            { message: "Could not save the document." },
            { status: 500 }
        );
    }

    /* Returns metadata only; private documents never receive a public URL. */
    return NextResponse.json(
        {
            message: "Document uploaded successfully.",
            document: documentRow
        },
        { status: 201 }
    );
}

/* ============================================================
   VIEW PRIVATE CHAUFFEUR DOCUMENT

   Allows the logged-in chauffeur to open one of their own
   uploaded compliance documents.

   Security:
   - The user must be logged in as a chauffeur.
   - The chauffeur ID in user_profiles must match the URL.
   - The document must belong to that same chauffeur.
   - The private Storage path is never returned directly.
   - Supabase creates a temporary signed URL valid for 5 minutes.
============================================================ */
export async function GET(request: Request, { params }: RouteContext) {
    /* Reads the chauffeur ID and currently logged-in user. */
    const { chauffeurId } = await params;
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    if (!user) {
        return NextResponse.json(
            { message: "Not logged in." },
            { status: 401 }
        );
    }

    /* Confirms that this logged-in chauffeur owns the profile being viewed. */
    const { data: profile, error: profileError } = await authSupabase
        .from("user_profiles")
        .select("role, chauffeur_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (
        profileError ||
        profile?.role !== "chauffeur" ||
        profile.chauffeur_id !== chauffeurId
    ) {
        return NextResponse.json(
            { message: "Not allowed." },
            { status: 403 }
        );
    }

    /* Reads the requested document ID from the URL query string. */
    const documentId = new URL(request.url).searchParams.get("documentId");

    if (!documentId) {
        return NextResponse.json(
            { message: "Document ID is required." },
            { status: 400 }
        );
    }

    /* Loads only the private Storage path and confirms document ownership. */
    const { data: documentRow, error: documentError } = await supabaseAdmin
        .from("chauffeur_documents")
        .select("storage_path")
        .eq("id", documentId)
        .eq("chauffeur_id", chauffeurId)
        .maybeSingle();

    if (documentError || !documentRow) {
        return NextResponse.json(
            { message: "Document could not be found." },
            { status: 404 }
        );
    }

    /* Creates a temporary private URL instead of exposing a public document URL. */
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from(bucketName)
        .createSignedUrl(documentRow.storage_path, 5 * 60);

    if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error("Could not create chauffeur document signed URL:", signedUrlError);

        return NextResponse.json(
            { message: "Could not open the document." },
            { status: 500 }
        );
    }

    return NextResponse.json({
        signedUrl: signedUrlData.signedUrl
    });
}

/* Deletes one pending-review document owned by the logged-in chauffeur. */
export async function DELETE(request: Request, { params }: RouteContext) {
    /* Reads the chauffeur ID and logged-in Supabase user. */
    const { chauffeurId } = await params;
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ message: "Not logged in." }, { status: 401 });
    }

    /* Confirms that the logged-in chauffeur owns this chauffeur record. */
    const { data: profile, error: profileError } = await authSupabase
        .from("user_profiles")
        .select("role, chauffeur_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError || profile?.role !== "chauffeur" || profile.chauffeur_id !== chauffeurId) {
        return NextResponse.json({ message: "Not allowed." }, { status: 403 });
    }

    /* Reads the document ID from the URL query string. */
    const documentId = new URL(request.url).searchParams.get("documentId");

    if (!documentId) {
        return NextResponse.json({ message: "Document ID is required." }, { status: 400 });
    }

    /* Loads the document and confirms that it belongs to this chauffeur. */
    const { data: documentRow, error: documentError } = await supabaseAdmin
        .from("chauffeur_documents")
        .select("id, storage_path, verification_status")
        .eq("id", documentId)
        .eq("chauffeur_id", chauffeurId)
        .maybeSingle();

    if (documentError || !documentRow) {
        return NextResponse.json({ message: "Document could not be found." }, { status: 404 });
    }

    /* Verified/history documents cannot be removed by the chauffeur. */
    if (documentRow.verification_status !== "pending_review") {
        return NextResponse.json(
            { message: "Only documents waiting for review can be deleted." },
            { status: 409 }
        );
    }

    /* Removes the database record first so the document is no longer visible. */
    const { data: deletedDocument, error: deleteError } = await supabaseAdmin
        .from("chauffeur_documents")
        .delete()
        .eq("id", documentId)
        .eq("chauffeur_id", chauffeurId)
        .select("id")
        .maybeSingle();

    if (deleteError || !deletedDocument) {
        console.error("Could not delete chauffeur document record:", deleteError);
        return NextResponse.json({ message: "Could not delete the document." }, { status: 500 });
    }

    /* Removes the now-unreferenced private file from Storage. */
    const { error: storageError } = await supabaseAdmin.storage
        .from(bucketName)
        .remove([documentRow.storage_path]);

    if (storageError) {
        console.error("Could not remove chauffeur document from Storage:", storageError);
    }

    return NextResponse.json({ message: "Document deleted successfully." });
}