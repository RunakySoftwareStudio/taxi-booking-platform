"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
/*
    Commission generation state and request handling.

    The protected API request is implemented, but the
    button remains disabled until final validation.
*/

type GenerateCommissionButtonProps = {
    bookingId: string;
};

export default function GenerateCommissionButton({bookingId,}: GenerateCommissionButtonProps) {
    /*
        Ask Admin to confirm commission generation.
        The API request is not implemented yet.
        No financial records are created.
    */
    /* Track the generation request and its result. */
    const router = useRouter();
    const [isGenerating, setIsGenerating] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    /* Keep permanent commission generation disabled until final approval. */
    const generationEnabled = false;

    /*
        Confirm and request commission generation.

        The protected Admin API validates permissions and delegates
        financial calculations to PostgreSQL.
    */
    async function handleGenerateCommission() {
        /* Ignore additional clicks while generation is in progress. */
        if (isGenerating) return;

        const confirmed = window.confirm(
            `Generate a permanent chauffeur commission for booking ${bookingId}?\n\n` +
            "This creates a historical financial record."
        );
        if (!confirmed) return;
        setIsGenerating(true);
        setErrorMessage(null);

        try {
            const response = await fetch(`/api/admin/commissions/${bookingId}`,{ method: "POST" });
            const result: { message?: string } = await response.json();
            if (!response.ok) {
                setErrorMessage(result.message ?? "Commission generation failed.");
                return;
            }
            /* Reload the overview to display the frozen commission. */
            router.refresh();
        } catch (error) {
            console.error("Commission generation request failed:", error);
            setErrorMessage("Unable to connect to the commission service.");
        } finally {
            setIsGenerating(false);
        }
    }

    return (
        <div className="flex flex-col items-start gap-2">
            {/* Generate commission control — disabled during development. */}
            <button type="button" onClick={handleGenerateCommission} disabled={!generationEnabled || isGenerating}
                title={`Commission generation for booking ${bookingId} is not enabled yet.`}
                className="cursor-not-allowed rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-400 opacity-50"
            >
                {isGenerating ? "Generating..." : "Generate Commission"}
            </button>

            {/* Display an API error without hiding the booking row. */}
            {errorMessage && (
                <p role="alert" className="text-xs text-red-300">{errorMessage} </p>
            )}
        </div>
    );
}