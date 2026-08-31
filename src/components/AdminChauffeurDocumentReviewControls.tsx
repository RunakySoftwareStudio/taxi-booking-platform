"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formStyles, pageStyles } from "@/styles/classNames";

/* Defines which chauffeur document is being reviewed and its current status. */
type AdminChauffeurDocumentReviewControlsProps = {
    chauffeurId: string;
    documentId: string;
    documentType: string;
    verificationStatus: string;
};

/**
 * Allows an administrator to verify or reject one pending
 * chauffeur compliance document.
 */
export default function AdminChauffeurDocumentReviewControls({
    chauffeurId, documentId, documentType, verificationStatus
}: AdminChauffeurDocumentReviewControlsProps) {
    const router = useRouter();
    const [statusReason, setStatusReason] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    /* Stores structured Chauffeurskaart details entered by Admin during verification. */
    const [chauffeurCardNumber, setChauffeurCardNumber] = useState("");
    const [chauffeurCardValidUntil, setChauffeurCardValidUntil] = useState("");

    /* Stores structured Driving licence details entered by Admin during verification. */
    const [drivingLicenseNumber, setDrivingLicenseNumber] = useState("");
    const [drivingLicenseValidUntil, setDrivingLicenseValidUntil] = useState("");

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

        /* ============================================================
        CHAUFFEURSKAART CLIENT VALIDATION

        Gives Admin an immediate message before calling the API.
        The database RPC still performs the final authoritative checks.
        ============================================================ */
        if (reviewStatus === "verified" && documentType === "chauffeur_card") {
            if (!chauffeurCardNumber.trim()) {
                setErrorMessage("Please enter the Chauffeurskaart number.");
                return;
            }

            if (!chauffeurCardValidUntil) {
                setErrorMessage("Please enter the Chauffeurskaart valid-until date.");
                return;
            }
        }

        /* ============================================================
        DRIVING LICENCE CLIENT VALIDATION

        Requires both the licence number and expiry date before Admin
        can verify a Driving licence.

        The database RPC will still perform the final authoritative
        validation before saving anything.
        ============================================================ */
        if (reviewStatus === "verified" && documentType === "driving_license") {
            if (!drivingLicenseNumber.trim()) {
                setErrorMessage("Please enter the Driving licence number.");
                return;
            }

            if (!drivingLicenseValidUntil) {
                setErrorMessage("Please enter the Driving licence valid-until date.");
                return;
            }
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

                        /* Structured card details are used only for Chauffeurskaart verification. */
                        chauffeurCardNumber: reviewStatus === "verified" && documentType === "chauffeur_card"
                                ? chauffeurCardNumber
                                : "",

                        chauffeurCardValidUntil: reviewStatus === "verified" && documentType === "chauffeur_card"
                                ? chauffeurCardValidUntil
                                : "",

                        /* Structured Driving licence details are sent only during licence verification. */
                        drivingLicenseNumber: reviewStatus === "verified" && documentType === "driving_license"
                                ? drivingLicenseNumber
                                : "",

                        drivingLicenseValidUntil: reviewStatus === "verified" && documentType === "driving_license"
                                ? drivingLicenseValidUntil
                                : "",
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

                {/* ============================================================
                    CHAUFFEURSKAART VERIFICATION DETAILS

                    These fields appear only when Admin reviews a Chauffeurskaart.

                    When the document is verified, the card number and expiry
                    date will also be stored in chauffeur_compliance so Voya Taxi
                    can later check whether the chauffeur remains legally eligible.
                ============================================================ */}
                {documentType === "chauffeur_card" && (
                    <div className="mb-4 grid gap-4 sm:grid-cols-2">
                        <label className="block">
                            <span className={formStyles.span}>Chauffeurskaart number</span>
                            <input value={chauffeurCardNumber} onChange={(event) => setChauffeurCardNumber(event.target.value)}
                                placeholder="Enter Chauffeurskaart number" className={formStyles.inputWFullCyan}
                            />
                        </label>

                        <label className="block">
                            <span className={formStyles.span}>Valid until</span>
                            <input type="date" value={chauffeurCardValidUntil} onChange={(event) => setChauffeurCardValidUntil(event.target.value)}
                                className={formStyles.inputWFullCyan}
                            />
                        </label>
                    </div>
                )}

                {/* ============================================================
                    DRIVING LICENCE VERIFICATION DETAILS

                    These fields appear only when Admin reviews a Driving licence.

                    When the document is verified, the licence number and expiry
                    date will also be stored in chauffeur_compliance so Voya Taxi
                    can use them for future validity and eligibility checks.
                ============================================================ */}
                {documentType === "driving_license" && (
                    <div className="mb-4 grid gap-4 sm:grid-cols-2">
                        <label className="block">
                            <span className={formStyles.span}>Driving licence number</span>
                            <input value={drivingLicenseNumber} onChange={(event) => setDrivingLicenseNumber(event.target.value)}
                                placeholder="Enter Driving licence number" className={formStyles.inputWFullCyan}
                            />
                        </label>

                        <label className="block">
                            <span className={formStyles.span}>Driving licence valid until</span>
                            <input type="date" value={drivingLicenseValidUntil} onChange={(event) => setDrivingLicenseValidUntil(event.target.value)}
                                className={formStyles.inputWFullCyan}
                            />
                        </label>
                    </div>
                )}

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