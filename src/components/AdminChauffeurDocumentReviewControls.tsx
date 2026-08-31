"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formStyles, pageStyles } from "@/styles/classNames";

type AdminChauffeurDocumentReviewControlsProps = {
    chauffeurId: string;
    documentId: string;
    verificationStatus: string;
};

/**
 * Allows an administrator to verify or reject one pending
 * chauffeur compliance document.
 */
export default function AdminChauffeurDocumentReviewControls({ chauffeurId, documentId, verificationStatus}: AdminChauffeurDocumentReviewControlsProps) {

    const router = useRouter();
    const [statusReason, setStatusReason] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    /* Only pending documents can be reviewed. */
    if (verificationStatus !== "pending_review") {
        return null;
    }

    /* Sends the review decision through the protected Admin API route. */
    async function handleReview(reviewStatus: "verified" | "rejected") {
        setSuccessMessage("");
        setErrorMessage("");

        if (reviewStatus === "rejected" && !statusReason.trim()) {
            setErrorMessage("Please provide a reason before rejecting the document.");
            return;
        }

        setIsSaving(true);

        try {
            const response = await fetch(`/api/admin/chauffeurs/${chauffeurId}/documents/${documentId}/review`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        verificationStatus: reviewStatus,
                        statusReason: reviewStatus === "rejected" ? statusReason : "",
                    }),
                }
            );

            const result = await response.json();
            if (!response.ok) {
                setErrorMessage(result.message || "Could not review document.");
                return;
            }

            setSuccessMessage(result.message ||
                (reviewStatus === "verified" ? "Document verified successfully." : "Document rejected successfully.")
            );

            router.refresh();
        }
        catch (error) {
            console.error("Could not review chauffeur document:", error);
            setErrorMessage("Could not review document. Please try again.");
        }
        finally {setIsSaving(false);}
    }

    return (
        <div className="mt-4 border-t border-cyan-400/15 pt-4">
            <label className="block">
                <span className={formStyles.span}>Rejection reason</span>
                <textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)}
                    rows={2} placeholder="Required only when rejecting the document" className={formStyles.textarea}
                />
            </label>

            {successMessage && (<p className={`${pageStyles.successMsgPage} mt-3`}> {successMessage}</p>)}
            {errorMessage && (<p className={`${pageStyles.errorMsgPage} mt-3`}> {errorMessage}</p>)}

            <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => handleReview("verified")}disabled={isSaving} className={formStyles.primaryButtonOutside}>
                    {isSaving ? "Saving..." : "Verify document"}
                </button>
                <button type="button" onClick={() => handleReview("rejected")} disabled={isSaving} className={formStyles.deActiveDeleteButton}>
                    {isSaving ? "Saving..." : "Reject document"}
                </button>
            </div>
        </div>
    );
}