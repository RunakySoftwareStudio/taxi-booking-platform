
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formStyles } from "@/styles/classNames";

type DraftPricingNavigationGuardProps = {
    formId: string;
    saveAndReturnButtonId: string;
    saveButtonId: string;
    returnPath: string;
    returnLabel: string;
};
/**
 * PURPOSE: PROTECT UNSAVED PRICING-DRAFT CHANGES
 *
 * Watches the editable pricing draft form.
 *
 * Back to pricing:
 * - no changes → return immediately;
 * - unsaved changes → show Save / Discard / Stay choices.
 *
 * Save changes & return submits the existing draft form through
 * a hidden submit button that tells the server action to return
 * to /admin/pricing after saving.
 */
export default function DraftPricingNavigationGuard({formId, saveAndReturnButtonId, saveButtonId, returnPath, returnLabel,}: DraftPricingNavigationGuardProps) 
{
    const router = useRouter();
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showWarning, setShowWarning] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    /**
     * Creates a simple snapshot of the current form values.
     * We compare this with the original values loaded from the database.
     */
    function createFormSnapshot(form: HTMLFormElement) {
        return JSON.stringify(
            Array.from(new FormData(form).entries()).map(
                ([fieldName, fieldValue]) => [fieldName, String(fieldValue)]
            )
        );
    }

    useEffect(() => {
        const form = document.getElementById(formId);
        if (!(form instanceof HTMLFormElement)) { return; }

        const draftForm = form;
        const originalSnapshot = createFormSnapshot(draftForm);

        function checkForChanges() {setHasUnsavedChanges(createFormSnapshot(draftForm) !== originalSnapshot );}
        function handleSubmit() {setIsSaving(true); setHasUnsavedChanges(false);}

        draftForm.addEventListener("input", checkForChanges);
        draftForm.addEventListener("change", checkForChanges);
        draftForm.addEventListener("submit", handleSubmit);

        return () => {
            draftForm.removeEventListener("input", checkForChanges);
            draftForm.removeEventListener("change", checkForChanges);
            draftForm.removeEventListener("submit", handleSubmit);
        };
    }, [formId]);

    /**
     * Also protects against refreshing or closing the browser tab
     * while draft changes have not been saved.
     */
    useEffect(() => {
        if (!hasUnsavedChanges) { return; }

        function handleBeforeUnload(event: BeforeUnloadEvent) {
            event.preventDefault();
            event.returnValue = "";
        }

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => { window.removeEventListener("beforeunload", handleBeforeUnload); };
    }, [hasUnsavedChanges]);

    /**
     * Keeps the visible Save button synchronized with
     * the actual state of the pricing draft.
     *
     * No changes  -> Saved
     * Changed     -> Save draft pricing
     * Submitting  -> Saving...
     */
    useEffect(() => {
        const saveButton = document.getElementById(saveButtonId);

        if (!(saveButton instanceof HTMLButtonElement)) { return;}
        if (isSaving) { saveButton.textContent = "Saving...";  saveButton.disabled = true; return;}
        if (hasUnsavedChanges) { saveButton.textContent = "Save draft pricing"; saveButton.disabled = false; return;}

        saveButton.textContent = "Saved";
        saveButton.disabled = true;
    }, [hasUnsavedChanges, isSaving, saveButtonId]);

    // Handle Back To main page
    function handleBackToPricing() {
        if (!hasUnsavedChanges) {router.push(returnPath); return; }
        setShowWarning(true);
    }

    function handleSaveAndReturn() {
        const form = document.getElementById(formId);
        const saveAndReturnButton = document.getElementById(saveAndReturnButtonId);

        if (!(form instanceof HTMLFormElement)) { return; }
        if (!(saveAndReturnButton instanceof HTMLButtonElement)) { return; }
        if (!form.reportValidity()) { setShowWarning(false); return; }

        setShowWarning(false);
        form.requestSubmit(saveAndReturnButton);
    }

    function handleDiscardAndReturn() {
        setHasUnsavedChanges(false);
        setShowWarning(false);
        router.push(returnPath);
    }

    return (
        <>
            {/**
             * normal pricing page → /admin/pricing
             * country review     → /admin/pricing/countries/DE 
             */}
            <button type="button" onClick={handleBackToPricing} className={formStyles.link}>
                {returnLabel}
            </button>

            {showWarning ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div role="dialog" aria-modal="true" aria-labelledby="unsaved-pricing-title"
                        className="w-full max-w-lg rounded-2xl border border-yellow-400/40 bg-slate-950 p-6 shadow-2xl" 
                    >
                        <h2 id="unsaved-pricing-title" className="text-lg font-semibold text-yellow-200">
                            Unsaved pricing changes
                        </h2>

                        <p className="mt-3 text-sm text-slate-300">
                            You changed this pricing draft but have not saved the changes yet.
                        </p>

                        <div className="mt-6 flex flex-wrap gap-3">
                            <button type="button" onClick={handleSaveAndReturn} className={formStyles.smallButton}>
                                Save changes & return
                            </button>

                            <button type="button" onClick={handleDiscardAndReturn}
                                className="rounded-lg border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-400/10" >
                                Discard changes & return
                            </button>

                            <button type="button" onClick={() => setShowWarning(false)}
                                className="rounded-lg border border-slate-500/50 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5">
                                Stay on page
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}