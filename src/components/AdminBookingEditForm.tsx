"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formStyles, pageStyles } from "@/styles/classNames";
import type { WheelchairRequirement } from "@/types/wheelchairRequirementType";

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
    infant_seat_count_required: number;
    child_seat_count_required: number;
    booster_seat_count_required: number;
    isofix_required: boolean;
    wheelchair_requirement: WheelchairRequirement;
    wheelchair_passenger_count: number;
    mobility_aid_storage_required: boolean;
    extra_large_luggage_required: boolean;
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
    const [infantSeatCountRequired, setInfantSeatCountRequired] = useState(String(booking.infant_seat_count_required ?? 0));
    const [childSeatCountRequired, setChildSeatCountRequired] = useState(String(booking.child_seat_count_required ?? 0));
    const [boosterSeatCountRequired, setBoosterSeatCountRequired] = useState(String(booking.booster_seat_count_required ?? 0));
    const [isofixRequired, setIsofixRequired] = useState(booking.isofix_required ?? false);
    const [wheelchairRequirement, setWheelchairRequirement] = useState<WheelchairRequirement>(booking.wheelchair_requirement ?? "none");
    const [wheelchairPassengerCount, setWheelchairPassengerCount] = useState(String(booking.wheelchair_passenger_count ?? 0));
    const [mobilityAidStorageRequired, setMobilityAidStorageRequired] = useState(booking.mobility_aid_storage_required ?? false);
    const [extraLargeLuggageRequired, setExtraLargeLuggageRequired] = useState(booking.extra_large_luggage_required ?? false);

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
        body: JSON.stringify({
            clientName, clientEmail, clientPhone, pickupLocation, destination,
            pickupDate, pickupTime, passengers, luggage, tripType, notes,
            status, hasPets, chauffeurId,
            infantSeatCountRequired, childSeatCountRequired, boosterSeatCountRequired,
            isofixRequired, wheelchairRequirement, wheelchairPassengerCount,
            mobilityAidStorageRequired, extraLargeLuggageRequired, }) });

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
    <main>
        <div >
           {successMessage && (<p className={pageStyles.successMsgPage}>{successMessage}</p> )}
            {errorMessage && <p className={pageStyles.errorMsgPage}>{errorMessage}</p>}
        </div>
        <form onSubmit={handleSubmit} className={`${formStyles.sectionCardBorder4} mt-8 text-xs! sm:text-sm!`}>
            <section className="mt-1 rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="text-lg font-semibold text-white">Client information</h2>
                <div className="mt-5 grid gap-5 md:grid-cols-3">
                    <label className={formStyles.label}> Client name
                        <input value={clientName} onChange={(event) => setClientName(event.target.value)} required className={`${formStyles.inputWFullCyan} text-[13px] sm:text-sm`} />
                    </label>
                    <label className={formStyles.label}>  Client email
                        <input type="email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} required className={`${formStyles.inputWFullCyan} text-[13px] sm:text-sm`} />
                    </label>
                    <label className={formStyles.label}>  Client phone 
                        <input value={clientPhone}  onChange={(event) => setClientPhone(event.target.value)} required  className={`${formStyles.inputWFullCyan} text-[13px] sm:text-sm`}  />
                    </label>
                </div>
            </section>

            {/* Explanation: grid-cols-1 controls mobile; md:grid-cols-2 changes it to two columns on larger screens. 
                grid-cols-1 explicitly restricts the mobile column to the available width.*/}
            <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className={formStyles.label}> Location
                        <input value={pickupLocation}  onChange={(event) => setPickupLocation(event.target.value)} required className={`${formStyles.inputWFullCyan} text-xs! sm:text-sm!`}/>
                    </div>
                    <div className={formStyles.label}>  Destination
                        <input  value={destination} onChange={(event) => setDestination(event.target.value)}  required className={`${formStyles.inputWFullCyan} text-xs! sm:text-sm!`}/>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="block">
                            <span className={formStyles.label}>Date</span>
                            <input type="date" value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} required  min={minimumPickupDate} max="2099-12-31" className={`${formStyles.inputWFullCyan} w-35!`} />
                        </label>
                        <label className="block">
                            <span className={formStyles.label}>Time</span>
                            <input type="time" value={pickupTime} onChange={(event) => setPickupTime(event.target.value)} required className={`${formStyles.inputWFullCyan} w-34!`}  />
                        </label>
                        <label className="block">
                            <span className={formStyles.label}>Luggage</span>
                            <input type="number" min="0" value={luggage}  onChange={(event) => setLuggage(event.target.value)} required  className={`${formStyles.inputWFullCyan} w-18!`} /> 
                        </label>
                        <label className="block">
                            <span className={formStyles.label}>Pax</span>
                            <input type="number" min="1" value={passengers} onChange={(event) => setPassengers(event.target.value)} required className={`${formStyles.inputWFullCyan} w-18!`} />  
                        </label>
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                        <div className={formStyles.label}>  Trip type
                            <select value={tripType} onChange={(event) => setTripType(event.target.value)} required className={`${formStyles.selectWFull} min-w-0 max-w-full text-xs! sm:text-sm!`}>
                                {tripTypeOptions.map((typeOption) => ( <option key={typeOption} value={typeOption}> {typeOption} </option>  ))}
                            </select>
                        </div>
                        <div className={formStyles.label}> Booking status
                            <select  value={status}  onChange={(event) => setStatus(event.target.value)}  required  className={formStyles.selectWFull}>
                                {bookingStatusOptions.map((statusOption) => ( <option key={statusOption} value={statusOption}> {statusOption}  </option>  ))}
                            </select>
                        </div>
                    </div>
                    {/* Explanation: min-w-0: allows the grid item and select to shrink inside the mobile form border. 
                        max-w-full: prevents the select from becoming wider than its parent. */}
                    <div className={`${formStyles.label} min-w-0`}>  Assigned chauffeur
                        <select  value={chauffeurId} onChange={(event) => setChauffeurId(event.target.value)} className={`${formStyles.selectWFull} min-w-0 max-w-full text-xs! sm:text-sm!`}>
                            <option value="">No chauffeur assigned</option>
                                {chauffeurs.map((chauffeur) => ( <option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name} - {chauffeur.email} </option> ))  }
                        </select>
                    </div>

                    <div className="flex items-center gap-4 px-4 pb-4 pt-6 text-sm text-slate-300 align-top">
                        <input type="checkbox" checked={hasPets} onChange={(event) => setHasPets(event.target.checked)}  className="h-5 w-5"/>   
                        <div className={formStyles.label}>  has pets  </div>
                    </div>
                            
                    <section className="md:col-span-2 rounded-2xl border border-cyan-400/20 bg-white/5 p-5 text-xs! sm:text-sm!">
                        <h2 className="text-lg font-semibold text-cyan-300">Passenger support</h2>

                        <div className="mt-4 flex flex-wrap items-end gap-3">
                            <label className="block text-xs! sm:text-sm!">
                                <span className={formStyles.label}>Infant seats</span>
                                <input type="number" min="0" value={infantSeatCountRequired} onChange={(event) => setInfantSeatCountRequired(event.target.value)} className={`${formStyles.inputWFullCyan} w-24!`} />
                            </label>

                            <label className="block text-xs! sm:text-sm!">
                                <span className={formStyles.label}>Child seats</span>
                                <input type="number" min="0" value={childSeatCountRequired} onChange={(event) => setChildSeatCountRequired(event.target.value)} className={`${formStyles.inputWFullCyan} w-24!`} />
                            </label>

                            <label className="block text-xs! sm:text-sm!">
                                <span className={formStyles.label}>Booster seats</span>
                                <input type="number" min="0" value={boosterSeatCountRequired} onChange={(event) => setBoosterSeatCountRequired(event.target.value)} className={`${formStyles.inputWFullCyan} w-24!`} />
                            </label>

                            <label className="block text-xs! sm:text-sm!">
                                <span className={formStyles.label}>Wheelchair passengers</span>
                                <input type="number" min={wheelchairRequirement === "remain_in_wheelchair" ? "1" : "0"} value={wheelchairPassengerCount} onChange={(event) => setWheelchairPassengerCount(event.target.value)} disabled={wheelchairRequirement !== "remain_in_wheelchair"} className={`${formStyles.inputWFullCyan} w-24! disabled:opacity-50`} />
                            </label>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 text-xs! sm:text-sm!">
                            <label className="block min-w-0 text-xs! sm:text-sm!">
                                <span className={formStyles.label}>Wheelchair requirement</span>
                                <select className={`${formStyles.selectWFull} w-72! max-w-full`}
                                    value={wheelchairRequirement}
                                    onChange={(event) => {
                                        const nextRequirement = event.target.value as WheelchairRequirement;
                                        setWheelchairRequirement(nextRequirement);
                                        setWheelchairPassengerCount(nextRequirement === "remain_in_wheelchair" ? "1" : "0");
                                    }} >
                                    <option value="none">None</option>
                                    <option value="foldable">Foldable wheelchair</option>
                                    <option value="remain_in_wheelchair">Remain seated in wheelchair</option>
                                </select>
                            </label>

                            <div className="flex flex-wrap items-center gap-4">
                                <label className="flex items-center gap-2 text-xs! sm:text-sm!">
                                    <input type="checkbox" checked={isofixRequired} onChange={(event) => setIsofixRequired(event.target.checked)} className="h-5 w-5" />
                                    ISOFIX required
                                </label>

                                <label className="flex items-center gap-2 text-xs! sm:text-sm!">
                                    <input type="checkbox" checked={mobilityAidStorageRequired} onChange={(event) => setMobilityAidStorageRequired(event.target.checked)} className="h-5 w-5" />
                                    Mobility-aid storage
                                </label>

                                <label className="flex items-center gap-2 text-xs! sm:text-sm!">
                                    <input type="checkbox" checked={extraLargeLuggageRequired} onChange={(event) => setExtraLargeLuggageRequired(event.target.checked)} className="h-5 w-5" />
                                    Extra-large luggage
                                </label>
                            </div>
                        </div>
                    </section>
                    <div className="md:col-span-2"> 
                        <span className={formStyles.span}> Notes </span>
                        <textarea  value={notes}  onChange={(event) => setNotes(event.target.value)}  placeholder="Optional booking notes" className={formStyles.textarea} />
                    </div>
            </div>

            <button type="submit" disabled={isSaving} className={`${formStyles.primaryButtonOutside} mt-6`}  >
                    {isSaving ? "Saving..." : "Save booking"}
            </button>
        </form>
    </main>
  );
}