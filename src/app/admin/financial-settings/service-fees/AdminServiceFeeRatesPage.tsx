import Link from "next/link";
import { pageStyles, formStyles } from "@/styles/classNames";
import DefaultServiceFeeForm from "../DefaultServiceFeeForm";
import { supabaseAdmin } from "@/lib/supabaseServer";

/*
    AdminServiceFeeRatesPage
    Displays the service-fee entry form and historical rate list.
    Database retrieval and removal controls will be added next.
*/
export default async function AdminServiceFeeRatesPage() {
    // Load historical default rates, newest first.
    const { data: rates, error: ratesError } = await supabaseAdmin
        .from("financial_service_fee_rates")
        .select("id, percentage, effective_from, effective_until")
        .is("chauffeur_id", null)
        .order("effective_from", { ascending: false });

    if (ratesError) console.error("Could not load service-fee rates:", ratesError);

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                <Link href="/admin/financial-settings" className={formStyles.link}>← Back to Financial Settings</Link>

                <h1 className="mt-6 text-2xl font-bold text-white">Service Fee Rates</h1>
                <p className="mt-2 text-slate-300">Manage default chauffeur service fees and historical rates.</p>

                {/* Add new default service fee */}
                <section className="mt-8 rounded-lg border border-slate-700 p-6">
                    <DefaultServiceFeeForm />
                </section>

                {/* Historical service-fee rates */}
                <section className="mt-6 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">Service Fee History</h2>
                    {/* Historical default rates */}
                    <div className="mt-4 space-y-3">
                        {ratesError
                        ? (<p className="text-sm text-red-300">Unable to load service-fee rates.</p>)
                        : rates && rates.length > 0
                            ? ( rates.map((rate) => (
                                    <div key={rate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900 p-3">
                                        <span className="font-semibold text-white">{rate.percentage}%</span>
                                        {/* Display the database date in Dutch format without timezone conversion. */}
                                        <span className="text-sm text-slate-300">
                                            From: {rate.effective_from.split("-").reverse().join("-")}
                                        </span>
                                       <span className="text-sm text-slate-300">
                                            Until: {rate.effective_until ? rate.effective_until.split("-").reverse().join("-") : "Ongoing"}
                                        </span>
                                        {/* Removal remains disabled until commission-reference checks are implemented. */}
                                        <button type="button" disabled title="Removal protection is not yet complete"
                                            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-400 opacity-50 cursor-not-allowed">
                                            Remove
                                        </button>
                                    </div>
                                )))
                            : (<p className="text-sm text-slate-400">No service-fee rates configured.</p>)}
                    </div>
                </section>
            </div>
        </main>
    );
}