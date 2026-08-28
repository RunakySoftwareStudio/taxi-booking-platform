import Link from "next/link";
import { notFound } from "next/navigation";
import AdminChauffeurEditForm from "@/components/AdminChauffeurEditForm";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";
import { TranslatedText } from "@/components/TranslatedText";
import AdminChauffeurCompliancePanel from "@/components/AdminChauffeurCompliancePanel";

export const dynamic = "force-dynamic";

type AdminChauffeurEditPageProps = { params: Promise<{  chauffeurId: string; }>;};

export default async function AdminChauffeurEditPage({ params}: AdminChauffeurEditPageProps) {
  const { chauffeurId } = await params;

  const { data: chauffeurRow, error } = await supabaseAdmin
    .from("chauffeurs")
    .select('id, name, email, phone, operator_id, service_area, account_status, accepts_pets, operational_status, status_reason, status_changed_at')
    .eq("id", chauffeurId)
    .maybeSingle();

  /* ===== Handle chauffeur lookup result ===== */
  if (error) {
      console.error("Could not load chauffeur for admin edit:", {
          chauffeurId,
          error,
      });

      throw new Error("Could not load chauffeur for admin edit.");
  }

  if (!chauffeurRow) { notFound(); }


  const { data: accountStatuses, error: statusError } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "chauffeur_account_status" });
  if (statusError) { console.error("Could not load chauffeur account statuses:", statusError); }

  /* ===== Load taxi operators for chauffeur assignment ===== */
  const { data: taxiOperators, error: operatorsError } = await supabaseAdmin
    .from("taxi_operators")
    .select("id, company_name, verification_status")
    .order("company_name", { ascending: true });

  if (operatorsError) {console.error("Could not load taxi operators:", operatorsError);}

  /* ===== Load chauffeur compliance information ===== */
  const { data: complianceRow, error: complianceError } = await supabaseAdmin
    .from("chauffeur_compliance")
    .select(`
      chauffeur_id,
      driving_license_valid_until,
      driving_license_checked_at,
      chauffeur_card_number,
      chauffeur_card_valid_until,
      chauffeur_card_checked_at,
      verification_status,
      verification_status_reason,
      verification_status_changed_at,
      verified_at
    `)
    .eq("chauffeur_id", chauffeurId)
    .maybeSingle();

  if (complianceError) {
    console.error("Could not load chauffeur compliance:", complianceError);
    throw new Error("Could not load chauffeur compliance.");
  }

  /* ===== Load uploaded chauffeur compliance documents ===== */
  const { data: chauffeurDocuments, error: documentsError } = await supabaseAdmin
    .from("chauffeur_documents")
    .select(`
      id,
      document_type,
      original_file_name,
      mime_type,
      file_size_bytes,
      valid_from,
      valid_until,
      verification_status,
      verification_reason,
      verification_status_changed_at,
      verified_at,
      uploaded_at
    `)
    .eq("chauffeur_id", chauffeurId)
    .order("uploaded_at", { ascending: false });

  if (documentsError) {
    console.error("Could not load chauffeur documents:", documentsError);
    throw new Error("Could not load chauffeur documents.");
  }

  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.containerMedium}>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin/chauffeurs" className={formStyles.link}>
            <TranslatedText sectionName="adminChauffeurEditPage" textKey="backToAdminChauffeurs" />
          </Link>

          <Link href={`/chauffeur/${chauffeurId}`} className={formStyles.link}>
            <TranslatedText sectionName="adminChauffeurEditPage" textKey="viewChauffeurDashboard" />
          </Link>
        </div>

        <p className={pageStyles.pageLabelUpper}> <TranslatedText sectionName="adminChauffeurEditPage" textKey="adminLabel" /> </p>
        <h1 className={pageStyles.pageTitle}> <TranslatedText sectionName="adminChauffeurEditPage" textKey="title" /> </h1>
        <p className={pageStyles.pageDescription}> <TranslatedText sectionName="adminChauffeurEditPage" textKey="description" /> </p>

        {/* chauffeur Reference */}
        <div className="mt-6 rounded-2xl border border-cyan-400/30 bg-slate-900/70 p-4">
          <p className="text-sm font-semibold text-cyan-300"> <TranslatedText sectionName="adminChauffeurEditPage" textKey="chauffeurReferenceTitle" /> </p>
          <p className="mt-2 break-all font-mono text-sm text-slate-200"> {chauffeurRow.id} </p>
          <p className="mt-2 text-xs text-slate-400"> <TranslatedText sectionName="adminChauffeurEditPage" textKey="chauffeurReferenceDescription" /> </p>
        </div>
        
        {/* Chauffeur details/edit form. */}
        <AdminChauffeurEditForm
          chauffeur={chauffeurRow}
          accountStatusOptions={(accountStatuses ?? []) as string[]}
          taxiOperatorOptions={taxiOperators ?? []}
        />

        {/* Shows chauffeur verification and uploaded compliance documents. */}
        <AdminChauffeurCompliancePanel
          compliance={complianceRow}
          documents={chauffeurDocuments ?? []}
        />
      </div>
    </main>
  );
}