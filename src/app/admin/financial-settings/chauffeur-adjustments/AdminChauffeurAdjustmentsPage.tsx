/* ============================================================
   VOYA TAXI — ADMIN CHAUFFEUR ADJUSTMENTS

   Load reusable chauffeur discounts and surcharges.
   These adjustments will apply to chauffeur service fees,
   not passenger booking prices.
============================================================ */

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseServer";
import ChauffeurAdjustmentsManager, { type ChauffeurAdjustment } from "./ChauffeurAdjustmentsManager";

export default async function AdminChauffeurAdjustmentsPage() {
    /* SECTION 1: Load adjustment definitions from Supabase. */
    const { data: adjustments, error } = await supabaseAdmin
        .from("chauffeur_adjustment_definitions")
        .select("id, name, description, adjustment_type, value_type, value, currency_code, effective_from, effective_until, is_active")
        .order("effective_from", { ascending: false });

    if (error) console.error("Could not load chauffeur adjustments:", error);

    /* SECTION 2: Display the management page. */
    return (
        <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
            <div className="mx-auto max-w-6xl">
                <Link href="/admin/financial-settings" className="text-sm text-cyan-400 hover:text-cyan-300">
                    ← Back to Financial Settings
                </Link>

                <h1 className="mt-6 text-3xl font-bold">Chauffeur Discounts &amp; Surcharges</h1>
                <p className="mt-3 text-slate-300">
                    Manage reusable adjustments to chauffeur service fees.
                </p>

                {/* Display loading errors or the chauffeur adjustments manager. */}
                {error ? (
                    <p role="alert" className="mt-6 text-sm text-red-300">
                        Could not load chauffeur adjustment definitions.
                    </p>
                ) : (
                    <ChauffeurAdjustmentsManager adjustments={(adjustments ?? []) as ChauffeurAdjustment[]} />
                )}
            </div>
        </main>
    );
}