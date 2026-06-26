"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formStyles, pageStyles } from "@/styles/classNames";

type BookingForEdit = {
  id: string;
  pickup_location: string;
  destination: string;
  pickup_date: string;
  pickup_time: string;
  passengers: number;
  luggage: number | null;
  trip_type: string;
  notes: string | null;
  status: string;
  has_pets: boolean; 
  chauffeur_id: string | null;
  clients: {
    name: string;
    email: string;
    phone: string;
  } | null;
};

type ChauffeurOption = {
  id: string;
  name: string;
  email: string;
  account_status: string;
};

type AdminBookingEditFormProps = {
    booking: BookingForEdit;
    chauffeurs: ChauffeurOption[];
    bookingStatusOptions: string[];
    tripTypeOptions: string[];
};

//function formatTimeForInput(timeValue: string) { return timeValue.slice(0, 5);}
function formatTimeForInput(timeValue?: string | null) { if (!timeValue) { return ""; }  return timeValue.slice(0, 5);}
function getTodayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function AdminBookingEditForm({booking, chauffeurs, bookingStatusOptions, tripTypeOptions}: AdminBookingEditFormProps) {
    const router = useRouter();
    const [pickupLocation, setPickupLocation] = useState( booking.pickup_location ?? "");
    const [destination, setDestination] = useState(booking.destination);
    const [pickupDate, setPickupDate] = useState(booking.pickup_date ?? "");
    const [pickupTime, setPickupTime] = useState( formatTimeForInput(booking.pickup_time));
    const [passengers, setPassengers] = useState(String(booking.passengers));
    const [luggage, setLuggage] = useState(String(booking.luggage ?? 0));
    const [tripType, setTripType] = useState(booking.trip_type);
    const [notes, setNotes] = useState(booking.notes ?? "");
    const [status, setStatus] = useState(booking.status);
    const [chauffeurId, setChauffeurId] = useState(booking.chauffeur_id ?? "");
    const [clientName, setClientName] = useState(booking.clients?.name ?? "");
    const [clientEmail, setClientEmail] = useState(booking.clients?.email ?? "");
    const [clientPhone, setClientPhone] = useState(booking.clients?.phone ?? "");
    const [hasPets, setHasPets] = useState(booking.has_pets ?? false);


    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
   const [isSaving, setIsSaving] = useState(false);

    /*=======================================================================================
        If pickupDate exists AND pickupDate is earlier than today,use pickupDate as the minimum date.
         Otherwise,use todayDate as the minimum date.
    =======================================================================================*/
    const todayDate = getTodayDateInputValue();
    const minimumPickupDate = booking.pickup_date && booking.pickup_date < todayDate ? booking.pickup_date : todayDate;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSuccessMessage("");
    setErrorMessage("");
    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json", },
        body: JSON.stringify({clientName, clientEmail, clientPhone, pickupLocation, destination, pickupDate, pickupTime,
                                passengers, luggage,tripType,notes,status, hasPets,chauffeurId, }), });

      const result = await response.json();
      if (!response.ok) {setErrorMessage(result.message || "Could not update booking."); return; }

      setSuccessMessage("Booking updated successfully.");
      router.refresh();
    } 
    catch (error) {
      console.error("Could not update booking:", error);
      setErrorMessage("Could not update booking. Please try again.");
    } 
    finally { setIsSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className={`${formStyles.sectionCardBorder4} mt-8`}>
      {successMessage && (<p className={pageStyles.successMsgPage}>{successMessage}</p>)}
      {errorMessage && <p className={pageStyles.errorMsgPage}>{errorMessage}</p>}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Client information</h2>
            <div className="mt-5 grid gap-5 md:grid-cols-3">
                    <label className={formStyles.label}> Client name
                        <input value={clientName} onChange={(event) => setClientName(event.target.value)} required className={formStyles.inputWFullCyan} />
                    </label>
                    <label className={formStyles.label}>  Client email
                        <input type="email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} required className={formStyles.inputWFullCyan} />
                    </label>
                    <label className={formStyles.label}>  Client phone 
                        <input value={clientPhone}  onChange={(event) => setClientPhone(event.target.value)} required  className={formStyles.inputWFullCyan}  />
                    </label>
            </div>
        </section>

        <div className="mt-3 grid gap-5 md:grid-cols-2">
                <div className={formStyles.formInfoCellCaption}> Location
                    <input value={pickupLocation}  onChange={(event) => setPickupLocation(event.target.value)} required className={formStyles.inputWFullCyan}/>
                </div>

                <div className={formStyles.formInfoCellCaption}>  Destination
                    <input  value={destination} onChange={(event) => setDestination(event.target.value)}  required className={formStyles.inputWFullCyan}/>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                    <div>
                        <span className={formStyles.formInfoCellCaption}> Date
                            <input type="date" value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} required  min={minimumPickupDate} max="2099-12-31" className={formStyles.inputWFullCyan}/>
                        </span >
                    </div>
                    <div>
                        <span  className={formStyles.formInfoCellCaption}> Time
                            <input type="time" value={pickupTime}onChange={(event) => setPickupTime(event.target.value)} required className={formStyles.inputWFullCyan} />
                        </span> 
                    </div>
                </div>


                <div className="grid gap-5 md:grid-cols-2"> 
                    <div className={formStyles.formInfoCellCaption}> Passengers
                        <input type="number" min="1" value={passengers} onChange={(event) => setPassengers(event.target.value)} required className={formStyles.input} />   
                    </div>
                    <div className={formStyles.formInfoCellCaption}> Luggage
                        <input type="number" min="0" value={luggage}  onChange={(event) => setLuggage(event.target.value)} required  className={formStyles.input} />  
                    </div>
                </div>

                <div className={formStyles.formInfoCellCaption}>  Trip type
                    <select value={tripType} onChange={(event) => setTripType(event.target.value)} required className={formStyles.selectWFull} >
                        {tripTypeOptions.map((typeOption) => ( <option key={typeOption} value={typeOption}> {typeOption} </option>  ))}
                    </select>
                </div>

                <div className={formStyles.formInfoCellCaption}> Booking status
                    <select  value={status}  onChange={(event) => setStatus(event.target.value)}  required  className={formStyles.selectWFull}>
                        {bookingStatusOptions.map((statusOption) => ( <option key={statusOption} value={statusOption}> {statusOption}  </option>  ))}
                    </select>
                </div>

                <div className={formStyles.formInfoCellCaption}>  Assigned chauffeur
                    <select  value={chauffeurId} onChange={(event) => setChauffeurId(event.target.value)} className={formStyles.selectWFull} >
                        <option value="">No chauffeur assigned</option>
                            {chauffeurs.map((chauffeur) => ( <option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name} — {chauffeur.email} ({chauffeur.account_status}) </option> ))  }
                    </select>
                </div>
                <label className="flex items-center gap-3 text-sm text-white">                       
                    <input type="checkbox" checked={hasPets} onChange={(event) => setHasPets(event.target.checked)}  className="h-5 w-5"/>   
                    has pets     
                </label>
                <div className="md:col-span-2"> 
                    <span className={formStyles.span}> Notes </span>
                    <textarea  value={notes}  onChange={(event) => setNotes(event.target.value)}  placeholder="Optional booking notes" className={formStyles.textarea} />
                </div>
        </div>

        <button type="submit" disabled={isSaving} className={`${formStyles.primaryButtonOutside} mt-6`}  >
                {isSaving ? "Saving..." : "Save booking"}
        </button>
    </form>
  );
}