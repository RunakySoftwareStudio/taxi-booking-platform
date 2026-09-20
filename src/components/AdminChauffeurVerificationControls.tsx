
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formStyles, pageStyles } from "@/styles/classNames";

/* ============================================================
   WHOLE-CHAUFFEUR VERIFICATION CONTROLS

   Allows Admin to verify, suspend or deactivate a chauffeur's
   overall compliance approval.

   The protected Admin API and database RPC perform the final
   validation and record the status change.

   Individual document verification, account status and
   operational status remain independent.
============================================================ */

/* Defines the chauffeur and their current compliance status. */
type AdminChauffeurVerificationControlsProps = {
    chauffeurId: string;
    verificationStatus: string;
};

/* Defines the three compliance actions available to Admin. */
type ComplianceAction = "verified" | "suspended" | "inactive";

/**
 * Displays the Admin controls for whole-chauffeur verification.
 */
export default function AdminChauffeurVerificationControls({ chauffeurId, verificationStatus }: AdminChauffeurVerificationControlsProps) {
    const router = useRouter();

    /* Stores the reason, request state and API feedback. */
    const [statusReason, setStatusReason] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    /* ============================================================
       SUBMIT COMPLIANCE ACTION

       Sends the Admin decision to the protected verification API.

       The database RPC performs the final qualification checks
       and records the verification audit information.
    ============================================================ */
    async function handleVerification(nextStatus: ComplianceAction) {
        if (isSaving) { return; }

        setSuccessMessage("");
        setErrorMessage("");

        /* Suspension and deactivation require an explanation. */
        if (nextStatus !== "verified" && !statusReason.trim()) {
            setErrorMessage("Please provide a reason for suspension or deactivation.");
            return;
        }

        setIsSaving(true);

        try {
            const response = await fetch(`/api/admin/chauffeurs/${chauffeurId}/verification`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    verificationStatus: nextStatus,
                    statusReason: nextStatus === "verified" ? "" : statusReason.trim()
                })
            });

            const result = await response.json();

            if (!response.ok) {
                setErrorMessage(result.message || "Could not update chauffeur compliance.");
                return;
            }

            /* Display confirmation and reload the updated compliance data. */
            setSuccessMessage(result.message || "Compliance status updated successfully.");
            setStatusReason("");
            router.refresh();

        } catch (error) {
            console.error("Could not update chauffeur compliance:", error);
            setErrorMessage("Could not update chauffeur compliance. Please try again.");

        } finally {
            setIsSaving(false);
        }
    }

    /* ============================================================
       ADMIN VERIFICATION INTERFACE

       Shows only actions that differ from the current status.

       Verify is available for pending, suspended and inactive
       chauffeurs. The database checks both required documents.

       Suspension and deactivation require a reason.
    ============================================================ */
    return (
        <div className="mt-6 rounded-xl border border-cyan-400/20 bg-slate-950/40 p-4">
            <h3 className="text-lg font-semibold text-white">Whole-chauffeur verification</h3>

            <p className="mt-2 text-sm text-slate-400">
                Verify the chauffeur&apos;s overall compliance approval or change their verification status.
            </p>

            {/* Reason required when suspending or deactivating compliance. */}
            <div className="mt-4">
                <label htmlFor="chauffeur-compliance-reason" className={formStyles.span}>
                    Suspension / deactivation reason
                </label>

                <textarea id="chauffeur-compliance-reason" value={statusReason} onChange={(event) => setStatusReason(event.target.value)}
                    rows={2} placeholder="Required when suspending or deactivating compliance" className={formStyles.textarea} disabled={isSaving}
                />
            </div>

            {/* Display API success and error messages. */}
            {successMessage && <p className={`${pageStyles.successMsgPage} mt-3`}>{successMessage}</p>}
            {errorMessage && <p className={`${pageStyles.errorMsgPage} mt-3`}>{errorMessage}</p>}

            {/* Show available compliance actions based on the current status. */}
            <div className="mt-4 flex flex-wrap gap-3">
                {verificationStatus !== "verified" && (
                    <button type="button" onClick={() => handleVerification("verified")} disabled={isSaving} className={formStyles.primaryButtonOutside}>
                        {isSaving ? "Saving..." : "Verify chauffeur"}
                    </button>
                )}

                {verificationStatus !== "suspended" && (
                    <button type="button" onClick={() => handleVerification("suspended")} disabled={isSaving} className={formStyles.deActiveDeleteButton}>
                        {isSaving ? "Saving..." : "Suspend"}
                    </button>
                )}

                {verificationStatus !== "inactive" && (
                    <button type="button" onClick={() => handleVerification("inactive")} disabled={isSaving} className={formStyles.deActiveDeleteButton}>
                        {isSaving ? "Saving..." : "Inactive"}
                    </button>
                )}
            </div>
        </div>
    );
}