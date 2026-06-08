import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles } from "@/styles/classNames";

export const dynamic = "force-dynamic";


type ChauffeurOption = {
  id: string;
  name: string;
  email: string;
};

type VehicleRow = 
{
    id: string;
    chauffeur_id: string;
    brand: string;
    model: string;
    license_plate: string;
    vehicle_type: string;
    seats: number;
    luggage_capacity: number;
    created_at: string;
    chauffeurs: 
            {
                name: string;
                email: string;
                phone: string;
            } | null;
};

async function addVehicle(formData: FormData) {
    "use server";

    const chauffeurId = String(formData.get("chauffeurId") || "");
    const brand = String(formData.get("brand") || "").trim();
    const model = String(formData.get("model") || "").trim();
    const licensePlate = String(formData.get("licensePlate") || "").trim().toUpperCase();
    const vehicleType = String(formData.get("vehicleType") || "standard");
    const seats = Number(formData.get("seats") || 4);
    const luggageCapacity = Number(formData.get("luggageCapacity") || 2);

    if (!chauffeurId || !brand || !model || !licensePlate) { return; }

    const { error } = await supabaseAdmin.from("vehicles").insert({
        chauffeur_id: chauffeurId,
        brand,
        model,
        license_plate: licensePlate,
        vehicle_type: vehicleType,
        seats,
        luggage_capacity: luggageCapacity,
    });

    if (error) { console.error("Could not add vehicle:", error); return; }

    revalidatePath("/admin/vehicles");
    redirect("/admin/vehicles");
}

export default async function AdminVehiclesPage() {
    const { data: vehicles, error: vehiclesError } = await supabaseAdmin
      .from("vehicles")
      .select(
          `
          id,
          chauffeur_id,
          brand,
          model,
          license_plate,
          vehicle_type,
          seats,
          luggage_capacity,
          created_at,
          chauffeurs (name, email, phone ) `
      )
      .order("created_at", { ascending: false });

    const { data: approvedChauffeurs, error: chauffeursError } = await supabaseAdmin
      .from("chauffeurs")
      .select("id, name, email, phone")
      .eq("account_status", "approved")
      .order("name", { ascending: true });

    const { data: vehicleTypes, error: vehicleTypesError } =  await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "vehicle_type"});

    if (vehiclesError) {console.error("Could not load vehicles:", vehiclesError); }
    if (chauffeursError) { console.error("Could not load approved chauffeurs:", chauffeursError); }
    if (vehicleTypesError) { console.error("Could not load vehicle types:", vehicleTypesError); }

    const vehicleRows = (vehicles ?? []) as unknown as VehicleRow[];
    const chauffeurOptions = (approvedChauffeurs ?? []) as unknown as ChauffeurOption[];
    const vehicleTypeOptions = (vehicleTypes ?? []) as string[];

    return (
      <main className={pageStyles.main}>
        <div className="mx-auto max-w-6xl">
          <Link  href="/admin" className={formStyles.link} > ← Back to admin dashboard </Link>
          <p className={pageStyles.pageLabel}> Admin </p>
          <h1 className={pageStyles.pageTitle}>Vehicles</h1>
          <p className={pageStyles.pageDescription}> Add vehicles and connect them to approved chauffeurs. </p>

          <form  action={addVehicle}  className={formStyles.form}>
            <h2 className="text-xl font-semibold">Add vehicle</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <label className="block">
                      <span className={formStyles.span}> Chauffeur </span>
                      <select name="chauffeurId" required  className={formStyles.select} >
                          <option value="">Select chauffeur</option>
                          {chauffeurOptions.map((chauffeur) => ( <option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name} - {chauffeur.email} </option> ))}
                      </select>
                  </label>
                  
                  <label className="block">
                      <span className={formStyles.span}> Vehicle type </span>
                      <select  name="vehicleType"  required  className={formStyles.select}>
                          <option value="">Select vehicle type</option>
                          {vehicleTypeOptions.map((vehicleType) => ( <option key={vehicleType} value={vehicleType}> {vehicleType} </option> ))}
                      </select>
                  </label>  
                   
                  <label className="block">
                      <span className={formStyles.span}> Brand </span>
                      <input name="brand"  required  placeholder="Brand, example Mercedes" className={formStyles.input} />
                  </label>

                  <label className="block">
                      <span className={formStyles.span}> Model </span>
                      <input name="model"  required  placeholder="Model, example E-Class" className={formStyles.input} />
                  </label>

                  <label className="block">
                      <span className={formStyles.span}> license Plate </span>
                      <input name="licensePlate"  required placeholder="License plate"  className={formStyles.input} />
                  </label>
                  


                  <label className="block">
                      <span className={formStyles.span}> Seats </span>
                      <input  name="seats" type="number"  min="1" defaultValue="4" required  placeholder="Example: 4" className={formStyles.input} />
                  </label>

                  <label className="block">
                      <span className={formStyles.span}> Luggage capacity </span>
                      <input  name="luggageCapacity" type="number"  min="0" defaultValue="4" required  placeholder="Example: 2" className={formStyles.input} />
                  </label>        
              </div>
              
              <button type="submit" className={"mt-8 " + formStyles.primaryButtonDP}> 
                  Add vehicle
              </button>
          </form>

          <div className={tableStyles.tableDiv}>
            <table className={tableStyles.table1000}>
              <thead className={tableStyles.headerCyan}>
                <tr>
                  <th className="p-4">Chauffeur</th>
                  <th className="p-4">Brand</th>
                  <th className="p-4">Model</th>
                  <th className="p-4">License plate</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Seats</th>
                  <th className="p-4">Luggage</th>
                </tr>
              </thead>

              <tbody>
                {vehicleRows.map((vehicle) => (
                  <tr key={vehicle.id} className={tableStyles.rowCyan}>
                    <td className="p-4">
                      <div className="font-medium text-white"> {vehicle.chauffeurs?.name || "Unknown chauffeur"} </div>
                      <div className="text-xs text-slate-400"> {vehicle.chauffeurs?.email}  </div>
                      <div className="text-xs text-slate-400"> {vehicle.chauffeurs?.phone}  </div>
                    </td>

                    <td className={tableStyles.cell}>{vehicle.brand}</td>
                    <td className={tableStyles.cell}>{vehicle.model}</td>
                    <td className={tableStyles.cell}> {vehicle.license_plate} </td>
                    <td className={tableStyles.cell}>  {vehicle.vehicle_type}  </td>
                    <td className={tableStyles.cell}>{vehicle.seats}</td>
                    <td className={tableStyles.cell}> {vehicle.luggage_capacity} </td>
                  </tr>
                ))}

                {vehicleRows.length === 0 && ( <tr>  <td className={tableStyles.emptyCell} colSpan={7}>  No vehicles found yet. </td> </tr> )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
  );
}