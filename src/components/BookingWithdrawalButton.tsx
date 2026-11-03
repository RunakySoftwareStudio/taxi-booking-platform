"use client";

import { useRef, useState, type ReactNode } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { getTranslation } from "@/lib/i18n/translations";

/*
    CHAUFFEUR BOOKING WITHDRAWAL CONFIRMATION

    Opens a multilingual confirmation dialog before submitting
    the surrounding chauffeur withdrawal form.

    Closing the dialog does not submit the form.
    The protected server action performs the actual withdrawal.
*/
type BookingWithdrawalButtonProps = {
    children: ReactNode;
    className?: string;
};

export default function BookingWithdrawalButton({children, className,}: BookingWithdrawalButtonProps) {
    const { languageCode } = useLanguage();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    /* Resolve the confirmation message in the selected language. */
    const confirmationMessage = getTranslation(
        "chauffeurDashboardPage",
        "bookingWithdrawalConfirm",
        languageCode
    );

    /* Open confirmation without submitting the form. */
    function handleOpenConfirmation() {
        dialogRef.current?.showModal();
    }

    /* Submit the surrounding withdrawal form after confirmation. */
    function handleConfirm() {
        if (isSubmitting) return;

        const form = dialogRef.current?.closest("form");
        if (!form) return;

        setIsSubmitting(true);
        dialogRef.current?.close();
        form.requestSubmit();
    }

    return (
        <>
            <button type="button" className={className} onClick={handleOpenConfirmation}>
                {children}
            </button>

            <dialog ref={dialogRef}
                onClose={() => {if (!isSubmitting) setIsSubmitting(false); }}
                className="m-auto w-[min(92vw,440px)] max-h-[90dvh] overflow-y-auto rounded-xl border border-cyan-700 bg-slate-900 p-6 text-white shadow-2xl backdrop:bg-black/70"
                style={{ position: "fixed", inset: "0", margin: "auto" }}
            >
                <h2 className="text-lg font-semibold text-cyan-300">
                    {getTranslation("chauffeurDashboardPage","withdrawBookingButton", languageCode)}?
                </h2>

                <p className="mt-4 text-sm leading-6 text-slate-200">
                    {confirmationMessage}
                </p>

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={() => dialogRef.current?.close()}
                        className="rounded-lg border border-slate-500 px-4 py-2 text-sm text-white hover:bg-slate-800"
                    >
                        {getTranslation("chauffeurDashboardPage", "bookingWithdrawalCancel",languageCode)}
                    </button>

                    <button type="button" onClick={handleConfirm} disabled={isSubmitting}
                        className="rounded-lg border border-cyan-600 bg-cyan-800 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
                    >
                        {getTranslation("chauffeurDashboardPage","bookingWithdrawalConfirmButton", languageCode)}
                    </button>
                </div>
            </dialog>
        </>
    );
}