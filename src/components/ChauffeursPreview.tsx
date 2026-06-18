import { supabaseAdmin } from "@/lib/supabaseServer";

type ChauffeurRow = {
  id: string;
  name: string;
  service_area: string | null;
  account_status: string;
};

type VehicleRow = {
  id: string;
  chauffeur_id: string;
  brand: string;
  model: string;
  vehicle_type: string;
};

type AvailabilityRow = {
  id: string;
  chauffeur_id: string;
  available_date: string;
  status: string;
};

function getTodayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default async function ChauffeursPreview() {
  const todayDate = getTodayDateInputValue();
  const { data: chauffeurRows, error: chauffeursError } = await supabaseAdmin
    .from("chauffeurs")
    .select("id, name, service_area, account_status")
    .eq("account_status", "approved")
    .order("name", { ascending: true })
    .limit(8);

  if (chauffeursError) { console.error("Could not load chauffeurs preview:", chauffeursError);}

  const chauffeurs = (chauffeurRows ?? []) as ChauffeurRow[];
  const chauffeurIds = chauffeurs.map((chauffeur) => chauffeur.id);

  const { data: vehicleRows, error: vehiclesError } =
    chauffeurIds.length > 0
      ? await supabaseAdmin
          .from("vehicles")
          .select("id, chauffeur_id, brand, model, vehicle_type")
          .in("chauffeur_id", chauffeurIds)
      : { data: [], error: null };

  if (vehiclesError) {console.error("Could not load chauffeur vehicles preview:", vehiclesError);  }

  const { data: availabilityRows, error: availabilityError } =
    chauffeurIds.length > 0
      ? await supabaseAdmin
          .from("chauffeur_availability")
          .select("id, chauffeur_id, available_date, status")
          .in("chauffeur_id", chauffeurIds)
          .eq("available_date", todayDate)
      : { data: [], error: null };

  if (availabilityError) { console.error("Could not load chauffeur availability preview:", availabilityError );  }

  const vehicles = (vehicleRows ?? []) as VehicleRow[];
  const availability = (availabilityRows ?? []) as AvailabilityRow[];

  return (
    
    <section id="chauffeurs" className="bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-[0.4em] text-yellow-400">  Chauffeurs </p>
        <h2 className="mt-4 text-3xl font-bold md:text-4xl">  View available chauffeurs before booking  </h2>
        <p className="mt-4 max-w-2xl text-slate-300">  Clients can compare approved chauffeurs by vehicle, service area, and availability before sending a booking request.  </p>

        {
          chauffeurs.length === 0 ? 
            (<p className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-300"> No approved chauffeurs are available yet.  </p> ) 
            : ( <div className="mt-12 grid gap-6 md:grid-cols-3">
                  {chauffeurs.map((chauffeur) => 
                      { 
                        const chauffeurVehicle = vehicles.find( (vehicle) => vehicle.chauffeur_id === chauffeur.id  );
                        const todayAvailability = availability.find( (item) => item.chauffeur_id === chauffeur.id );
                        const availabilityText = todayAvailability  ? todayAvailability.status  : "No availability today";

                        return (
                            <article key={chauffeur.id}  className="rounded-2xl border border-white/10 bg-white/5 p-6" >
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400 text-xl font-bold text-slate-950">
                                  {chauffeur.name.charAt(0).toUpperCase()}
                                </div>
                                <h3 className="mt-6 text-xl font-bold">{chauffeur.name}</h3>
                                <p className="mt-3 text-slate-200">  {chauffeurVehicle  ? `${chauffeurVehicle.brand} ${chauffeurVehicle.model}` : "Vehicle not added yet"}  </p>
                                <p className="mt-1 text-sm text-slate-400">  {chauffeur.service_area || "Service area not added yet"} </p>
                                <div className="mt-6 flex items-center justify-between">                    
                                  <span className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white"> {availabilityText} </span>
                                  <span className="text-sm font-semibold text-yellow-400">  Approved  </span>
                                </div>
                            </article>  
                          );
                      }
                  )}
                </div>
             )
        }
      </div>
    </section>
  );
}