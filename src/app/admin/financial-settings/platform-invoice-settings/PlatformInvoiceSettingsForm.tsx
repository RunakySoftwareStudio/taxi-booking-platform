
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
    PlatformInvoiceSettingsForm

    Allows Admin to update Voya Taxi business identity and
    payment settings through the protected Admin API.
*/

type PlatformInvoiceSettingsFormProps = {
    onSaved?: () => void;
    initialSettings: {
        legal_name: string | null;
        business_address: string | null;
        kvk_number: string | null;
        vat_number: string | null;
        contact_email: string | null;
        iban: string | null;
        bic: string | null;
        payment_terms_days: number;
    };
};

export default function PlatformInvoiceSettingsForm({ initialSettings, onSaved }: PlatformInvoiceSettingsFormProps) {
    const router = useRouter();

    /* Initialize editable fields from the current database record. */
    const [legalName, setLegalName] = useState(initialSettings.legal_name ?? "");
    const [businessAddress, setBusinessAddress] = useState(initialSettings.business_address ?? "");
    const [kvkNumber, setKvkNumber] = useState(initialSettings.kvk_number ?? "");
    const [vatNumber, setVatNumber] = useState(initialSettings.vat_number ?? "");
    const [contactEmail, setContactEmail] = useState(initialSettings.contact_email ?? "");
    const [iban, setIban] = useState(initialSettings.iban ?? "");
    const [bic, setBic] = useState(initialSettings.bic ?? "");
    const [paymentTermsDays, setPaymentTermsDays] = useState(initialSettings.payment_terms_days.toString());
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    /* Validate the payment terms and save the business settings. */
    async function handleSave(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (isSaving) return;

        const days = Number(paymentTermsDays);

        if (!Number.isInteger(days) || days < 1 || days > 365) {
            setErrorMessage("Payment terms must be between 1 and 365 days.");
            return;
        }

        setIsSaving(true);
        setMessage(null);
        setErrorMessage(null);

        try {
            const response = await fetch("/api/admin/financial-settings/platform-invoice-settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    legalName, businessAddress, kvkNumber, vatNumber,
                    contactEmail, iban, bic, paymentTermsDays: days,
                }),
            });

            const result: { message?: string } = await response.json();

            if (!response.ok) {
                setErrorMessage(result.message ?? "Unable to save settings.");
                return;
            }

            /* Refresh saved information and close the editing form. */
            setMessage("Platform invoice settings saved successfully.");
            router.refresh();
            onSaved?.();
            
        } catch (error) {
            console.error("Platform invoice settings request failed:", error);
            setErrorMessage("Unable to connect to the settings service.");
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <section className="mt-6 rounded-lg border border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-white">Edit Platform Invoice Settings</h2>
            <p className="mt-2 text-sm text-slate-300">These details will be copied onto chauffeur invoices when issued.</p>

            <form onSubmit={handleSave} className="mt-5 space-y-4">
                {/* Platform legal identity. */}
                <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm text-slate-300">Legal name
                        <input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
                    </label>
                    <label className="text-sm text-slate-300">KVK number
                        <input type="text" value={kvkNumber} onChange={(e) => setKvkNumber(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
                    </label>
                    <label className="text-sm text-slate-300">VAT number
                        <input type="text" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
                    </label>
                    <label className="text-sm text-slate-300">Contact email
                        <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
                    </label>
                </div>

                {/* Registered business address. */}
                <label className="block text-sm text-slate-300">Business address
                    <textarea rows={3} value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
                </label>

                {/* Payment information. */}
                <div className="grid gap-4 md:grid-cols-3">
                    <label className="text-sm text-slate-300">IBAN
                        <input type="text" value={iban} onChange={(e) => setIban(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
                    </label>
                    <label className="text-sm text-slate-300">BIC / SWIFT (optional)
                        <input type="text" value={bic} onChange={(e) => setBic(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
                    </label>
                    <label className="text-sm text-slate-300">Payment terms (days)
                        <input type="number" min="1" max="365" step="1" value={paymentTermsDays}
                            onChange={(e) => setPaymentTermsDays(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
                    </label>
                </div>

                {/* Submit and feedback. */}
                <button type="submit" disabled={isSaving}
                    className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
                    {isSaving ? "Saving..." : "Save Platform Settings"}
                </button>
                {message && <p role="status" className="text-sm text-green-400">{message}</p>}
                {errorMessage && <p role="alert" className="text-sm text-red-300">{errorMessage}</p>}
            </form>
        </section>
    );
}
