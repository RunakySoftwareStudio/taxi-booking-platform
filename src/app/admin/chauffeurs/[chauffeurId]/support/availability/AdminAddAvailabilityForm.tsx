"use client";

import {useState} from "react";
import {adminAddAvailability} from "./actions";
import {formStyles, pageStyles} from "@/styles/classNames";

/* Defines the selected chauffeur and permitted availability statuses. */
type Props = {chauffeurId: string; statusOptions: string[]};

/* ============================================================
   ADMIN ADD AVAILABILITY FORM
   Lets an administrator create a manual availability period.
   Requires an explanation for the audit history.
============================================================ */
export default function AdminAddAvailabilityForm({chauffeurId, statusOptions}: Props) {
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [success, setSuccess] = useState(false);

    /* Submit availability through the authorized Server Action. */
    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setMessage("");

        const form = event.currentTarget;
        const result = await adminAddAvailability(new FormData(form));

        setSuccess(result.success);
        setMessage(result.message);
        if (result.success) {form.reset();}
        setSaving(false);
    }

    return (
        <section className={`${formStyles.sectionCardBorder4} mt-6`}>
            <h2 className="mb-4 text-lg font-semibold text-cyan-300">Add availability</h2>

            {message && <p className={success ? pageStyles.successMsgPage : pageStyles.errorMsgPage}>{message}</p>}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <input type="hidden" name="chauffeurId" value={chauffeurId}/>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className={formStyles.label}>
                        Date
                        <input type="date" name="availableDate" required className={formStyles.inputWFullCyan}/>
                    </label>

                    <label className={formStyles.label}>
                        Status
                        <select name="status" required className={formStyles.selectWFull}>
                            {statusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                    </label>

                    <label className={formStyles.label}>
                        Start time
                        <input type="time" name="startTime" required className={formStyles.inputWFullCyan}/>
                    </label>

                    <label className={formStyles.label}>
                        End time
                        <input type="time" name="endTime" required className={formStyles.inputWFullCyan}/>
                    </label>
                </div>

                <label className={formStyles.label}>
                    Notes
                    <textarea name="notes" className={formStyles.textarea}/>
                </label>

                <label className={formStyles.label}>
                    Reason for Admin change (required)
                    <textarea name="reason" required className={formStyles.textarea}/>
                </label>

                <button type="submit" disabled={saving} className={formStyles.primaryButtonOutside}>
                    {saving ? "Saving..." : "Add availability"}
                </button>
            </form>
        </section>
    );
}
