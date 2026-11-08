
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
    IssueInvoiceButton

    Requests official chauffeur invoice issuance through the Admin API.
    Issuance remains disabled until financial workflow validation.
*/

type IssueInvoiceButtonProps = {
    invoiceId: string;
};

export default function IssueInvoiceButton({ invoiceId }: IssueInvoiceButtonProps) {
    const router = useRouter();

    /* Track issuance progress and API errors. */
    const [isIssuing, setIsIssuing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    /* Prevent issuance until the financial workflow is approved. */
    const issuanceEnabled = false;

    /* Confirm issuance before calling the protected Admin API. */
    async function handleIssueInvoice() {
        if (!issuanceEnabled || isIssuing) return;

        const confirmed = window.confirm("Issue this chauffeur invoice?\n\n" + "This assigns an official invoice number and permanently freezes the financial records." );
        if (!confirmed) return;

        setIsIssuing(true);
        setErrorMessage(null);

        try {
            const response = await fetch(`/api/admin/invoices/${invoiceId}/issue`, { method: "POST", });
            const result: { invoiceNumber?: string; message?: string } = await response.json();
            if (!response.ok) {setErrorMessage(result.message ?? "Invoice issuance failed.");return; }

            /* Refresh invoice details after successful issuance. */
            router.refresh();

        } catch (error) {
            console.error("Invoice issuance request failed:", error);
            setErrorMessage("Unable to connect to the invoice service.");

        } finally {
            setIsIssuing(false);
        }
    }

    return (
        <div className="mt-4 flex flex-col items-start gap-2">
            {/* Keep official issuance disabled until validation. */}
            <button type="button" onClick={handleIssueInvoice} disabled={!issuanceEnabled || isIssuing}
                title="Invoice issuance is awaiting financial workflow validation."
                className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                    issuanceEnabled && !isIssuing
                        ? "cursor-pointer bg-cyan-600 text-white hover:bg-cyan-500"
                        : "cursor-not-allowed border border-slate-600 text-slate-400 opacity-50"
                }`}>
                {isIssuing ? "Issuing..." : "Issue Invoice"}
            </button>

            {errorMessage && <p role="alert" className="text-xs text-red-300">{errorMessage}</p>}
        </div>
    );
}
