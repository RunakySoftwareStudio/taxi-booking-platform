import { Fragment } from "react";
import Link from "next/link";
import ChauffeurChangeRequestForm from "@/components/ChauffeurChangeRequestForm";
import { TranslatedText } from "@/components/TranslatedText";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formatShortDate } from "@/lib/formatDateTime";
import { formStyles, pageStyles, tableStyles, mobileStyle } from "@/styles/classNames";


// Defines the chauffeur ID received from the dynamic URL.
type ChauffeurChangeRequestPageProps = { params: Promise<{ chauffeurId: string }> };

// Defines one stored chauffeur change request.
type ChangeRequestRow = { id: string; field_name: string; current_value: string | null; requested_value: string; reason: string | null; status: string; admin_note: string | null; created_at: string };

// Converts a stored field name into its visible translation key.
function getFieldTextKey(fieldValue: string) {
    if (fieldValue === "name") { return "fieldName"; }
    if (fieldValue === "email") { return "fieldEmail"; }
    if (fieldValue === "company_name") { return "fieldCompanyName"; }
    if (fieldValue === "license_number") { return "fieldLicenseNumber"; }
    return "";
}

// Converts a stored request status into its visible translation key.
function getRequestStatusTextKey(statusValue: string) {
    if (statusValue === "pending") { return "statusPending"; }
    if (statusValue === "approved") { return "statusApproved"; }
    if (statusValue === "rejected") { return "statusRejected"; }
    return "";
}

// Gives each request status a readable colour.
function getRequestStatusClass(statusValue: string) {
    if (statusValue === "approved") { return "font-semibold text-green-300"; }
    if (statusValue === "rejected") { return "font-semibold text-red-300"; }
    return "font-semibold text-yellow-300";
}

// Shows the protected request form and this chauffeur's request history.
export default async function ChauffeurChangeRequestPage({ params }: ChauffeurChangeRequestPageProps) {
    // Reads the chauffeur ID from the protected URL.
    const { chauffeurId } = await params;

    // Loads only requests belonging to this chauffeur.
    const { data, error } = await supabaseAdmin.from("chauffeur_change_requests").select("id, field_name, current_value, requested_value, reason, status, admin_note, created_at").eq("chauffeur_id", chauffeurId).order("created_at", { ascending: false });

    // Logs database errors while keeping the page usable.
    if (error) { console.error("Could not load chauffeur change requests:", error); }

    const requestRows = (data ?? []) as ChangeRequestRow[];

    // Displays the translated request page, form and history.
    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href={`/chauffeur/${chauffeurId}/profile`} className={formStyles.link}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="backToProfile" /></Link>

                <p className={pageStyles.pageLabelUpper}><TranslatedText sectionName="chauffeurDashboardPage" textKey="chauffeurLabel" /></p>
                <h1 className={pageStyles.pageTitle}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="title" /></h1>
                <p className={pageStyles.pageDescription}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="description" /></p>

                {/* Submits a new administrator-controlled information request. */}
                <ChauffeurChangeRequestForm chauffeurId={chauffeurId} />

{/* Shows all requests using mobile cards and a consistent desktop table. */}
            <section className="mt-10">
                <h2 className={tableStyles.headerTableSmall}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="requestHistoryTitle" /> ({requestRows.length})</h2>

                {/* Mobile request cards */}
                <div className="mt-6 grid gap-4 lg:hidden">
                    {requestRows.map((requestRow) => {
                        const fieldTextKey = getFieldTextKey(requestRow.field_name);
                        const statusTextKey = getRequestStatusTextKey(requestRow.status);

                        return (
                            <article key={requestRow.id} className={mobileStyle.article}>
                                {/* Shows the main request information. */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div><p className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="fieldLabel" /></p><p className={mobileStyle.infoValue}>{fieldTextKey ? <TranslatedText sectionName="chauffeurChangeRequestPage" textKey={fieldTextKey} /> : requestRow.field_name}</p></div>
                                    <div><p className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="requestStatusLabel" /></p><p className={getRequestStatusClass(requestRow.status)}>{statusTextKey ? <TranslatedText sectionName="chauffeurChangeRequestPage" textKey={statusTextKey} /> : requestRow.status}</p></div>
                                    <div><p className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="currentValueLabel" /></p><p className={mobileStyle.infoValue} dir="auto">{requestRow.current_value || "—"}</p></div>
                                    <div><p className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="requestedValueHistoryLabel" /></p><p className={mobileStyle.infoValue} dir="auto">{requestRow.requested_value}</p></div>
                                    <div><p className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="requestDateLabel" /></p><p className={mobileStyle.infoValue} dir="ltr">{formatShortDate(requestRow.created_at.slice(0, 10))}</p></div>
                                </div>

                                {/* Shows the chauffeur's reason on its own row. */}
                                <div className="mt-4 border-t border-white/10 pt-4">
                                    <p className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="reasonLabel" /></p>
                                    <p className={mobileStyle.infoValue}>{requestRow.reason || "—"}</p>
                                </div>

                                {/* Shows the administrator's explanation separately. */}
                                <div className="mt-4 border-t border-cyan-400/30 pt-4">
                                    <p className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="adminNoteLabel" /></p>
                                    <p className={mobileStyle.infoValue}>{requestRow.admin_note || "—"}</p>
                                </div>
                            </article>
                        );
                    })}

                    {requestRows.length === 0 && <div className={tableStyles.cellEmpty}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="noRequestsMessage" /></div>}
                </div>

                {/* Desktop request table */}
                <div className={`${tableStyles.tableDiv} hidden lg:block`}>
                    <table className={tableStyles.table1000}>
                        <thead className={tableStyles.tableHeaderCyan}>
                            <tr>
                                <th className={tableStyles.cellCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="fieldLabel" /></th>
                                <th className={tableStyles.cellCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="currentValueLabel" /></th>
                                <th className={tableStyles.cellCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="requestedValueHistoryLabel" /></th>
                                <th className={tableStyles.cellCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="requestStatusLabel" /></th>
                                <th className={tableStyles.cellCaption}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="requestDateLabel" /></th>
                            </tr>
                        </thead>

                        <tbody>
                            {requestRows.map((requestRow) => {
                                const fieldTextKey = getFieldTextKey(requestRow.field_name);
                                const statusTextKey = getRequestStatusTextKey(requestRow.status);

                                return (
                                    <Fragment key={requestRow.id}>
                                        {/* Main request information uses a subtle internal divider, not the final cyan separator. */}
                                        <tr className="border-b border-white/10 bg-slate-950/30">
                                            {/* Shows which protected information the chauffeur wants changed. */}
                                            <td className={tableStyles.cell}>
                                                <span className="font-semibold"><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="changeLabel" />: </span>
                                                {fieldTextKey ? <TranslatedText sectionName="chauffeurChangeRequestPage" textKey={fieldTextKey} /> : requestRow.field_name}
                                            </td>
                                            <td className={tableStyles.cell} dir="auto">{requestRow.current_value || "—"}</td>
                                            <td className={tableStyles.cell} dir="auto">{requestRow.requested_value}</td>
                                            <td className={tableStyles.cell}><span className={getRequestStatusClass(requestRow.status)}>{statusTextKey ? <TranslatedText sectionName="chauffeurChangeRequestPage" textKey={statusTextKey} /> : requestRow.status}</span></td>
                                            <td className={tableStyles.cell} dir="ltr">{formatShortDate(requestRow.created_at.slice(0, 10))}</td>
                                        </tr>

                                        {/* Chauffeur reason row */}
                                        <tr className="border-b border-white/10 bg-slate-950/30">
                                            <td colSpan={5} className="px-4 py-3 text-sm text-slate-300">
                                                <span className="font-semibold text-cyan-300"><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="reasonLabel" />: </span>
                                                <span className="wrap-break-word">{requestRow.reason || "—"}</span>
                                            </td>
                                        </tr>

                                        {/* Administrator explanation row */}
                                        <tr className="border-b border-cyan-400/30 bg-slate-950/30">
                                            <td colSpan={5} className="px-4 py-3 text-sm text-slate-300">
                                                <span className="font-semibold text-cyan-300"><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="adminNoteLabel" />: </span>
                                                <span className="wrap-break-word">{requestRow.admin_note || "—"}</span>
                                            </td>
                                        </tr>
                                    </Fragment>
                                );
                            })}

                            {requestRows.length === 0 && <tr><td colSpan={5} className={tableStyles.cellEmpty}><TranslatedText sectionName="chauffeurChangeRequestPage" textKey="noRequestsMessage" /></td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>
            </div>
        </main>
    );
}