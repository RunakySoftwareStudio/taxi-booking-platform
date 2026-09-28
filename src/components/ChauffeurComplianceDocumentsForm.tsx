
"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formStyles, pageStyles } from "@/styles/classNames";

type ChauffeurDocumentRow = {
    id: string;
    document_type: string;
    original_file_name: string;
    verification_status: string;
    uploaded_at: string;
    valid_until: string | null;
};

/* Defines the chauffeur ID and  uploadedDocuments received from the profile page. */
type ChauffeurComplianceDocumentsFormProps = {
    chauffeurId: string;
    uploadedDocuments?: ChauffeurDocumentRow[];
};
/* Defines the private compliance document types supported by Voya Taxi. */
const documentTypes = [
    { value: "chauffeur_card", label: "Chauffeurskaart" },
    { value: "driving_license", label: "Driving licence" },
    { value: "identity_document", label: "Identity document" },
    { value: "taxi_diploma", label: "Taxi diploma" },
    { value: "vog", label: "VOG" },
    { value: "medical_certificate", label: "Medical certificate" },
    { value: "residence_permit", label: "Residence permit" },
    { value: "work_authorization", label: "Work authorization" },
    { value: "employment_contract", label: "Employment contract" },
    { value: "other", label: "Other document" }
] as const;

/* Converts a stored document type into the readable label used in the UI. 
?.   = safely access something if it exists
??   = use the right side if the left side is null/undefined

you can write the function like:
    const matchingDocumentType = documentTypes.find((option) => option.value === documentTypeValue);
    if (matchingDocumentType) {return matchingDocumentType.label;}
    return documentTypeValue.replaceAll("_", " ");
*/
function getDocumentTypeLabel(documentTypeValue: string) {
    return documentTypes.find((option) => option.value === documentTypeValue) ?.label ?? documentTypeValue.replaceAll("_", " ");
}

/* Defines the same upload restrictions enforced by the server API. */
const maximumFileSize = 8 * 1024 * 1024;
const allowedFileTypes = ["application/pdf", "image/jpeg", "image/png"];

/* Selects and uploads a private chauffeur compliance document. */
export default function ChauffeurComplianceDocumentsForm({chauffeurId, uploadedDocuments = []}: ChauffeurComplianceDocumentsFormProps) {

    const router = useRouter();

    /* Stores the current form and upload state. */
    const [documentType, setDocumentType] = useState("chauffeur_card");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);

    /* Stores which private document is currently being opened. */
    const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(null);

    /* Connects the styled file-selection button to the hidden browser input. */
    const documentInputId = `chauffeur-document-${chauffeurId}`;

    /* Groups uploaded documents by type while preserving their existing newest-first order. */
    const groupedDocuments = uploadedDocuments.reduce<Record<string, ChauffeurDocumentRow[]>>((groups, document) => {
        (groups[document.document_type] ??= []).push(document);
        return groups;
    }, {});

    /* Validates the selected document before it is sent to the server. */
    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const nextFile = event.target.files?.[0] ?? null;

        setSuccessMessage("");
        setErrorMessage("");

        if (!nextFile) {
            setSelectedFile(null);
            return;
        }

        if (!allowedFileTypes.includes(nextFile.type)) {
            setSelectedFile(null);
            setErrorMessage("Only PDF, JPEG and PNG documents are allowed.");
            return;
        }

        if (nextFile.size > maximumFileSize) {
            setSelectedFile(null);
            setErrorMessage("The document may not exceed 8 MB.");
            return;
        }

        setSelectedFile(nextFile);
    }

    /* Sends the selected private document to the protected chauffeur API. */
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const formElement = event.currentTarget;

        setSuccessMessage("");
        setErrorMessage("");

        if (!selectedFile) {
            setErrorMessage("Please select a document first.");
            return;
        }

        setIsUploading(true);

        try {
            const formData = new FormData();

            formData.append("documentType", documentType);
            formData.append("document", selectedFile);

            const response = await fetch(`/api/chauffeur/${chauffeurId}/documents`,
                {method: "POST", body: formData}
            );

            const result = await response.json();

            if (!response.ok) {
                console.error("Compliance document upload failed:", result.message);
                setErrorMessage(result.message || "Could not upload the document.");
                return;
            }

            setSelectedFile(null);
            formElement.reset();
            setDocumentType("chauffeur_card");

            setSuccessMessage("Document uploaded successfully and is waiting for review.");

            router.refresh();
        } catch (error) {
            console.error("Could not upload chauffeur compliance document:", error);
            setErrorMessage("Could not upload the document.");
        } finally {
            setIsUploading(false);
        }
    }

    /* ============================================================
    VIEW PRIVATE UPLOADED DOCUMENT

    Opens one document belonging to the logged-in chauffeur.

    The document remains private:
    - the browser asks the protected chauffeur API for access;
    - the API verifies chauffeur ownership;
    - Supabase returns a temporary signed URL;
    - the private Storage path is never exposed directly.

    A blank tab is opened before the async request so the browser
    does not block the document as an unwanted popup.
    ============================================================ */
    async function handleViewDocument(documentId: string) {
        setSuccessMessage("");
        setErrorMessage("");
        setViewingDocumentId(documentId);

        const documentWindow = window.open("about:blank", "_blank");

        if (!documentWindow) {
            setViewingDocumentId(null);
            setErrorMessage("The browser blocked the document window. Please allow popups.");
            return;
        }

        documentWindow.opener = null;

        try {
            const response = await fetch(
                `/api/chauffeur/${chauffeurId}/documents?documentId=${documentId}`
            );

            const result = await response.json();

            if (!response.ok || !result.signedUrl) {
                documentWindow.close();
                setErrorMessage(result.message || "Could not open the document.");
                return;
            }

            documentWindow.location.href = result.signedUrl;
        }
        catch (error) {
            documentWindow.close();
            console.error("Could not open chauffeur compliance document:", error);
            setErrorMessage("Could not open the document.");
        }
        finally {
            setViewingDocumentId(null);
        }
    }

    /* Deletes one pending-review compliance document after chauffeur confirmation. */
    async function handleDeleteDocument(documentId: string) {
        if (!window.confirm("Delete this uploaded document?")) { return; }

        setSuccessMessage("");
        setErrorMessage("");
        setDeletingDocumentId(documentId);

        try {
            const response = await fetch(
                `/api/chauffeur/${chauffeurId}/documents?documentId=${documentId}`,
                { method: "DELETE" }
            );

            const result = await response.json();

            if (!response.ok) {
                console.error("Compliance document deletion failed:", result.message);
                setErrorMessage(result.message || "Could not delete the document.");
                return;
            }

            setSuccessMessage("Document deleted successfully.");
            router.refresh();
        } catch (error) {
            console.error("Could not delete chauffeur compliance document:", error);
            setErrorMessage("Could not delete the document.");
        } finally {
            setDeletingDocumentId(null);
        }
    }

    /* Displays the private compliance-document upload section. */
    return (
        <div className="mt-8">
            {(successMessage || errorMessage) && (
                <div className="mb-4">
                    {successMessage && <p className={pageStyles.successMsgPage}>{successMessage}</p>}
                    {errorMessage && <p className={pageStyles.errorMsgPage}>{errorMessage}</p>}
                </div>
            )}

            <section className={formStyles.sectionCardBorder4}>
                <h2 className="text-xl font-semibold text-white text-start">
                    Compliance documents
                </h2>

                <p className="mt-1 text-sm text-slate-400 text-start">
                    Upload the documents required to verify your chauffeur qualifications.
                    Documents are stored privately and reviewed by Voya Taxi.
                </p>

                <form onSubmit={handleSubmit} className="mt-6 grid gap-5">

                    {/* Selects which kind of compliance document is being uploaded. */}
                    <label className="block">
                        <span className={formStyles.label}>Document type</span>

                        <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className={formStyles.selectWFull}>
                            {documentTypes.map((documentTypeOption) => (
                                <option key={documentTypeOption.value} value={documentTypeOption.value}>
                                    {documentTypeOption.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    {/* Selects the private file without exposing the native input styling. */}
                    <div>
                        <p className={formStyles.label}>Select document</p>
                        <input id={documentInputId} type="file" name="document" accept="application/pdf,image/jpeg,image/png" onChange={handleFileChange} className="sr-only"/>
                        <div className="flex min-h-10 w-full items-center rounded-xl border border-cyan-400/50 bg-slate-950">
                            <label htmlFor={documentInputId} className="cursor-pointer rounded-s-xl bg-cyan-950 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-900">
                                Choose file
                            </label>
                            <span className="min-w-0 flex-1 truncate px-4 text-sm text-slate-300">
                                {selectedFile?.name || "No file chosen"}
                            </span>
                        </div>
                    </div>

                    <p className="text-sm text-slate-400 text-start">
                        PDF, JPEG or PNG — maximum file size 8 MB.
                    </p>

                    {selectedFile && !isUploading && (
                        <p className="text-sm font-semibold text-yellow-300 text-start">
                            The selected document has not been uploaded yet.
                        </p>
                    )}

                    <div>
                        <button type="submit" disabled={isUploading} className={formStyles.primaryButtonOutside} >
                            {isUploading ? "Uploading..." : selectedFile
                                    ? "Upload selected document"
                                    : "Choose document first"}
                        </button>
                    </div>

                </form>

                {/* ============================================================
                    GROUPED CHAUFFEUR DOCUMENTS

                    Groups the chauffeur's uploaded documents into expandable
                    categories while preserving document history and actions.
                ============================================================ */}
                <div className="mt-8 border-t border-cyan-400/20 pt-6">
                    <h3 className="text-lg font-semibold text-white text-start">Uploaded documents</h3>
                    <p className="mt-2 text-sm text-slate-400 text-start">Select a category to view its uploaded documents.</p>

                    {uploadedDocuments.length === 0 ? (
                        <p className="mt-4 text-sm text-slate-400 text-start">No compliance documents uploaded yet.</p>
                    ) : (
                        <div className="mt-4 grid gap-3">
                            {Object.entries(groupedDocuments).map(([documentType, categoryDocuments]) => (
                                <details key={documentType} className="group rounded-xl border border-cyan-400/20 bg-slate-950/40 text-start">

                                    {/* Shows the document category, count and pending-review state. */}
                                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4 text-slate-200">
                                        <div className="flex items-center gap-3">
                                            <span className="text-cyan-300 transition-transform group-open:rotate-90">▶</span>
                                            <span className="font-semibold">{getDocumentTypeLabel(documentType)}</span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-xs text-slate-400">
                                                {categoryDocuments.length} {categoryDocuments.length === 1 ? "document" : "documents"}
                                            </span>

                                            {categoryDocuments.some((document) => document.verification_status === "pending_review") && (
                                                <span className="rounded-full border border-yellow-400/30 px-3 py-1 text-xs text-yellow-200">Pending review</span>
                                            )}
                                        </div>
                                    </summary>

                                    {/* Shows all uploaded versions within this document category. */}
                                    <div className="grid gap-3 border-t border-cyan-400/20 p-4">
                                        {categoryDocuments.map((document) => (
                                            <div key={document.id} className="rounded-xl border border-cyan-400/20 bg-slate-900/60 p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="break-all font-semibold text-white">{document.original_file_name}</p>
                                                        <p className="mt-3 text-xs text-slate-400">Uploaded: {new Date(document.uploaded_at).toLocaleString()}</p>

                                                        {document.valid_until && (
                                                            <p className="mt-1 text-xs text-slate-400">Valid until: {document.valid_until}</p>
                                                        )}
                                                    </div>

                                                    <span className="rounded-full border border-yellow-400/30 px-3 py-1 text-xs font-semibold text-yellow-200">
                                                        {document.verification_status}
                                                    </span>
                                                </div>

                                                {/* Keeps the chauffeur's existing private document actions. */}
                                                <div className="mt-3 flex flex-wrap gap-3">
                                                    <button type="button" onClick={() => handleViewDocument(document.id)} disabled={viewingDocumentId === document.id} className="rounded-xl border border-cyan-400/40 px-3 py-1.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50">
                                                        {viewingDocumentId === document.id ? "Opening..." : "View document"}
                                                    </button>

                                                    {document.verification_status === "pending_review" && (
                                                        <button type="button" onClick={() => handleDeleteDocument(document.id)} disabled={deletingDocumentId === document.id} className="rounded-xl border border-red-400/40 px-3 py-1.5 text-sm font-semibold text-red-200 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50">
                                                            {deletingDocumentId === document.id ? "Deleting..." : "Delete"}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}