import Link from "next/link";
import { notFound } from "next/navigation";
import { TranslatedText } from "@/components/TranslatedText";
import ChauffeurProfileForm from "@/components/ChauffeurProfileForm";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";

// Defines the chauffeur ID received from the dynamic URL.
type ChauffeurProfilePageProps = { params: Promise<{ chauffeurId: string }> };

// Converts the stored account status into its translation key.
function getAccountStatusTextKey(statusValue: string) {
    if (statusValue === "pending_approval") { return "statusPendingApproval"; }
    if (statusValue === "approved") { return "statusApproved"; }
    if (statusValue === "inactive") { return "statusInactive"; }
    if (statusValue === "suspended") { return "statusSuspended"; }
    return "";
}

// Loads the chauffeur information and separates read-only and editable fields.
export default async function ChauffeurProfilePage({ params }: ChauffeurProfilePageProps) {
    // Reads the chauffeur ID from the URL.
    const { chauffeurId } = await params;

    // Loads only the fields needed by this profile page.
    const { data: chauffeurRow, error } = await supabaseAdmin.from("chauffeurs").select("id, name, email, phone, service_area, account_status, accepts_pets").eq("id", chauffeurId).single();

    // Stops the page when the chauffeur record cannot be found.
    if (error || !chauffeurRow) { console.error("Could not load chauffeur profile:", error); notFound(); }

    // Prepares the translated account-status label.
    const accountStatusTextKey = getAccountStatusTextKey(chauffeurRow.account_status);

    // Displays the page introduction, read-only summary and editable form.
    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href={`/chauffeur/${chauffeurId}`} className={formStyles.link}><TranslatedText sectionName="chauffeurDashboardPage" textKey="backToDashboard" /></Link>

                <p className={pageStyles.pageLabelUpper}><TranslatedText sectionName="chauffeurDashboardPage" textKey="chauffeurLabel" /></p>
                <h1 className={pageStyles.pageTitle}><TranslatedText sectionName="chauffeurDashboardPage" textKey="editMyInformationButton" /></h1>
                <p className={pageStyles.pageDescription}><TranslatedText sectionName="chauffeurDashboardPage" textKey="editMyInformationDescription" /></p>

                {/* Shows information that only an administrator may change. */}
                <section className={`${formStyles.info} mt-8`}>
                    <h2 className="text-xl font-semibold text-white"><TranslatedText sectionName="chauffeurProfilePage" textKey="readOnlyTitle" /></h2>
                    <p className="mt-1 text-sm text-slate-400"><TranslatedText sectionName="chauffeurProfilePage" textKey="readOnlyDescription" /></p>

                    {/* Shows protected account information and its related change-request action. */}
                    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <span className={formStyles.formInputInfoCaption}><TranslatedText sectionName="chauffeurProfilePage" textKey="nameLabel" />: </span>
                            <span className={formStyles.formInputInfoValue}>{chauffeurRow.name}</span>
                        </div>
                        <div>
                            <span className={formStyles.formInputInfoCaption}><TranslatedText sectionName="chauffeurProfilePage" textKey="emailLabel" />: </span> 
                            <span className={`${formStyles.formInputInfoValue} technical-value`}>{chauffeurRow.email}</span>
                        </div>
                        <div>
                            <span className={formStyles.formInputInfoCaption}><TranslatedText sectionName="chauffeurProfilePage" textKey="statusLabel" />: </span>
                            <span className={formStyles.formInputInfoValue}>{accountStatusTextKey ? <TranslatedText sectionName="chauffeurDashboardPage" textKey={accountStatusTextKey} /> : chauffeurRow.account_status}</span>
                        </div>

                        {/* Opens the request page for administrator-controlled information. */}
                        <div className="flex items-end lg:justify-end">
                            <Link href={`/chauffeur/${chauffeurId}/change-request`} className={formStyles.primaryButtonOutside}><TranslatedText sectionName="chauffeurProfilePage" textKey="requestChangeButton" /></Link>
                        </div>
                    </div>
                </section>

                {/* Allows updates only to phone, service area and pet acceptance. */}
                <ChauffeurProfileForm chauffeur={chauffeurRow} />
            </div>
        </main>
    );
}