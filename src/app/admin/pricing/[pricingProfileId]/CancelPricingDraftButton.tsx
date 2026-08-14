
"use client";

import { useRef, useState } from "react";

type CancelPricingDraftButtonProps = {
    pricingProfileVersion: number;
};

/**
 * PURPOSE: CONFIRM PRICING-DRAFT CANCELLATION
 *
 * Prevents an administrator from accidentally deleting an unfinished pricing draft.
 *
 * Confirm:
 * → submits the existing Cancel Draft server-action form.
 *
 * Keep draft:
 * → closes the warning and changes nothing.
 */
export default function CancelPricingDraftButton({pricingProfileVersion}: CancelPricingDraftButtonProps) {

    const [showWarning, setShowWarning] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    function handleConfirmCancel() {
        const form = buttonRef.current?.closest("form");
        if (!(form instanceof HTMLFormElement)) { return; }

        setShowWarning(false);
        form.requestSubmit();
    }

    return (
        <>
            <button ref={buttonRef} type="button" onClick={() => setShowWarning(true)}
                className="rounded-lg border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-400/10">
                Cancel draft
            </button>

            {showWarning ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cancel-pricing-draft-title"
                        className="w-full max-w-lg rounded-2xl border border-red-400/40 bg-slate-950 p-6 shadow-2xl"
                    >
                        <h2 id="cancel-pricing-draft-title" className="text-lg font-semibold text-red-200">
                            Cancel pricing draft?
                        </h2>

                        <p className="mt-3 text-sm text-slate-300">
                            Version {pricingProfileVersion} will be permanently removed.
                            The currently active pricing version will not be changed.
                        </p>

                        <div className="mt-6 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={handleConfirmCancel}
                                className="rounded-lg border border-red-400/50 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-400/20"
                            >
                                Yes, cancel draft
                            </button>

                            <button
                                type="button"
                                onClick={() => setShowWarning(false)}
                                className="rounded-lg border border-slate-500/50 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5"
                            >
                                Keep draft
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}