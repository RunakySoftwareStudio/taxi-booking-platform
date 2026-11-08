
import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, formStyles } from "@/styles/classNames";
import PlatformInvoiceSettingsEditor from "./PlatformInvoiceSettingsEditor";
/*
    AdminPlatformInvoiceSettingsPage

    Displays Voya Taxi business identity and invoice payment settings.
    Read-only until the protected Admin editing workflow is implemented.
*/
export default async function AdminPlatformInvoiceSettingsPage() {
    await requireAdminUser();

    /* Retrieve the singleton platform invoice settings record. */
    const { data: settings, error } = await supabaseAdmin
        .from("platform_invoice_settings")
        .select("legal_name, business_address, kvk_number, vat_number, contact_email, iban, bic, payment_terms_days")
        .eq("id", 1)
        .maybeSingle();

    if (error) console.error("Unable to load platform invoice settings:", error);

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                {/* Navigation and page heading. */}
                <Link href="/admin/financial-settings" className={formStyles.link}>← Back to Financial Settings</Link>
                <h1 className="mt-6 text-2xl font-bold text-white">Platform Invoice Settings</h1>
                <p className="mt-2 text-slate-300">Manage Voya Taxi business identity and payment details for chauffeur invoices.</p>

                {/* Current platform business and payment information. */}
                <section className="mt-8 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">Voya Taxi Business Information</h2>

                    {error || !settings 
                    ? (<p className="mt-4 text-sm text-red-300">Unable to load platform invoice settings.</p>) 
                    : (
                        <div className="mt-5 grid gap-x-8 gap-y-5 text-sm text-slate-300 md:grid-cols-2">
                            <div>
                                <span className="text-slate-400">Legal name: </span>
                                <span className="mt-1 text-white">{settings.legal_name ?? "Not configured"}</span>
                            </div>
                            <div>
                                <span className="text-slate-400">KVK number: </span>
                                <span className="mt-1 text-white">{settings.kvk_number ?? "Not configured"}</span>
                            </div>
                            <div>
                                <span className="text-slate-400">VAT number: </span>
                                <span className="mt-1 text-white">{settings.vat_number ?? "Not configured"}</span>
                            </div>
                            <div>
                                <span className="text-slate-400">Contact email: </span>
                                <span className="mt-1 text-white">{settings.contact_email ?? "Not configured"}</span>
                            </div>

                            <div>
                                <span className="text-slate-400">IBAN:  </span>
                                <span className="mt-1 text-white">{settings.iban ?? "Not configured"}</span>
                            </div>
                            <div>
                                <span className="text-slate-400">BIC / SWIFT: </span>
                                <span className="mt-1 text-white">{settings.bic ?? "Not configured"}</span>
                            </div>
                            <div>
                                <span className="text-slate-400">Payment terms: </span>
                                <span className="mt-1 text-white">{settings.payment_terms_days} days: </span>
                            </div>
                            <div className="md:col-span-2">
                                <span className="text-slate-400">Business address: </span>
                                <span className="mt-1 whitespace-pre-line text-white">{settings.business_address ?? "Not configured"}</span>
                            </div>
                        </div>
                        )
                    }
                </section>
                
                {/* Show the Edit Details button and conditionally display the editing form. */}
                {!error && settings && (
                    <PlatformInvoiceSettingsEditor settings={settings} />
                )}
            </div>
        </main>
    );
}
