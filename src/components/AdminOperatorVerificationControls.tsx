"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formStyles, pageStyles } from "@/styles/classNames";

type AdminOperatorVerificationControlsProps = {
    operatorId: string;
    verificationStatus: string;
    verificationStatusReason: string | null;
};

/**
 * AdminOperatorVerificationControls
 *
 * Manages taxi-operator verification actions separately from
 * normal operator business/contact editing.
 *
 * Verification changes are sent only to the dedicated
 * verification API route, which calls the protected database RPC.
 */
export default function AdminOperatorVerificationControls({operatorId, verificationStatus, verificationStatusReason,}: AdminOperatorVerificationControlsProps) 
{
    const [statusReason, setStatusReason] = useState(verificationStatusReason ?? "");
    const router = useRouter();
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    /* Clears old verification messages after normal operator details are saved. */
    useEffect(() => {
        function clearVerificationMessages() {
            setSuccessMessage("");
            setErrorMessage("");
        }

        window.addEventListener("operator-details-updated", clearVerificationMessages);

        return () => {window.removeEventListener("operator-details-updated", clearVerificationMessages);};
    }, []);

    /**
     * Changes the operator verification status through the dedicated API route.
     *
     * The API route calls update_taxi_operator_verification_status.
     * This component never updates verification_status directly.
     */
    async function handleVerifyOperator() {
        setSuccessMessage("");
        setErrorMessage("");
        setIsSaving(true);

        try {
            const response = await fetch(`/api/admin/operators/${operatorId}/verification`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        verificationStatus: "verified",
                        statusReason: "",
                    }),
                }
            );

            const result = await response.json();
            if (!response.ok) {
                setErrorMessage(result.message || "Could not verify taxi operator.");
                return;
            }

            setSuccessMessage(
                result.message || "Taxi operator verified successfully."
            );

            /* Verification clears any previous suspension/inactive reason. */
            setStatusReason("");

            router.refresh();
        }
        catch (error) {
            console.error("Could not verify taxi operator:", error);
            setErrorMessage("Could not verify taxi operator. Please try again.");
        }
        finally {
            setIsSaving(false);
        }
    }

    /**
     * Suspends the operator through the dedicated verification API route.
     *
     * A suspension reason is required by the API.
     */
    async function handleSuspendOperator() {
        setSuccessMessage("");
        setErrorMessage("");

        if (!statusReason.trim()) {
            setErrorMessage("Please provide a reason before suspending the operator.");
            return;
        }

        setIsSaving(true);

        try {
            const response = await fetch(
                `/api/admin/operators/${operatorId}/verification`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        verificationStatus: "suspended",
                        statusReason,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                setErrorMessage(result.message || "Could not suspend taxi operator.");
                return;
            }

            setSuccessMessage(result.message || "Taxi operator suspended successfully.");

            router.refresh();
        }
        catch (error) {
            console.error("Could not suspend taxi operator:", error);
            setErrorMessage("Could not suspend taxi operator. Please try again.");
        }
        finally {
            setIsSaving(false);
        }
    }

    /**
     * Marks the operator inactive through the dedicated verification API route.
     *
     * An inactive reason is required by the API.
     */
    async function handleInactiveOperator() {
        setSuccessMessage("");
        setErrorMessage("");

        if (!statusReason.trim()) {
            setErrorMessage("Please provide a reason before marking the operator inactive.");
            return;
        }

        setIsSaving(true);

        try {
            const response = await fetch(`/api/admin/operators/${operatorId}/verification`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        verificationStatus: "inactive",
                        statusReason,
                    }),
                }
            );

            const result = await response.json();
            if (!response.ok) {
                setErrorMessage(result.message || "Could not mark taxi operator inactive." );
                return;
            }

            setSuccessMessage(result.message || "Taxi operator marked inactive successfully.");
            router.refresh();
        }
        catch (error) {
            console.error("Could not mark taxi operator inactive:", error);
            setErrorMessage("Could not mark taxi operator inactive. Please try again.");
        }
        finally {
            setIsSaving(false);
        }
    }

    /**
     * Returns the text color for one operator verification status.
     */
    function getOperatorStatusClass(verificationStatus: string) {
        if (verificationStatus === "verified") { return "text-green-300"; }
        if (verificationStatus === "pending_verification") { return "text-yellow-300"; }
        if (verificationStatus === "suspended") { return "text-red-300"; }
        if (verificationStatus === "inactive") { return "text-slate-400"; }

        return "text-white";
    }

    return (
        <section className="mt-6 rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-5">
            <h2 className="text-lg font-semibold text-yellow-200"> Verification controls </h2>
            <p className="mt-2 text-sm text-slate-300">
                Current status:{" "}
                <span className={`font-semibold ${getOperatorStatusClass(verificationStatus)}`}>
                    {verificationStatus}
                </span>
            </p>

            <input type="hidden" value={operatorId} readOnly />
            <label className="mt-4 block">
                <span className={formStyles.span}> Verification status reason </span>
                <textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)}
                    rows={3} placeholder="Required when suspending or deactivating an operator" className={formStyles.textarea}
                />
            </label>
            {successMessage && (
                <p className={`${pageStyles.successMsgPage} mt-4`}>
                    {successMessage}
                </p>
            )}

            {errorMessage && (
                <p className={`${pageStyles.errorMsgPage} mt-4`}>
                    {errorMessage}
                </p>
            )}

            <button type="button" onClick={handleVerifyOperator} disabled={isSaving || verificationStatus === "verified"} className={`${formStyles.primaryButtonOutside} mt-5`}>
                {isSaving ? "Verifying..." : verificationStatus === "verified"
                        ? "Already verified"
                        : "Verify operator"}
            </button>
            <button type="button" onClick={handleSuspendOperator} disabled={isSaving || verificationStatus === "suspended"} className={`${formStyles.deActiveDeleteButton} mt-5 ml-3`} >
                {isSaving ? "Saving..." : verificationStatus === "suspended"
                        ? "Already suspended"
                        : "Suspend operator"}
            </button>
            <button type="button" onClick={handleInactiveOperator} disabled={isSaving || verificationStatus === "inactive"} className={`${formStyles.deActiveDeleteButton} mt-5 ml-3`}>
                {isSaving ? "Saving..." : verificationStatus === "inactive"
                        ? "Already inactive"
                        : "Inactive operator"}
            </button>
        </section>
    );
}