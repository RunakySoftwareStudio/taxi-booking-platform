
import Link from "next/link";
import { formStyles } from "@/styles/classNames";
import { addVehicle } from "@/app/admin/vehicles/new/actions";
/* ============================================================
   ADMIN VEHICLE CREATE FORM

   Displays the vehicle registration form in three sections:
   1. Chauffeur assignment
   2. Vehicle information
   3. Passenger support

   The form will connect to a protected Server Action.
============================================================ */

type ChauffeurOption = { id: string; name: string; email: string; };

/* Stores values returned by the Server Action after failed registration. */
type VehicleFormValues = {
    chauffeurId?: string; vehicleType?: string; brand?: string; model?: string;
    licensePlate?: string; seats?: string; luggageCapacity?: string;
    vehicleYear?: string; vehicleColor?: string;
    infantSeatCount?: string; childSeatCount?: string; boosterSeatCount?: string;
    isofixAvailable?: string; wheelchairAccess?: string; wheelchairCapacity?: string;
    mobilityAidStorage?: string; extraLargeLuggage?: string;
};

/* Defines the registration form's dropdown data and restored values. */
type AdminVehicleCreateFormProps = {
    chauffeurs: ChauffeurOption[];
    vehicleTypeOptions: string[];
    formValues: VehicleFormValues;
};

/* Displays the registration form and its chauffeur selection. */
/* Displays the registration form and restores values after validation errors. */
export default function AdminVehicleCreateForm({chauffeurs, vehicleTypeOptions, formValues}: AdminVehicleCreateFormProps) {
    return (
            <form action={addVehicle} className={`${formStyles.form} mt-8`}> {/* Submits vehicle registration to the protected Admin Server Action. */}

            {/* ===== SECTION 1: CHAUFFEUR ASSIGNMENT ===== */}
            <section className="rounded-xl border border-cyan-400/30 p-5">
                <h2 className="mb-5 text-lg font-semibold text-cyan-300">1. Chauffeur assignment</h2>

                <label className="block">
                    <span className={formStyles.span}>Chauffeur *</span>
                    <select name="chauffeurId" required defaultValue={formValues.chauffeurId ?? ""} className={formStyles.selectWFull}>
                        <option value="">Select chauffeur</option>
                        {chauffeurs.map((chauffeur) => (
                            <option key={chauffeur.id} value={chauffeur.id}>{chauffeur.name} - {chauffeur.email}</option>
                        ))}
                    </select>
                </label>
            </section>

            {/* ===== SECTION 2: VEHICLE INFORMATION ===== */}
            <section className="rounded-xl border border-cyan-400/30 p-5">
                <h2 className="mb-5 text-lg font-semibold text-cyan-300">2. Vehicle information</h2>

                <div className="grid gap-5 md:grid-cols-2">
                    {/* Vehicle category and identification fields. */}
                    <label className="block">
                        <span className={formStyles.span}>Vehicle type *</span>
                        <select name="vehicleType" required defaultValue={formValues.vehicleType ?? ""} className={formStyles.selectWFull}>
                            <option value="">Select vehicle type</option>
                            {vehicleTypeOptions.map((vehicleType) => (
                                <option key={vehicleType} value={vehicleType}>{vehicleType}</option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className={formStyles.span}>Brand *</span>
                        <input name="brand" required placeholder="Example: Mercedes" defaultValue={formValues.brand ?? ""} className={formStyles.inputWFullCyan} />
                    </label>

                    <label className="block">
                        <span className={formStyles.span}>Model *</span>
                        <input name="model" required placeholder="Example: Vito" defaultValue={formValues.model ?? ""} className={formStyles.inputWFullCyan} />
                    </label>

                    <label className="block">
                        <span className={formStyles.span}>License plate *</span>
                        <input name="licensePlate" required placeholder="Example: G-123-AB" defaultValue={formValues.licensePlate ?? ""} className={formStyles.inputWFullCyan} />
                    </label>

                    {/* Vehicle capacity and additional descriptive information. */}
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="block">
                            <span className={formStyles.span}>Seats *</span>
                            <input name="seats" type="number" min="1" defaultValue={formValues.seats ?? "4"} required className={`${formStyles.inputNumber} w-20!`} />
                        </label>

                        <label className="block">
                            <span className={formStyles.span}>Luggage *</span>
                            <input name="luggageCapacity" type="number" min="0" defaultValue={formValues.luggageCapacity ?? "4"} required className={`${formStyles.inputNumber} w-20!`} />
                        </label>

                        <label className="block">
                            <span className={formStyles.span}>Year</span>
                            <input name="vehicleYear" type="number" min="1980" max="2100" placeholder="2024" defaultValue={formValues.vehicleYear ?? ""} className={`${formStyles.inputNumber} w-24!`} />
                        </label>

                        <label className="block">
                            <span className={formStyles.span}>Color</span>
                            <input name="vehicleColor" placeholder="Black" defaultValue={formValues.vehicleColor ?? ""} className={`${formStyles.inputWFullCyan} w-28!`} />
                        </label>
                    </div>
                </div>
            </section>

            {/* ===== SECTION 3: PASSENGER SUPPORT ===== */}
            <section className="rounded-xl border border-cyan-400/30 p-5">
                <h2 className="mb-5 text-lg font-semibold text-cyan-300">3. Passenger support</h2>

                {/* Child-seat equipment and ISOFIX availability. */}
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block">
                        <span className={formStyles.span}>Infant seats</span>
                        <input name="infantSeatCount" type="number" min="0" defaultValue={formValues.infantSeatCount ?? "0"} className={`${formStyles.inputNumber} w-24!`} />
                    </label>

                    <label className="block">
                        <span className={formStyles.span}>Child seats</span>
                        <input name="childSeatCount" type="number" min="0" defaultValue={formValues.childSeatCount ?? "0"} className={`${formStyles.inputNumber} w-24!`} />
                    </label>

                    <label className="block">
                        <span className={formStyles.span}>Booster seats</span>
                        <input name="boosterSeatCount" type="number" min="0" defaultValue={formValues.boosterSeatCount ?? "0"} className={`${formStyles.inputNumber} w-24!`} />
                    </label>

                    <label className="flex items-center gap-2">
                        <input name="isofixAvailable" type="checkbox" defaultChecked={formValues.isofixAvailable === "true"} />
                        <span className="text-sm text-white">ISOFIX available</span>
                    </label>
                </div>

                {/* Wheelchair access and supported wheelchair capacity. */}
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    <label className="block">
                        <span className={formStyles.span}>Wheelchair access</span>
                        <select name="wheelchairAccess" defaultValue={formValues.wheelchairAccess ?? "none"} className={formStyles.selectWFull}>
                            <option value="none">None</option>
                            <option value="foldable_only">Foldable wheelchair only</option>
                            <option value="ramp">Ramp</option>
                            <option value="lift">Lift</option>
                        </select>
                    </label>

                    <label className="block">
                        <span className={formStyles.span}>Wheelchair capacity</span>
                        <input name="wheelchairCapacity" type="number" min="0" defaultValue="0" className={`${formStyles.inputNumber} w-24!`} />
                    </label>
                </div>

                {/* Additional luggage and mobility equipment storage. */}
                <div className="mt-6 flex flex-wrap gap-6">
                    <label className="flex items-center gap-2">
                        <input name="mobilityAidStorage" type="checkbox" defaultChecked={formValues.mobilityAidStorage === "true"} />
                        <span className="text-sm text-white">Mobility-aid storage</span>
                    </label>

                    <label className="flex items-center gap-2">
                        <input name="extraLargeLuggage" type="checkbox" defaultChecked={formValues.extraLargeLuggage === "true"} />
                        <span className="text-sm text-white">Extra-large luggage</span>
                    </label>
                </div>
            </section>

            {/* Registration actions: cancel or submit the completed vehicle form. */}
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <Link href="/admin/vehicles" className={formStyles.link}>Cancel</Link>
                <button type="submit" className={formStyles.primaryButtonDP}>Add vehicle</button>
            </div>
        </form>
    );
}
