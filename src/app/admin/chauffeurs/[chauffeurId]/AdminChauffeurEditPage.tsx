import Link from "next/link";
import { notFound } from "next/navigation";
import AdminChauffeurEditForm from "@/components/AdminChauffeurEditForm";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";

export const dynamic = "force-dynamic";

type AdminChauffeurEditPageProps = {
  params: Promise<{
    chauffeurId: string;
  }>;
};

export default async function AdminChauffeurEditPage({
  params,
}: AdminChauffeurEditPageProps) {
  const { chauffeurId } = await params;

  const { data: chauffeurRow, error } = await supabaseAdmin
    .from("chauffeurs")
    .select("id, name, email, phone, service_area, account_status")
    .eq("id", chauffeurId)
    .single();

  if (error || !chauffeurRow) {
    notFound();
  }

  const { data: accountStatuses, error: statusError } = await supabaseAdmin.rpc(
    "get_enum_values",
    { p_enum_type_name: "chauffeur_account_status" }
  );

  if (statusError) {
    console.error("Could not load chauffeur account statuses:", statusError);
  }

  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.containerMedium}>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin/chauffeurs" className={formStyles.link}>
            ← Back to admin chauffeurs
          </Link>

          <Link href={`/chauffeur/${chauffeurId}`} className={formStyles.link}>
            View chauffeur dashboard
          </Link>
        </div>

        <p className={pageStyles.pageLabelUpper}>Admin</p>
        <h1 className={pageStyles.pageTitle}>Edit chauffeur details</h1>
        <p className={pageStyles.pageDescription}>
          Update chauffeur contact details and account status.
        </p>

        <AdminChauffeurEditForm
          chauffeur={chauffeurRow}
          accountStatusOptions={(accountStatuses ?? []) as string[]}
        />
      </div>
    </main>
  );
}