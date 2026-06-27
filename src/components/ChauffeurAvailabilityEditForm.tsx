"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formStyles, pageStyles } from "@/styles/classNames";

type AvailabilityForEdit = {
  id: string;
  chauffeur_id: string;
  available_date: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
};

type ChauffeurAvailabilityEditFormProps = {
  chauffeurId: string;
  availability: AvailabilityForEdit;
  statusOptions: string[];
};

function formatTimeForInput(timeValue: string) {  return timeValue.slice(0, 5);}
function timeToMinutes(timeValue: string) {
  const [hour, minute] = timeValue.split(":").map(Number);
  return hour * 60 + minute;
}

function getTodayDateInputValue() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export default function ChauffeurAvailabilityEditForm({ chauffeurId, availability, statusOptions,}: ChauffeurAvailabilityEditFormProps) {
  const router = useRouter();

  const [availableDate, setAvailableDate] = useState( availability.available_date );
  const [startTime, setStartTime] = useState( formatTimeForInput(availability.start_time) );
  const [endTime, setEndTime] = useState( formatTimeForInput(availability.end_time) );
  const [status, setStatus] = useState(availability.status);
  const [notes, setNotes] = useState(availability.notes ?? "");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

    /*=======================================================================================
        If AvailableDate exists AND AvailableDate is earlier than today,use AvailableDate as the minimum date.
        Otherwise,use todayDate as the minimum date.
        availability.available_date is the original date from the database. It does not change while you type.
    =======================================================================================*/
    const todayDate = getTodayDateInputValue();
    //const minimumAvailableDate =  availableDate && availableDate < todayDate ? availableDate : todayDate;
    const minimumAvailableDate =   availability.available_date && availability.available_date < todayDate
        ? availability.available_date
        : todayDate;
        
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSuccessMessage("");
    setErrorMessage("");
    setIsSaving(true);
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
        setErrorMessage("Start time must be earlier than end time.");
        setIsSaving(false);
        return;
    }
    try {
        const response = await fetch( `/api/chauffeur/${chauffeurId}/availability/${availability.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", },
            body: JSON.stringify({ availableDate, startTime, endTime, status, notes, }), }
        );

        const result = await response.json();

        if (!response.ok) {setErrorMessage(result.message || "Could not update availability."); return; }

        setSuccessMessage("Availability updated successfully.");
        router.refresh();
    } 
    catch (error)  {
      console.error("Could not update availability:", error);
      setErrorMessage("Could not update availability. Please try again.");
    } 
    finally { setIsSaving(false);}
  }

  return (
    <main>
        <div >
           {successMessage && (<p className={pageStyles.successMsgPage}>{successMessage}</p> )}
            {errorMessage && <p className={pageStyles.errorMsgPage}>{errorMessage}</p>}
        </div>
        <form onSubmit={handleSubmit} className={`${formStyles.sectionCardBorder4} mt-8`}>
            <div className="grid gap-5 md:grid-cols-2">

                <div className="flex flex-wrap items-end gap-2 grid grid-cols-2">
                    <div className="block">
                        <span className={formStyles.label}>Date</span>
                        <input type="date" value={availableDate} onChange={(event) => setAvailableDate(event.target.value)} required  min={minimumAvailableDate} max="2099-12-31"  className={formStyles.inputWFullCyan}/>
                    </div>
                    <div className="block">
                        <span className={formStyles.label}>Start time</span>
                        <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required className={formStyles.inputWFullCyan} />
                    </div>

                    <div className="block">
                        <span className={formStyles.label}>End time</span>
                        <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required className={formStyles.inputWFullCyan} />
                    </div>
                    <div className={formStyles.label}> Status
                        <select  value={status}  onChange={(event) => setStatus(event.target.value)}  required  className={formStyles.selectWFull}>
                            {statusOptions.map((statusOption) => (  <option key={statusOption} value={statusOption}> {statusOption} </option> ))}
                        </select>
                    </div>
                </div>

                <div className="md:col-span-2"> 
                    <span className={formStyles.span}> Notes </span>
                    <textarea  value={notes}  onChange={(event) => setNotes(event.target.value)}  placeholder="Optional booking notes" className={formStyles.textarea} />
                </div>

            </div>
        <button  type="submit" disabled={isSaving} className={`${formStyles.primaryButtonOutside} mt-6`}>
            {isSaving ? "Saving..." : "Save availability"}
        </button>
        </form>
    </main>
  );
}