"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
    CreateDraftInvoiceButton

    Prepares monthly chauffeur invoice draft creation.
    The action remains disabled until financial workflow testing is approved.
*/

type CreateDraftInvoiceButtonProps = {
    chauffeurId: string;
    billingMonth: string;
};

export default function CreateDraftInvoiceButton({
    chauffeurId,
    billingMonth,
}: CreateDraftInvoiceButtonProps) {
    const router = useRouter();

    /* Track request progress and errors. */
    const [isCreating, setIsCreating] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    /* Do not enable financial writes before controlled validation. */
    const creationEnabled = false;

    /* Request a draft through the protected Admin API. */
    async function handleCreateDraft() {
        if (!creationEnabled || isCreating) return;

        const confirmed = window.confirm(
            `Create or refresh the invoice draft for chauffeur ${chauffeurId}, billing month ${billingMonth}?\n\n` +
            "This will create or update financial records."
        );

        if (!confirmed) return;

        setIsCreating(true);
        setErrorMessage(null);

        try {
            const response = await fetch("/api/admin/invoices/drafts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chauffeurId, billingMonth }),
            });

            const result: { invoiceId?: string; message?: string } = await response.json();

            if (!response.ok || !result.invoiceId) {
                setErrorMessage(result.message ?? "Invoice draft creation failed.");
                return;
            }

            /* Refresh invoice data after successful creation. */
            router.refresh();

        } catch (error) {
            console.error("Invoice draft request failed:", error);
            setErrorMessage("Unable to connect to the invoice service.");

        } finally {
            setIsCreating(false);
        }
    }

    return (
        <div className="flex flex-col items-start gap-2">
            {/* Keep draft creation disabled until controlled testing. */}
            <button type="button" onClick={handleCreateDraft} disabled={!creationEnabled || isCreating}
                title="Invoice draft creation is awaiting financial workflow validation."
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                    creationEnabled && !isCreating
                        ? "cursor-pointer bg-cyan-600 text-white hover:bg-cyan-500"
                        : "cursor-not-allowed border border-slate-600 text-slate-400 opacity-50"
                }`}
            >
                {isCreating ? "Creating..." : "Create Draft"}
            </button>

            {errorMessage && (<p role="alert" className="text-xs text-red-300"> {errorMessage}</p>)}
        </div>
    );
}