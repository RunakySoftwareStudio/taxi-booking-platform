
import Link from "next/link";
import {notFound} from "next/navigation";
import {requireAdminUser} from "@/lib/auth/requireAdminUser";
import {supabaseAdmin} from "@/lib/supabaseServer";
import {formStyles, pageStyles} from "@/styles/classNames";
import ChauffeurComplianceDocumentsForm from "@/components/ChauffeurComplianceDocumentsForm";

/* Defines the selected chauffeur ID received from the route. */
type AdminChauffeurDocumentsPageProps = {params: Promise<{chauffeurId: string}>};

/* ============================================================
   ADMIN CHAUFFEUR OFFICIAL DOCUMENTS PAGE
   Provides a protected entry point for Admin-assisted document
   management. Upload functionality will be connected later.
============================================================ */
export default async function AdminChauffeurDocumentsPage({params}: AdminChauffeurDocumentsPageProps) {
    await requireAdminUser();
    const {chauffeurId} = await params;

    /* Confirm the selected chauffeur exists before showing documents. */
    const {data: chauffeur, error} = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name")
        .eq("id", chauffeurId)
        .maybeSingle();

    if (error) {console.error("Could not load chauffeur documents page:", error); throw new Error("Could not load chauffeur.");}
    if (!chauffeur) {notFound();}

    /* ============================================================
    LOAD CHAUFFEUR COMPLIANCE DOCUMENTS
    Retrieves existing document metadata for the selected chauffeur.
    Files remain private in Supabase Storage.
    ============================================================ */
    const {data: uploadedDocuments, error: documentsError} = await supabaseAdmin
        .from("chauffeur_documents")
        .select("id, document_type, original_file_name, verification_status, uploaded_at, valid_until")
        .eq("chauffeur_id", chauffeurId)
        .order("uploaded_at", {ascending: false});

    if (documentsError) {
        console.error("Could not load chauffeur documents for Admin:", documentsError);
    }

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href={`/admin/chauffeurs/${chauffeurId}/support`} className={formStyles.link}>
                    {"\u2190"} Back to Support Dashboard
                </Link>
                <p className={pageStyles.pageLabelUpper}>Admin support mode</p>
                <h1 className={pageStyles.pageTitle}>Official Documents</h1>
                <p className={pageStyles.pageDescription}>Chauffeur: {chauffeur.name}</p>

                {/* ============================================================
                    ADMIN-ASSISTED COMPLIANCE DOCUMENT MANAGEMENT
                    Reuses the chauffeur document interface in Admin mode.
                    Upload and viewing use protected Admin API endpoints.
                    Document deletion is unavailable to Admin.
                ============================================================ */}
                {documentsError ? (
                    <p className={pageStyles.errorMsg}>Could not load chauffeur documents.</p>
                ) : (
                    <ChauffeurComplianceDocumentsForm
                        chauffeurId={chauffeurId}
                        uploadedDocuments={uploadedDocuments ?? []}
                        mode="admin"
                    />
                )}
            </div>
        </main>
    );
}
