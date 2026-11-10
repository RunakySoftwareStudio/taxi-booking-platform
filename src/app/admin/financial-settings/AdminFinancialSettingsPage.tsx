import Link from "next/link";
import { pageStyles, formStyles } from "@/styles/classNames";

/*
    AdminFinancialSettingsPage

    Displays the financial management sections for Voya Taxi.
    Settings and database operations will be added separately.
*/
export default function AdminFinancialSettingsPage() {

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                <Link href="/admin" className={formStyles.link}> ← Back to Admin Dashboard</Link>
                <h1 className="mt-6 text-2xl font-bold text-white"> Financial Settings</h1>
                <p className="mt-2 text-slate-300"> Manage Voya Taxi service fees, discounts, and surcharges.</p>

                {/* Chauffeur service compensation */}
                <section className="mt-8 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white"> Chauffeur Service Compensation</h2>
                    <p className="mt-2 text-slate-300">Configure the percentage charged to chauffeurs for using the Voya Taxi booking platform.</p>
                    {/* Navigate to service-fee rate management. */}
                    <Link href="/admin/financial-settings/service-fees"
                        className="mt-4 inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500">
                        Manage Service Fee Rates
                    </Link>
                </section>

                {/* Client discounts and surcharges */}
                <section className="mt-6 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">
                        Client Discounts &amp; Surcharges
                    </h2>
                    <p className="mt-2 text-slate-300">
                        Configure discounts and additional charges for clients.
                    </p>
                    {/* Navigate to reusable client discount and surcharge definitions. */}
                    <Link href="/admin/financial-settings/client-adjustments"
                        className="mt-4 inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500">
                        Manage Client Discounts &amp; Surcharges
                    </Link>
                </section>

                {/* Chauffeur discounts and surcharges */}
                <section className="mt-6 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">
                        Chauffeur Discounts &amp; Surcharges
                    </h2>
                    <p className="mt-2 text-slate-300">
                        Configure adjustments to chauffeur service fees.
                    </p>
                    <p className="mt-4 text-sm text-slate-400">
                        No adjustments configured.
                    </p>
                </section>

                {/* Chauffeur invoicing and commission management. */}
                <section className="mt-6 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">Chauffeur Invoices</h2>
                    <p className="mt-2 text-slate-300">
                        Manage completed journey commissions, generate chauffeur invoices, and review historical billing records.
                    </p>

                    {/* Navigation to commission and invoice management. */}
                    <div className="mt-4 flex flex-wrap gap-3">
                        <Link href="/admin/financial-settings/commissions"
                            className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500">
                            Manage Commissions
                        </Link>
                        <Link href="/admin/financial-settings/invoices"
                            className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500">
                            Manage Invoices
                        </Link>
                    </div>
                </section>

                {/* Payment settings and chauffeur invoice payments */}
                <section className="mt-6 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">Payment Management</h2>
                    <p className="mt-2 text-slate-300">
                        Manage Voya Taxi bank details, payment terms, chauffeur invoice payments,
                        and outstanding balances.
                    </p>

                    {/* Navigate to Voya Taxi's invoice sender and payment settings. */}
                    <Link href="/admin/financial-settings/platform-invoice-settings"
                        className="mt-4 inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500">
                        Manage Platform Invoice Settings
                    </Link>
                </section>
            </div>
        </main>
    );
}