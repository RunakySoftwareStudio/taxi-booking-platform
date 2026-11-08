import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, formStyles } from "@/styles/classNames";
import CreateDraftInvoiceButton from "./CreateDraftInvoiceButton";
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
        .select(`id, invoice_number, chauffeur_id, billing_month, status, currency_code,
            subtotal_excluding_vat, vat_amount, total_including_vat, issued_at`)
        .order("billing_month", { ascending: false });

        /* Retrieve frozen commissions for monthly invoice preparation. */
        const { data: frozenCommissions, error: commissionsError } = await supabaseAdmin
            .from("chauffeur_booking_commissions")
            .select(` id, chauffeur_id, completed_at, commission_amount, currency_code, chauffeur_invoice_items (id)`)
            .order("completed_at", { ascending: false });

        if (commissionsError) {
            console.error("Unable to load frozen commissions:", commissionsError);
        }

        /* Build a stable YYYY-MM billing-month key in Amsterdam time. */
        const amsterdamMonthFormatter = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Amsterdam",
            year: "numeric",
            month: "2-digit",
        });

        const getAmsterdamMonth = (date: Date) => {
            const parts = amsterdamMonthFormatter.formatToParts(date);
            const year = parts.find((part) => part.type === "year")?.value;
            const month = parts.find((part) => part.type === "month")?.value;

            if (!year || !month) throw new Error("Unable to determine billing month.");

            return `${year}-${month}`;
        };

        const currentMonth = getAmsterdamMonth(new Date());

        const invoiceCandidates = new Map<string, {
            chauffeurId: string;
            billingMonth: string;
            currencyCode: string;
            commissionCount: number;
            commissionTotal: number;
        }>();

        for (const commission of frozenCommissions ?? []) {
            /* Exclude commissions already attached to an invoice. */
            if (commission.chauffeur_invoice_items?.length) continue;

            const billingMonth = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit",
            }).format(new Date(commission.completed_at));

            const monthStart = `${billingMonth}-01`;
            if (billingMonth >= currentMonth) continue;

            const key = `${commission.chauffeur_id}:${monthStart}`;
            const existing = invoiceCandidates.get(key);

            if (existing) {
                existing.commissionCount++;
                existing.commissionTotal += Number(commission.commission_amount);
                if (existing.currencyCode !== commission.currency_code) {
                    existing.currencyCode = "MIXED";
                }
            } else {
                invoiceCandidates.set(key, {
                    chauffeurId: commission.chauffeur_id,
                    billingMonth: monthStart,
                    currencyCode: commission.currency_code,
                    commissionCount: 1,
                    commissionTotal: Number(commission.commission_amount),
                });
            }
        }

        /* Exclude chauffeur/month combinations already represented by an invoice. */
        for (const invoice of invoices ?? []) {
            const key = `${invoice.chauffeur_id}:${invoice.billing_month}`;
            invoiceCandidates.delete(key);
        }
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
                                                    {/* Navigate to the read-only invoice details page. */}
                                                    <td className="px-3 py-3">
                                                        <Link href={`/admin/financial-settings/invoices/${invoice.id}`} className={formStyles.link}>
                                                            {invoice.invoice_number ?? "Draft"}
                                                        </Link>
                                                    </td>
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

                {/* Read-only monthly invoice candidates. */}
                <section className="mt-6 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">Available Invoice Candidates</h2>
                    <p className="mt-2 text-sm text-slate-300">
                        Completed billing months with frozen commissions and no existing invoice.
                    </p>

                    <div className="mt-4 overflow-x-auto">
                        {error || commissionsError
                            ? (<p className="text-sm text-red-300">Unable to determine invoice candidates.</p>)
                            : invoiceCandidates.size === 0
                                ? (<p className="text-sm text-slate-400">No invoice candidates available.</p>)
                                : (
                                    <table className="w-full text-left text-sm">
                                        <thead className="border-b border-slate-700 text-slate-300">
                                            <tr>
                                                <th className="px-3 py-3">Chauffeur</th>
                                                <th className="px-3 py-3">Billing Month</th>
                                                <th className="px-3 py-3 text-right">Commissions</th>
                                                <th className="px-3 py-3 text-right">Subtotal Excl. VAT</th>
                                                <th className="px-3 py-3">Eligibility</th>
                                                <th className="px-3 py-3">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from(invoiceCandidates.values()).map((candidate) => (
                                                <tr key={`${candidate.chauffeurId}:${candidate.billingMonth}`}
                                                    className="border-b border-slate-800 text-slate-200">
                                                    <td className="px-3 py-3">{candidate.chauffeurId.slice(0, 8)}</td>
                                                    <td className="px-3 py-3">{candidate.billingMonth}</td>
                                                    <td className="px-3 py-3 text-right">{candidate.commissionCount}</td>
                                                    <td className="px-3 py-3 text-right">
                                                        {candidate.currencyCode === "MIXED"
                                                            ? "Multiple currencies"
                                                            : `${candidate.currencyCode} ${candidate.commissionTotal.toFixed(2)}`}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {candidate.currencyCode === "MIXED"
                                                            ? <span className="text-amber-400">Blocked: mixed currencies</span>
                                                            : <span className="text-green-400">Potential candidate</span>}
                                                    </td>
                                                    {/* Draft creation remains disabled until validation. */}
                                                    <td className="px-3 py-3">
                                                        {candidate.currencyCode === "MIXED"
                                                            ? (<span className="text-slate-500">—</span>)
                                                            : (<CreateDraftInvoiceButton chauffeurId={candidate.chauffeurId} billingMonth={candidate.billingMonth}/>)}
                                                    </td>
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