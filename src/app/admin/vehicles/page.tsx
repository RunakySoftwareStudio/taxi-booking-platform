import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import Link from "next/link";

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
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-6xl">
        <Link  href="/admin" className="text-sm text-cyan-300 hover:text-cyan-200" > ← Back to admin dashboard </Link>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> Admin </p>
        <h1 className="mt-3 text-3xl font-bold">Vehicles</h1>
        <p className="mt-4 max-w-2xl text-slate-300"> Add vehicles and connect them to approved chauffeurs. </p>

        <form  action={addVehicle}  className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6" >
          <h2 className="text-xl font-semibold">Add vehicle</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
                <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300"> Chauffeur </span>
                    <select name="chauffeurId" required  className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" >
                        <option value="">Select chauffeur</option>
                        {chauffeurOptions.map((chauffeur) => ( <option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name} - {chauffeur.email} </option> ))}
                    </select>
                </label>
                
                <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300"> Brand </span>
                    <input name="brand"  required  placeholder="Brand, example Mercedes" className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" />
                </label>

                <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300"> Model </span>
                    <input name="model"  required  placeholder="Model, example E-Class"  className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" />
                </label>

                <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300"> licensePlate </span>
                    <input name="licensePlate"  required placeholder="License plate"  className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" />
                </label>
                
                <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300"> Vehicle type </span>
                    <select  name="vehicleType"  required  className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white">
                        {vehicleTypeOptions.map((vehicleType) => ( <option key={vehicleType} value={vehicleType}> {vehicleType} </option> ))}
                    </select>
                </label>               

                <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300"> Seats </span>
                    <input  name="seats" type="number"  min="1" defaultValue="4" required  placeholder="Example: 4" className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" />
                </label>

                <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300"> Luggage capacity </span>
                    <input  name="luggageCapacity" type="number"  min="1" defaultValue="4" required  placeholder="Example: 2"  className="rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white" />
                </label>        
                
                <button  type="submit"  className="mt-6 rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300"  >
                    Add vehicle
                </button>  
            </div>


        </form>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-white/10 bg-white/10 text-slate-300">
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
                <tr key={vehicle.id} className="border-b border-white/10">
                  <td className="p-4">
                    <div className="font-medium text-white"> {vehicle.chauffeurs?.name || "Unknown chauffeur"} </div>
                    <div className="text-xs text-slate-400"> {vehicle.chauffeurs?.email}  </div>
                    <div className="text-xs text-slate-400"> {vehicle.chauffeurs?.phone}  </div>
                  </td>

                  <td className="p-4 text-slate-300">{vehicle.brand}</td>
                  <td className="p-4 text-slate-300">{vehicle.model}</td>
                  <td className="p-4 text-slate-300"> {vehicle.license_plate} </td>
                  <td className="p-4 text-slate-300">  {vehicle.vehicle_type}  </td>
                  <td className="p-4 text-slate-300">{vehicle.seats}</td>
                  <td className="p-4 text-slate-300"> {vehicle.luggage_capacity} </td>
                </tr>
              ))}

              {vehicleRows.length === 0 && ( <tr>  <td className="p-4 text-slate-300" colSpan={7}>  No vehicles found yet. </td> </tr> )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}