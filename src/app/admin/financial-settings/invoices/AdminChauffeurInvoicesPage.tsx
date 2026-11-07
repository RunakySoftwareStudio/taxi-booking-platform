import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, formStyles } from "@/styles/classNames";
/*
    Admin Chauffeur Invoice Overview

    Displays existing monthly chauffeur invoices.
    This page is read-only; it never creates or issues invoices.
*/
export default async function AdminChauffeurInvoicesPage() {
    await requireAdminUser();

    /* Retrieve invoice headers, newest billing months first. */
    const { data: invoices, error } = await supabaseAdmin
        .from("chauffeur_invoices")
        .select(`
            id,
            invoice_number,
            chauffeur_id,
            billing_month,
            status,
            currency_code,
            subtotal_excluding_vat,
            vat_amount,
            total_including_vat,
            issued_at
        `)
        .order("billing_month", { ascending: false });

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                {/* Navigation and page heading. */}
                <Link href="/admin/financial-settings" className={formStyles.link}>← Back to Financial Settings</Link>
                <h1 className="mt-6 text-2xl font-bold text-white">Chauffeur Invoices</h1>
                <p className="mt-2 text-slate-300">Review monthly service-fee invoices issued to individual chauffeurs.</p>

                {/* Read-only invoice overview. */}
                <section className="mt-8 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">Invoice Overview</h2>
                    <div className="mt-4 overflow-x-auto">
                        {error 
                            ? (<p className="text-sm text-red-300">Unable to load chauffeur invoices.</p>) 
                            : !invoices?.length 
                                ? (<p className="text-sm text-slate-400">No chauffeur invoices have been created yet.</p>) 
                                : (
                                    <table className="w-full text-left text-sm">
                                        <thead className="border-b border-slate-700 text-slate-300">
                                            <tr>
                                                <th className="px-3 py-3">Invoice</th>
                                                <th className="px-3 py-3">Chauffeur</th>
                                                <th className="px-3 py-3">Billing Month</th>
                                                <th className="px-3 py-3">Status</th>
                                                <th className="px-3 py-3 text-right">Excl. VAT</th>
                                                <th className="px-3 py-3 text-right">VAT</th>
                                                <th className="px-3 py-3 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoices.map((invoice) => (
                                                <tr key={invoice.id} className="border-b border-slate-800 text-slate-200">
                                                    <td className="px-3 py-3">{invoice.invoice_number ?? "Draft"}</td>
                                                    <td className="px-3 py-3">{invoice.chauffeur_id.slice(0, 8)}</td>
                                                    <td className="px-3 py-3">{invoice.billing_month}</td>
                                                    <td className="px-3 py-3 capitalize">{invoice.status}</td>
                                                    <td className="px-3 py-3 text-right">{invoice.subtotal_excluding_vat}</td>
                                                    <td className="px-3 py-3 text-right">{invoice.vat_amount}</td>
                                                    <td className="px-3 py-3 text-right font-semibold">{invoice.total_including_vat}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )
                        }
                    </div>
                </section>
            </div>
        </main>
    );
}