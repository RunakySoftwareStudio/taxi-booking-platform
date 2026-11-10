
import Link from "next/link";
import { pageStyles, formStyles } from "@/styles/classNames";
import { supabaseAdmin } from "@/lib/supabaseServer";
import ClientAdjustmentsManager from "./ClientAdjustmentsManager";

/* ============================================================
   VOYA TAXI — ADMIN CLIENT ADJUSTMENTS

   Load reusable adjustment definitions and provide the
   shared Create/Edit management interface.
============================================================ */

export default async function AdminClientAdjustmentsPage() {
    /* SECTION 1: Load adjustment definitions, newest first. */
    const { data: adjustments, error: adjustmentsError } = await supabaseAdmin
        .from("client_adjustment_definitions")
        .select("id, name, description, adjustment_type, value_type, value, currency_code, effective_from, effective_until, is_active")
        .order("created_at", { ascending: false });

    if (adjustmentsError) console.error("Could not load client adjustments:", adjustmentsError);

    /* SECTION 2: Normalize database values for the shared manager. */
    const adjustmentRows = (adjustments ?? []).map((item) => ({
        id: item.id, name: item.name, description: item.description,
        adjustment_type: item.adjustment_type as "discount" | "surcharge",
        value_type: item.value_type as "percentage" | "fixed",
        value: Number(item.value), currency_code: item.currency_code,
        effective_from: item.effective_from ?? "",
        effective_until: item.effective_until, is_active: item.is_active
    }));

    /* SECTION 3: Render the shared Create/Edit interface. */
    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                <Link href="/admin/financial-settings" className={formStyles.link}>← Back to Financial Settings</Link>
                <h1 className="mt-6 text-2xl font-bold text-white">Client Discounts &amp; Surcharges</h1>
                <p className="mt-2 text-slate-300">Create and manage reusable discounts and additional charges for clients.</p>

                {adjustmentsError ? (
                    <p className="mt-8 text-sm text-red-300">Unable to load client adjustments.</p>
                ) : (
                    <ClientAdjustmentsManager adjustments={adjustmentRows} />
                )}
            </div>
        </main>
    );
}
