"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {adminUpdateAvailability} from "../actions";
import {formStyles, pageStyles} from "@/styles/classNames";

/* Defines the existing manual availability record. */
type AvailabilityRow = {
    id: string;
    available_date: string;
    start_time: string;
    end_time: string;
    status: string;
    notes: string | null;
};

type Props = {
    chauffeurId: string;
    availability: AvailabilityRow;
    statusOptions: string[];
};

/* Converts database time (HH:mm:ss) into HTML input time (HH:mm). */
function formatTimeForInput(timeValue: string) {return timeValue.slice(0, 5);}

/* ============================================================
   ADMIN AVAILABILITY EDIT FORM
   Updates manually entered chauffeur availability through
   the authorized Server Action with atomic audit logging.
============================================================ */
export default function AdminAvailabilityEditForm({chauffeurId, availability, statusOptions}: Props) {
    const router = useRouter();

    /* Initialize the form with the existing database values. */
    const [availableDate, setAvailableDate] = useState(availability.available_date);
    const [startTime, setStartTime] = useState(formatTimeForInput(availability.start_time));
    const [endTime, setEndTime] = useState(formatTimeForInput(availability.end_time));
    const [status, setStatus] = useState(availability.status);
    const [notes, setNotes] = useState(availability.notes ?? "");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [success, setSuccess] = useState(false);

    /* Submit modifications using the protected Admin Update Server Action. */
    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) {return;}

        setSaving(true);
        setMessage("");

        try {
            const formData = new FormData();
            formData.set("chauffeurId", chauffeurId);
            formData.set("availabilityId", availability.id);
            formData.set("availableDate", availableDate);
            formData.set("startTime", startTime);
            formData.set("endTime", endTime);
            formData.set("status", status);
            formData.set("notes", notes);
            formData.set("reason", reason);

            const result = await adminUpdateAvailability(formData);
            setSuccess(result.success);
            setMessage(result.message);

            if (result.success) {
                setReason("");
                router.refresh();
            }
        } catch (error) {
            console.error("Could not update Admin availability:", error);
            setSuccess(false);
            setMessage("An unexpected error occurred while saving availability.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className={`${formStyles.sectionCardBorder4} mt-6`}>
            <h2 className="mb-4 text-lg font-semibold text-cyan-300">Edit availability</h2>

            {message && <p className={success ? pageStyles.successMsgPage : pageStyles.errorMsgPage}>{message}</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className={formStyles.label}>
                        Date
                        <input type="date" required value={availableDate} onChange={(event) => setAvailableDate(event.target.value)} className={formStyles.inputWFullCyan}/>
                    </label>

                    <label className={formStyles.label}>
                        Status
                        <select required value={status} onChange={(event) => setStatus(event.target.value)} className={formStyles.selectWFull}>
                            {statusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                    </label>

                    <label className={formStyles.label}>
                        Start time
                        <input type="time" required value={startTime} onChange={(event) => setStartTime(event.target.value)} className={formStyles.inputWFullCyan}/>
                    </label>

                    <label className={formStyles.label}>
                        End time
                        <input type="time" required value={endTime} onChange={(event) => setEndTime(event.target.value)} className={formStyles.inputWFullCyan}/>
                    </label>
                </div>

                <label className={formStyles.label}>
                    Notes
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={formStyles.textarea}/>
                </label>

                <label className={formStyles.label}>
                    Reason for Admin change (required)
                    <textarea required value={reason} onChange={(event) => setReason(event.target.value)} className={formStyles.textarea}/>
                </label>

                <button type="submit" disabled={saving} className={formStyles.primaryButtonOutside}>
                    {saving ? "Saving..." : "Save availability changes"}
                </button>
            </form>
        </section>
    );
}
