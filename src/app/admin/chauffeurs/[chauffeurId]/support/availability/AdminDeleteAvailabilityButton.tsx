"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {adminDeleteAvailability} from "./actions";
import {pageStyles} from "@/styles/classNames";

type Props = {chauffeurId: string; availabilityId: string};

/* ============================================================
   ADMIN DELETE AVAILABILITY BUTTON
   Displays confirmation and a required reason directly in
   the availability list before calling the protected action.
============================================================ */
export default function AdminDeleteAvailabilityButton({chauffeurId, availabilityId}: Props) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    /* Cancel deletion without changing the database. */
    function cancelDelete() {
        setConfirming(false);
        setReason("");
        setErrorMessage("");
    }

    /* Submit deletion only after explicit confirmation. */
    async function handleDelete(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving || !confirming) {return;}

        setSaving(true);
        setErrorMessage("");

        try {
            const formData = new FormData();
            formData.set("chauffeurId", chauffeurId);
            formData.set("availabilityId", availabilityId);
            formData.set("reason", reason);

            const result = await adminDeleteAvailability(formData);

            if (!result.success) {
                setErrorMessage(result.message);
                return;
            }

            setConfirming(false);
            setReason("");
            router.refresh();
        } catch (error) {
            console.error("Could not delete availability:", error);
            setErrorMessage("An unexpected error occurred.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-2">
            {!confirming ? (
                <button type="button" onClick={() => setConfirming(true)}
                    className="text-sm font-semibold text-red-400 hover:text-red-300">
                    Delete
                </button>
            ) : (
                <form onSubmit={handleDelete} className="min-w-48 space-y-2">
                    <p className="text-xs font-semibold text-red-300">Delete this availability period?</p>

                    <textarea required minLength={5} maxLength={1000}
                        aria-label="Reason for deletion"
                        placeholder="Reason for deletion"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        className="w-full rounded-md border border-red-500/40 bg-slate-950 p-2 text-sm text-white"/>

                    {errorMessage && <p className={pageStyles.errorMsgPage}>{errorMessage}</p>}

                    <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={saving}
                            className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                            {saving ? "Deleting..." : "Confirm"}
                        </button>
                        <button type="button" disabled={saving} onClick={cancelDelete}
                            className="rounded-md border border-slate-500 px-3 py-1.5 text-xs text-slate-200">
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
