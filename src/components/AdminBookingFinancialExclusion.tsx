"use client";
import { useState } from "react";

type AdminBookingFinancialExclusionProps = {
    bookingId: string;
    isFinanciallyExcluded: boolean;
    financialExclusionReason: string | null;
};
/*
    ADMIN BOOKING FINANCIAL EXCLUSION

    Displays the booking's financial exclusion setting.
    A dedicated save operation will be added after
    the database reason and API protections are implemented.
*/
export default function AdminBookingFinancialExclusion({bookingId, isFinanciallyExcluded, financialExclusionReason,}: AdminBookingFinancialExclusionProps) {
    const [excluded, setExcluded] = useState(isFinanciallyExcluded);
    /* Initialize the reason from the saved booking record. */
    const [exclusionReason, setExclusionReason] =  useState(financialExclusionReason ?? "");
    /* Track the latest successfully saved financial exclusion values. */
    const [savedExcluded, setSavedExcluded] = useState(isFinanciallyExcluded);
    const [savedReason, setSavedReason] = useState(financialExclusionReason ?? "");
    /*
        FINANCIAL EXCLUSION SAVE STATE
        Track the API request and display save feedback.
    */
    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    /*
        SAVE FINANCIAL EXCLUSION
        Validate the administrator's input and save through
        the protected Admin API without changing booking status.
    */
    async function handleSaveFinancialExclusion() {
        setSuccessMessage("");
        setErrorMessage("");

        if (savedExcluded === excluded &&
            savedReason === (excluded ? exclusionReason.trim() : "")) {
            setSuccessMessage("No financial changes were needed.");
            return;
        }

        if (excluded && !exclusionReason.trim()) {
            setErrorMessage("Please provide an exclusion reason.");
            return;
        }

        setIsSaving(true);

        try {
            const response = await fetch(
                `/api/admin/bookings/${bookingId}/financial-exclusion`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        isFinanciallyExcluded: excluded,
                        financialExclusionReason: excluded ? exclusionReason.trim() : null,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                setErrorMessage(result.message ?? "Could not save financial exclusion.");
                return;
            }

            /* Remember the values successfully saved in Supabase. */
            setSavedExcluded(excluded);
            setSavedReason(excluded ? exclusionReason.trim() : "");
            setSuccessMessage(result.message ?? "Financial exclusion saved.");

        } catch (error) {
            console.error("Financial exclusion save failed:", error);
            setErrorMessage("Unable to save financial exclusion.");
        } finally {
            setIsSaving(false);
        }
    }
    return (
        <div>
            <p className="text-sm font-semibold text-cyan-300">Financial Exclusion</p>
            <label className="mt-3 flex items-start gap-3 text-sm text-slate-200">
                <input type="checkbox" checked={excluded} onChange={(event) => setExcluded(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-600"/>
                <span>Exclude from chauffeur commission invoicing</span>
            </label>
            {/* Explain why this booking is excluded from invoicing. */}
            {excluded && (
                <div className="mt-3">
                    <label htmlFor="financialExclusionReason" className="text-xs font-medium text-slate-300">
                        Exclusion reason
                    </label>
                    <textarea id="financialExclusionReason" value={exclusionReason} onChange={(event) => setExclusionReason(event.target.value)}
                        placeholder="Explain why the chauffeur service fee is waived..."
                        rows={2} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 p-2 text-sm text-white"
                    />
                    <p className="mt-1 text-xs text-slate-400"> A reason is required before saving a financial exclusion. </p>
                </div>
            )}
            {/* Save financial changes independently of the booking form. */}
            <button type="button" onClick={handleSaveFinancialExclusion} disabled={isSaving}
                className="mt-4 rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isSaving ? "Saving..." : "Save Financial Exclusion"}
            </button>

            {/* Display the result of the financial exclusion update. */}
            {successMessage && (<p className="mt-3 text-sm text-green-400">{successMessage}</p>)}
            {errorMessage && (<p className="mt-3 text-sm text-red-400">{errorMessage}</p>)}
        </div>
    );
}