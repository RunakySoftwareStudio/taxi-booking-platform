
import { formStyles } from "@/styles/classNames";
import AdminChauffeurDocumentViewButton from "@/components/AdminChauffeurDocumentViewButton";

/* Defines the chauffeur compliance information shown to the administrator. */
type ChauffeurComplianceRow = {
    chauffeur_id: string;
    driving_license_valid_until: string | null;
    driving_license_checked_at: string | null;
    chauffeur_card_number: string | null;
    chauffeur_card_valid_until: string | null;
    chauffeur_card_checked_at: string | null;
    verification_status: string;
    verification_status_reason: string | null;
    verification_status_changed_at: string;
    verified_at: string | null;
};

/* Defines one uploaded chauffeur compliance document. */
type ChauffeurDocumentRow = {
    id: string;
    document_type: string;
    original_file_name: string;
    mime_type: string;
    file_size_bytes: number;
    valid_from: string | null;
    valid_until: string | null;
    verification_status: string;
    verification_reason: string | null;
    verification_status_changed_at: string;
    verified_at: string | null;
    uploaded_at: string;
};

/* Defines the compliance data received from the Admin Chauffeur page. */
type AdminChauffeurCompliancePanelProps = {
    compliance: ChauffeurComplianceRow | null;
    documents: ChauffeurDocumentRow[];
};

/* Converts the stored document type into a readable Admin label. */
function getDocumentTypeLabel(documentTypeValue: string) {
    const documentLabels: Record<string, string> = {
        identity_document: "Identity document",
        driving_license: "Driving licence",
        chauffeur_card: "Chauffeurskaart",
        taxi_diploma: "Taxi diploma",
        vog: "VOG",
        medical_certificate: "Medical certificate",
        residence_permit: "Residence permit",
        work_authorization: "Work authorization",
        employment_contract: "Employment contract",
        other: "Other document"
    };

    return documentLabels[documentTypeValue] || documentTypeValue.replaceAll("_", " ");
}

/* Formats an ISO date/time for the Admin UI. */
function formatDateTime(value: string | null) {
    if (!value) { return "---"; }

    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(new Date(value));
}

/* Displays chauffeur verification and uploaded compliance documents. */
export default function AdminChauffeurCompliancePanel({
    compliance,
    documents
}: AdminChauffeurCompliancePanelProps) {

    return (
        <section className={`${formStyles.sectionCardBorder4} mt-8`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-white">
                        Chauffeur compliance
                    </h2>

                    <p className="mt-1 text-sm text-slate-400">
                        Review chauffeur qualification information and uploaded documents.
                    </p>
                </div>

                <div className="text-end">
                    <p className="text-xs text-slate-400">Verification status</p>
                    <p className="mt-1 font-semibold text-yellow-300">
                        {compliance?.verification_status || "pending_verification"}
                    </p>
                </div>
            </div>

            {/* Shows the most important structured compliance information. */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                    <p className="text-sm text-cyan-300">Chauffeurskaart number</p>
                    <p className="mt-1 text-slate-200">
                        {compliance?.chauffeur_card_number || "---"}
                    </p>
                </div>

                <div>
                    <p className="text-sm text-cyan-300">Chauffeurskaart valid until</p>
                    <p className="mt-1 text-slate-200">
                        {compliance?.chauffeur_card_valid_until || "---"}
                    </p>
                </div>

                <div>
                    <p className="text-sm text-cyan-300">Chauffeurskaart checked</p>
                    <p className="mt-1 text-slate-200">
                        {formatDateTime(compliance?.chauffeur_card_checked_at || null)}
                    </p>
                </div>

                <div>
                    <p className="text-sm text-cyan-300">Driving licence valid until</p>
                    <p className="mt-1 text-slate-200">
                        {compliance?.driving_license_valid_until || "---"}
                    </p>
                </div>

                <div>
                    <p className="text-sm text-cyan-300">Driving licence checked</p>
                    <p className="mt-1 text-slate-200">
                        {formatDateTime(compliance?.driving_license_checked_at || null)}
                    </p>
                </div>

                <div>
                    <p className="text-sm text-cyan-300">Verified at</p>
                    <p className="mt-1 text-slate-200">
                        {formatDateTime(compliance?.verified_at || null)}
                    </p>
                </div>
            </div>

            {compliance?.verification_status_reason && (
                <div className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3">
                    <p className="text-sm text-yellow-200">
                        Reason: {compliance.verification_status_reason}
                    </p>
                </div>
            )}

            {/* Shows uploaded private document metadata. */}
            <div className="mt-8 border-t border-cyan-400/20 pt-6">
                <h3 className="text-lg font-semibold text-white">
                    Uploaded documents
                </h3>

                {documents.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-400">
                        No compliance documents uploaded yet.
                    </p>
                ) : (
                    <div className="mt-4 grid gap-3">
                        {documents.map((document) => (
                            <div key={document.id} className="rounded-xl border border-cyan-400/20 bg-slate-950/40 p-4" >
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="font-semibold text-white">
                                            {getDocumentTypeLabel(document.document_type)}
                                        </p>

                                        <p className="mt-1 text-sm text-slate-300 break-all">
                                            {document.original_file_name}
                                        </p>

                                        <p className="mt-2 text-xs text-slate-400">
                                            Uploaded: {formatDateTime(document.uploaded_at)}
                                        </p>
                                        {/*=============================================
                                            Chauffeurskaart                  pending_review
                                            puzzle.png
                                            Uploaded: 28/08/2026 17:59
                                            [ View document ]
                                        ==================================================*/}
                                        <div className="mt-3">
                                            <AdminChauffeurDocumentViewButton
                                                chauffeurId={compliance?.chauffeur_id || ""}
                                                documentId={document.id}
                                            />
                                        </div>
                                    </div>

                                    <span className="rounded-full border border-yellow-400/30 px-3 py-1 text-xs font-semibold text-yellow-200">
                                        {document.verification_status}
                                    </span>
                                </div>

                                {document.verification_reason && (
                                    <p className="mt-3 text-sm text-red-300">
                                        Reason: {document.verification_reason}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}