
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
    InvoiceVatSelector
    Allows Admin to select VAT for a draft chauffeur invoice.
    Saving remains disabled until financial workflow validation.
*/

type InvoiceVatSelectorProps = {
    invoiceId: string;
    currentVatPercentage: number | null;
};

export default function InvoiceVatSelector({ invoiceId, currentVatPercentage }: InvoiceVatSelectorProps) {
    const router = useRouter();

    /* Track VAT selection and request state. */
    const [vatPercentage, setVatPercentage] = useState(currentVatPercentage?.toString() ?? "");
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    /* Keep invoice VAT updates disabled until approved. */
    const vatUpdatesEnabled = false;

    /* Validate and save the selected VAT percentage. */
    async function handleSaveVat() {
        if (!vatUpdatesEnabled || isSaving) return;

        const rate = Number(vatPercentage);

        if (!vatPercentage.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100 || !Number.isInteger(rate * 10000)) {
            setErrorMessage("Enter a VAT percentage between 0 and 100, with up to four decimal places.");
            return;
        }

        setIsSaving(true);
        setErrorMessage(null);

        try {
            const response = await fetch(`/api/admin/invoices/${invoiceId}/vat`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vatPercentage: rate }),
            });

            const result: { message?: string } = await response.json();

            if (!response.ok) {
                setErrorMessage(result.message ?? "Unable to save invoice VAT.");
                return;
            }

            router.refresh();
        } catch (error) {
            console.error("Invoice VAT update failed:", error);
            setErrorMessage("Unable to connect to the invoice service.");
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="mt-4 flex flex-col gap-3">
            {/* VAT percentage input. */}
            <label htmlFor="invoice-vat-percentage" className="text-sm font-medium text-slate-300">Invoice VAT percentage</label>
            <div className="flex flex-wrap items-center gap-3">
                <input
                    id="invoice-vat-percentage" type="number" min="0" max="100" step="0.0001"
                    value={vatPercentage} onChange={(event) => setVatPercentage(event.target.value)}
                    disabled={!vatUpdatesEnabled || isSaving} placeholder="Select VAT %"
                    className="w-40 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                />
                <button type="button" onClick={handleSaveVat} disabled={!vatUpdatesEnabled || isSaving}
                    className="cursor-not-allowed rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-400 opacity-50">
                    {isSaving ? "Saving..." : "Save VAT"}
                </button>
            </div>

            <p className="text-xs text-slate-400">VAT selection is awaiting financial workflow validation.</p>
            {errorMessage && <p role="alert" className="text-xs text-red-300">{errorMessage}</p>}
        </div>
    );
}
