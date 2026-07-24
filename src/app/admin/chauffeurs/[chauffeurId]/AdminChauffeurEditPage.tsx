import Link from "next/link";
import { notFound } from "next/navigation";
import AdminChauffeurEditForm from "@/components/AdminChauffeurEditForm";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";
import { TranslatedText } from "@/components/TranslatedText";

export const dynamic = "force-dynamic";

type AdminChauffeurEditPageProps = { params: Promise<{  chauffeurId: string; }>;};

export default async function AdminChauffeurEditPage({ params}: AdminChauffeurEditPageProps) {
  const { chauffeurId } = await params;

  const { data: chauffeurRow, error } = await supabaseAdmin
    .from("chauffeurs")
    .select('id, name, email, phone, service_area, account_status, accepts_pets ,operational_status, status_reason, status_changed_at')
    .eq("id", chauffeurId)
    .single();

  if (error || !chauffeurRow) {  notFound(); }

  const { data: accountStatuses, error: statusError } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "chauffeur_account_status" });
  if (statusError) { console.error("Could not load chauffeur account statuses:", statusError); }

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

        <AdminChauffeurEditForm chauffeur={chauffeurRow} accountStatusOptions={(accountStatuses ?? []) as string[]} />
      </div>
    </main>
  );
}