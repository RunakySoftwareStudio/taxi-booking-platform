
import Link from "next/link";
import {notFound} from "next/navigation";
import {requireAdminUser} from "@/lib/auth/requireAdminUser";
import {supabaseAdmin} from "@/lib/supabaseServer";
import {formStyles, pageStyles} from "@/styles/classNames";
import CopyBookingIdButton from "./CopyBookingIdButton";

/* Defines the selected chauffeur ID supplied by the dynamic route. */
type AdminChauffeurSupportPageProps = {params: Promise<{chauffeurId: string}>};

/* ============================================================
   ADMIN CHAUFFEUR SUPPORT DASHBOARD
   Central navigation for Admin-assisted chauffeur management.
   Protected by Admin authorization; no data changes here.
============================================================ */
export default async function AdminChauffeurSupportPage({params}: AdminChauffeurSupportPageProps) {
    await requireAdminUser();
    const {chauffeurId} = await params;

    /* Load the selected chauffeur's basic account information. */
    const {data: chauffeur, error} = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name, email, phone, account_status")
        .eq("id", chauffeurId)
        .maybeSingle();

    if (error) {console.error("Could not load Admin chauffeur support:", error); throw new Error("Could not load chauffeur.");}
    if (!chauffeur) {notFound();}

    const supportUrl = `/admin/chauffeurs/${chauffeurId}/support`;

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href="/admin/chauffeurs" className={formStyles.link}>← Back to chauffeurs</Link>

                <p className={pageStyles.pageLabelUpper}>Admin support mode</p>
                <h1 className={pageStyles.pageTitle}>Chauffeur: {chauffeur.name}</h1>
                <p className={pageStyles.pageDescription}>Select a section to assist this chauffeur.</p>

                {/* Account summary and chauffeur UUID for troubleshooting. */}
                <section className="mt-6 rounded-xl border border-cyan-400/30 bg-slate-900/70 p-5">
                    <h2 className="mb-4 font-semibold text-cyan-300">Account information</h2>
                    <div className="grid gap-3 text-sm text-white sm:grid-cols-2">
                        <p>Email: {chauffeur.email}</p>
                        <p>Phone: {chauffeur.phone}</p>
                        <p>Account status: {chauffeur.account_status}</p>
                        <div className="sm:col-span-2">
                            <div className="mt-1 flex flex-wrap items-center gap-3">
                                <Link href={`/admin/chauffeurs/${chauffeur.id}`} className={formStyles.link}>Open Chauffeur details</Link>
                                <span className="break-all">{chauffeur.id}</span>
                                <CopyBookingIdButton recordId={chauffeur.id} label="Copy Chauffeur UUID" />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Main navigation: reuse existing management routes wherever possible. */}
                <section className="mt-6 grid gap-4 sm:grid-cols-3">
                    <Link href={`${supportUrl}/bookings`} className="rounded-xl border border-cyan-700/60 bg-slate-900/70 p-5 hover:border-cyan-400">
                        <h2 className="font-semibold text-cyan-300">Bookings</h2>
                        <p className="mt-2 text-sm text-slate-300">View assigned bookings, filters and booking UUIDs.</p>
                    </Link>

                    <Link href={`/admin/chauffeurs/${chauffeurId}`} className="rounded-xl border border-cyan-700/60 bg-slate-900/70 p-5 hover:border-cyan-400">
                        <h2 className="font-semibold text-cyan-300">Chauffeur Details</h2>
                        <p className="mt-2 text-sm text-slate-300">View and manage chauffeur account information.</p>
                    </Link>

                    <Link href={`${supportUrl}/documents`} className="rounded-xl border border-cyan-700/60 bg-slate-900/70 p-5 hover:border-cyan-400">
                        <h2 className="font-semibold text-cyan-300">Official Documents</h2>
                        <p className="mt-2 text-sm text-slate-300">Review chauffeur documents and verification information.</p>
                    </Link>
                </section>
            </div>
        </main>
    );
}
