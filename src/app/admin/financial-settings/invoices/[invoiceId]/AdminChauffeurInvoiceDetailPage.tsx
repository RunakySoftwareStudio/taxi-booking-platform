import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, formStyles } from "@/styles/classNames";
import InvoiceVatSelector from "./InvoiceVatSelector";

/*
    Admin Chauffeur Invoice Details

    Displays a single chauffeur invoice.
    Read-only: no invoice creation, editing or issuance.
*/
export default async function AdminChauffeurInvoiceDetailPage({
    params,
}: {
    params: Promise<{ invoiceId: string }>;
}) {
    await requireAdminUser();

    const { invoiceId } = await params;

    /* Retrieve the selected invoice header. */
    const { data: invoice, error } = await supabaseAdmin
        .from("chauffeur_invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();

    if (error) {throw new Error("Unable to load chauffeur invoice.");}
    if (!invoice) {notFound();}

    /* Retrieve frozen invoice lines belonging to this invoice. */
    const { data: invoiceItems, error: itemsError } = await supabaseAdmin
        .from("chauffeur_invoice_items")
        .select(` id, description, amount_excluding_vat, vat_percentage, vat_amount, total_including_vat `)
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true });

    if (itemsError) {throw new Error("Unable to load chauffeur invoice items.");}

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                {/* Navigation and invoice heading. */}
                <Link href="/admin/financial-settings/invoices" className={formStyles.link}>
                    ← Back to Chauffeur Invoices
                </Link>
                <h1 className="mt-6 text-2xl font-bold text-white">
                    Invoice {invoice.invoice_number ?? "Draft"}
                </h1>
                <p className="mt-2 text-slate-300">
                    Billing month: {invoice.billing_month}
                </p>

                {/* Read-only invoice status and financial totals. */}
                <section className="mt-8 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">Invoice Details</h2>

                    <div className="mt-4 space-y-3 text-sm text-slate-300">
                        <p>Status: <span className="capitalize">{invoice.status}</span></p>
                        <p>Subtotal excluding VAT: {invoice.currency_code} {invoice.subtotal_excluding_vat}</p>
                        <p>VAT rate: {invoice.vat_percentage ?? "Not selected"}{invoice.vat_percentage == null ? "" : "%"}</p>

                        {/* VAT selection is available only for draft invoices. */}
                        {invoice.status === "draft" && (
                            <InvoiceVatSelector invoiceId={invoice.id} currentVatPercentage={invoice.vat_percentage}/>
                        )}
                        <p>VAT amount: {invoice.currency_code} {invoice.vat_amount}</p>
                        <p className="border-t border-slate-700 pt-3 font-semibold text-white">
                            Total including VAT: {invoice.currency_code} {invoice.total_including_vat}
                        </p>
                    </div>
                </section>
                {/* Recipient information stored on the invoice. */}
                <section className="mt-6 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">Invoice Recipient</h2>

                    <div className="mt-4 space-y-3 text-sm text-slate-300">
                        <p>Name: {invoice.recipient_name ?? "Not finalized"}</p>
                        <p>Email: {invoice.recipient_email ?? "Not finalized"}</p>
                        <div>
                            <p>Address:</p>
                            <p className="mt-1 whitespace-pre-line">
                                {invoice.recipient_address ?? "Not finalized"}
                            </p>
                        </div>
                    </div>
                </section>
                {/* Read-only frozen invoice commission lines. */}
                <section className="mt-6 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">Invoice Items</h2>

                    <div className="mt-4 overflow-x-auto">
                        {!invoiceItems?.length
                        ? (<p className="text-sm text-slate-400">No invoice items found.</p>)
                        : (
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-slate-700 text-slate-300">
                                    <tr>
                                        <th className="px-3 py-3">Description</th>
                                        <th className="px-3 py-3 text-right">Excl. VAT</th>
                                        <th className="px-3 py-3 text-right">VAT %</th>
                                        <th className="px-3 py-3 text-right">VAT</th>
                                        <th className="px-3 py-3 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoiceItems.map((item) => (
                                        <tr key={item.id} className="border-b border-slate-800 text-slate-200">
                                            <td className="px-3 py-3">{item.description}</td>
                                            <td className="px-3 py-3 text-right">{invoice.currency_code} {item.amount_excluding_vat}</td>
                                            <td className="px-3 py-3 text-right">{item.vat_percentage}%</td>
                                            <td className="px-3 py-3 text-right">{invoice.currency_code} {item.vat_amount}</td>
                                            <td className="px-3 py-3 text-right font-semibold">{invoice.currency_code} {item.total_including_vat}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}