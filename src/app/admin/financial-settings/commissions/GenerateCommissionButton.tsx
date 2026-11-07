"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
    GenerateCommissionButton

    Allows Admin to generate a permanent chauffeur commission
    through the protected API.

    Generation is currently enabled in local development only.
    PostgreSQL enforces financial eligibility and duplicate protection.
*/

type GenerateCommissionButtonProps = {
    bookingId: string;
};

export default function GenerateCommissionButton({ bookingId }: GenerateCommissionButtonProps) {
    const router = useRouter();

    /* Track request progress and API errors. */
    const [isGenerating, setIsGenerating] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    /* Keep the button disabled in production until final approval. */
    const generationEnabled = process.env.NODE_ENV === "development";

    /*
        Confirm and request commission generation.

        The Admin API verifies authorization, while PostgreSQL
        validates financial eligibility and creates the record.
    */
    async function handleGenerateCommission() {
        if (!generationEnabled || isGenerating) return;

        const confirmed = window.confirm(
            `Generate a permanent chauffeur commission for booking ${bookingId}?\n\n` +
            "This creates a historical financial record."
        );

        if (!confirmed) return;

        setIsGenerating(true);
        setErrorMessage(null);

        try {
            const response = await fetch(
                `/api/admin/commissions/${bookingId}`,
                { method: "POST" }
            );

            const result: { message?: string } = await response.json();

            if (!response.ok) {
                setErrorMessage(result.message ?? "Commission generation failed.");
                return;
            }

            /* Refresh the overview to display the stored commission. */
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
            {/* Enable generation locally; disable during requests and in production. */}
            <button
                type="button"
                onClick={handleGenerateCommission}
                disabled={!generationEnabled || isGenerating}
                title={
                    generationEnabled
                        ? "Generate a permanent chauffeur commission."
                        : "Commission generation is not enabled in production yet."
                }
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                    generationEnabled && !isGenerating
                        ? "cursor-pointer bg-cyan-600 text-white hover:bg-cyan-500"
                        : "cursor-not-allowed border border-slate-600 text-slate-400 opacity-50"
                }`}
            >
                {isGenerating ? "Generating..." : "Generate Commission"}
            </button>

            {/* Display API errors without hiding the booking row. */}
            {errorMessage && (
                <p role="alert" className="text-xs text-red-300">
                    {errorMessage}
                </p>
            )}
        </div>
    );
}