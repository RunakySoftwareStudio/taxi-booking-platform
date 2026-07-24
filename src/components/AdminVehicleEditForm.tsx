"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formStyles, pageStyles } from "@/styles/classNames";

type VehicleForEdit = {
    id: string;
    chauffeur_id: string;
    brand: string;
    model: string;
    license_plate: string;
    vehicle_type: string;
    seats: number;
    luggage_capacity: number;
    vehicle_year: number | null;
    vehicle_color: string | null;
    infant_seat_count: number;
    child_seat_count: number;
    booster_seat_count: number;
    isofix_available: boolean;
    wheelchair_access: string;
    wheelchair_capacity: number;
    mobility_aid_storage: boolean;
    extra_large_luggage: boolean;
    vehicle_status: string;
    status_reason: string | null;
    status_changed_at: string;
};

type ChauffeurOption = {
    id: string;
    name: string;
    email: string;
    account_status: string;
};

type AdminVehicleEditFormProps = {
    vehicle: VehicleForEdit;
    chauffeurs: ChauffeurOption[];
    vehicleTypeOptions: string[];
    wheelchairAccessOptions: string[];
    vehicleStatusOptions: string[];
};

export default function AdminVehicleEditForm({vehicle, chauffeurs, vehicleTypeOptions, wheelchairAccessOptions,vehicleStatusOptions,}: AdminVehicleEditFormProps) {
    const router = useRouter();
    const [chauffeurId, setChauffeurId] = useState(vehicle.chauffeur_id);
    const [vehicleType, setVehicleType] = useState(vehicle.vehicle_type);
    const [brand, setBrand] = useState(vehicle.brand);
    const [model, setModel] = useState(vehicle.model);
    const [licensePlate, setLicensePlate] = useState(vehicle.license_plate);
    const [seats, setSeats] = useState(String(vehicle.seats));
    const [luggageCapacity, setLuggageCapacity] = useState( String(vehicle.luggage_capacity) );
    const [vehicleYear, setVehicleYear] = useState( vehicle.vehicle_year ? String(vehicle.vehicle_year) : ""  );
    const [vehicleColor, setVehicleColor] = useState(vehicle.vehicle_color ?? "");
    const [infantSeatCount, setInfantSeatCount] = useState(String(vehicle.infant_seat_count));
    const [childSeatCount, setChildSeatCount] = useState(String(vehicle.child_seat_count));
    const [boosterSeatCount, setBoosterSeatCount] = useState(String(vehicle.booster_seat_count));
    const [isofixAvailable, setIsofixAvailable] = useState(vehicle.isofix_available);
    const [wheelchairAccess, setWheelchairAccess] = useState(vehicle.wheelchair_access);
    const [wheelchairCapacity, setWheelchairCapacity] = useState(String(vehicle.wheelchair_capacity));
    const [mobilityAidStorage, setMobilityAidStorage] = useState(vehicle.mobility_aid_storage);
    const [extraLargeLuggage, setExtraLargeLuggage] = useState(vehicle.extra_large_luggage);
    const [vehicleStatus, setVehicleStatus] = useState(vehicle.vehicle_status);
    const [statusReason, setStatusReason] = useState(vehicle.status_reason ?? "");
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");
    setIsSaving(true);

    try {
        const response = await fetch(`/api/admin/vehicles/${vehicle.id}`, {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                chauffeurId, vehicleType, brand, model, licensePlate, seats, luggageCapacity, vehicleYear, vehicleColor,
                infantSeatCount, childSeatCount, boosterSeatCount, isofixAvailable, wheelchairAccess,
                wheelchairCapacity, mobilityAidStorage, extraLargeLuggage,
                vehicleStatus, statusReason}),
        });

        const result = await response.json();
        if (!response.ok) { setErrorMessage(result.message || "Could not update vehicle.");  return; }

        setSuccessMessage("Vehicle details updated successfully.");
        router.refresh();
    }
    catch (error) {
        console.error("Could not update vehicle:", error);
        setErrorMessage("Could not update vehicle. Please try again.");
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
                    <label  className={formStyles.formInfoCellCaption}>  Chauffeur
                        <select value={chauffeurId}  onChange={(event) => setChauffeurId(event.target.value)} required  className={formStyles.selectWFull} >
                            {chauffeurs.map((chauffeur) => (<option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name} ({chauffeur.account_status}) </option>  ))}
                        </select>
                    </label >
                    <label  className={formStyles.formInfoCellCaption}> Vehicle type
                        <select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)} required className={formStyles.selectWFull} >
                            {vehicleTypeOptions.map((typeOption) => ( <option key={typeOption} value={typeOption}>  {typeOption} </option> ))}
                        </select>
                    </label >

                    <label  className={formStyles.formInfoCellCaption}> Brand
                        <input value={brand} onChange={(event) => setBrand(event.target.value)}  required className={formStyles.inputWFullCyan} />
                    </label >
                    <label className="block">
                      <span className={formStyles.span}>Model</span>
                      <input value={model} onChange={(event) => setModel(event.target.value)} required className={formStyles.inputWFullCyan}/>
                    </label>

                    <label className="block">
                      <span className={formStyles.span}>License Plate</span>
                      <input value={licensePlate} onChange={(event) => setLicensePlate(event.target.value)} required className={formStyles.inputWFullCyan} />
                    </label>

                    <div className="flex flex-wrap items-end gap-2">
                        <label className="block">
                          <span className={formStyles.span}>Seats</span>
                        <input value={seats} onChange={(event) => setSeats(event.target.value)} type="number" min="1" required  className={`${formStyles.inputNumber} w-18!`}  />
                        </label>

                        <label className="block">
                          <span className={formStyles.span}>Luggage</span>
                        <input  value={luggageCapacity} onChange={(event) => setLuggageCapacity(event.target.value)} type="number"  min="0" required  className={`${formStyles.inputNumber} w-18!`}  />
                        </label>

                        <label className="block">
                          <span className={formStyles.span}>Year</span>
                          <input  value={vehicleYear}  onChange={(event) => setVehicleYear(event.target.value)} type="number" min="1980"  max="2100"
                                className={`${formStyles.inputNumber} w-24!`} placeholder="2024" />
                        </label>
                        <label className="block">
                            <span className={formStyles.span}>Color</span>
                            <input value={vehicleColor} onChange={(event) => setVehicleColor(event.target.value)}  className={`${formStyles.inputNumber} w-24!`} />
                        </label>
                    </div>
                    {/*======Operational status========*/}
                    <label className={formStyles.formInfoCellCaption}> Operational status
                        <select value={vehicleStatus}
                            onChange={(event) => {const newStatus = event.target.value;  setVehicleStatus(newStatus); if (newStatus === "available") { setStatusReason(""); }
}}                          required className={formStyles.selectWFull}>
                            {vehicleStatusOptions.map((statusOption) => (<option key={statusOption} value={statusOption}>{statusOption}</option> ))}
                        </select>
                    </label>
                    <label className="block md:col-span-1">
                        <span className={formStyles.span}>Operational status reason</span>
                        <textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)}
                            placeholder="For example: damaged tyre or scheduled maintenance"  rows={3}  className={formStyles.textarea}
                        />
                    </label>

                    {/*=======Passenger support=========*/}
                    <div className="md:col-span-2 rounded-xl border border-cyan-400/20 p-4">
                        <h3 className="font-semibold text-cyan-300">Passenger support</h3>

                        <div className="mt-4 grid gap-4 md:grid-cols-3">
                            <div className="flex flex-wrap items-end gap-3 md:col-span-2">
                                <label className="block">
                                    <span className={formStyles.span}>Infant seats</span>
                                    <input value={infantSeatCount} onChange={(event) => setInfantSeatCount(event.target.value)} type="number" min="0" className={`${formStyles.inputNumber} w-24!`} />
                                </label>

                                <label className="block">
                                    <span className={formStyles.span}>Child seats</span>
                                    <input value={childSeatCount} onChange={(event) => setChildSeatCount(event.target.value)} type="number" min="0" className={`${formStyles.inputNumber} w-24!`} />
                                </label>

                                <label className="block">
                                    <span className={formStyles.span}>Booster seats</span>
                                    <input value={boosterSeatCount} onChange={(event) => setBoosterSeatCount(event.target.value)} type="number" min="0" className={`${formStyles.inputNumber} w-24!`} />
                                </label>

                                <label className="block">
                                    <span className={formStyles.span}>Wheelchair capacity</span>
                                    <input value={wheelchairCapacity} onChange={(event) => setWheelchairCapacity(event.target.value)} type="number" min="0" className={`${formStyles.inputNumber} w-24!`} />
                                </label>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 self-center">
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={isofixAvailable} onChange={(event) => setIsofixAvailable(event.target.checked)} />
                                    ISOFIX available
                                </label>

                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={mobilityAidStorage} onChange={(event) => setMobilityAidStorage(event.target.checked)} />
                                    Mobility-aid storage
                                </label>

                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={extraLargeLuggage} onChange={(event) => setExtraLargeLuggage(event.target.checked)} />
                                    Extra-large luggage
                                </label>
                            </div>

                            <label className="block md:col-span-2">
                                <span className={formStyles.span}>Wheelchair access</span>
                                <select value={wheelchairAccess} onChange={(event) => setWheelchairAccess(event.target.value)} className={`${formStyles.selectWFull} w-72! max-w-full`}>
                                    {wheelchairAccessOptions.map((accessType) => (<option key={accessType} value={accessType}>{accessType}</option>))}
                                </select>
                            </label>
                        </div>
                    </div>
            </div>
            <button type="submit" disabled={isSaving} className={`${formStyles.primaryButtonOutside} mt-6`} >
                {isSaving ? "Saving..." : "Save vehicle details"}
            </button>
        </form>
    </main>
  );
}