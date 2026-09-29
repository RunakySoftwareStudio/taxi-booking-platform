import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";
import AdminChauffeurCreateForm from "@/components/AdminChauffeurCreateForm";

/* ============================================================
   ADMIN NEW CHAUFFEUR PAGE
   Empty chauffeur form. Compliance stays disabled until the
   chauffeur is created and has a real chauffeur_id.
============================================================ */

export default async function AdminChauffeurNewPage() {
    const { data: accountStatuses, error: statusError } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "chauffeur_account_status" });
    if (statusError) { console.error("Could not load chauffeur account statuses:", statusError); }

    const { data: taxiOperators, error: operatorsError } = await supabaseAdmin
        .from("taxi_operators")
        .select("id, company_name, verification_status")
        .order("company_name", { ascending: true });

    if (operatorsError) { console.error("Could not load taxi operators:", operatorsError); }

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href="/admin/chauffeurs" className={formStyles.link}>← Back to chauffeurs</Link>

                <p className={pageStyles.pageLabelUpper}>Admin</p>
                <h1 className={pageStyles.pageTitle}>Add chauffeur</h1>
                <p className={pageStyles.pageDescription}>Enter the chauffeur details first. Compliance documents can be added after the chauffeur has been created.</p>

                {/* Creates the chauffeur, then redirects to the normal chauffeur detail page. */}
                <AdminChauffeurCreateForm  accountStatusOptions={(accountStatuses ?? []) as string[]} taxiOperatorOptions={taxiOperators ?? []} />

                {/* Compliance needs a real chauffeur_id, so it stays disabled for a new chauffeur. */}
                <section className="mt-8 rounded-2xl border border-white/10 bg-slate-900/40 p-5 opacity-60">
                    <h2 className="text-lg font-semibold text-slate-200">Chauffeur compliance</h2>
                    <p className="mt-2 text-sm text-slate-400">Save the chauffeur details first before uploading or reviewing compliance documents.</p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Compliance section disabled</p>
                </section>
            </div>
        </main>
    );
}