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
};

export default function AdminVehicleEditForm({vehicle, chauffeurs, vehicleTypeOptions,}: AdminVehicleEditFormProps) {
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
            body: JSON.stringify({ chauffeurId, vehicleType, brand, model, licensePlate, seats, luggageCapacity, vehicleYear, vehicleColor})});
            
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
                            {chauffeurs.map((chauffeur) => (<option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name} — {chauffeur.email} ({chauffeur.account_status}) </option>  ))}
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
                    <label  className={formStyles.formInfoCellCaption}> Model
                        <input value={model} onChange={(event) => setModel(event.target.value)} required className={formStyles.inputWFullCyan}/>
                    </label >
                    <label  className={formStyles.formInfoCellCaption}> License plate
                        <input value={licensePlate} onChange={(event) => setLicensePlate(event.target.value)} required className={formStyles.inputWFullCyan} />
                    </label >
                    <div className="grid gap-5 md:grid-cols-2"> 
                        <label  className={formStyles.formInfoCellCaption}> Seats
                            <input value={seats} onChange={(event) => setSeats(event.target.value)} type="number" min="1" required className={formStyles.inputWFullCyan}/>
                        </label >
                        <label  className={formStyles.formInfoCellCaption}> Luggage capacity
                            <input value={luggageCapacity} onChange={(event) => setLuggageCapacity(event.target.value)} type="number"  min="0" required className={formStyles.inputWFullCyan} />
                        </label >
                    </div>
                    <div className="grid gap-5 md:grid-cols-2"> 
                        <label  className={formStyles.formInfoCellCaption}> Color
                            <input value={vehicleColor} onChange={(event) => setVehicleColor(event.target.value)} className={formStyles.input}/>
                        </label >
                        <label  className={formStyles.formInfoCellCaption}> Year
                            <input  value={vehicleYear}  onChange={(event) => setVehicleYear(event.target.value)} type="number" min="1980"  max="2100"  className={formStyles.input}/>   
                        </label >
                    </div>
            </div>
            <button type="submit" disabled={isSaving} className={`${formStyles.primaryButtonOutside} mt-6`} >
                {isSaving ? "Saving..." : "Save vehicle details"}
            </button>
        </form>
    </main>
  );
}