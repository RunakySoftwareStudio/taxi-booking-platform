/*
  ChauffeursPreview shows a small public preview of approved chauffeurs.

  This is an async server component because it loads chauffeur, vehicle,
  and availability data from Supabase before rendering the homepage section.

  In Version 5:
    - visible static text uses TranslatedText for English/Dutch support
    - layout classes are stored in chauffeurPreviewStyles
*/

import { TranslatedText } from "@/components/TranslatedText";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { chauffeurPreviewStyles } from "@/styles/classNames";

// ChauffeurRow describes the chauffeur data needed for this preview section.
type ChauffeurRow = {id: string;  name: string;  service_area: string | null;  account_status: string;};

// VehicleRow describes the vehicle data shown under each chauffeur.
type VehicleRow = {id: string; chauffeur_id: string; brand: string; model: string; vehicle_type: string;};

// AvailabilityRow describes today's availability status for each chauffeur.
type AvailabilityRow = {id: string; chauffeur_id: string; available_date: string; status: string;};

// getTodayDateInputValue returns today's date in YYYY-MM-DD format.
// Supabase date filters expect this format when comparing with available_date.
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
      .select("id, name, service_area, account_status, accepts_pets")
      .eq("account_status", "approved")
      .order("name", { ascending: true })
      .limit(6);

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

  if (vehiclesError) { console.error("Could not load chauffeur vehicles preview:", vehiclesError); }

  const { data: availabilityRows, error: availabilityError } =
    chauffeurIds.length > 0
      ? await supabaseAdmin
          .from("chauffeur_availability")
          .select("id, chauffeur_id, available_date, status")
          .in("chauffeur_id", chauffeurIds)
          .eq("available_date", todayDate)
      : { data: [], error: null };

  if (availabilityError) { console.error("Could not load chauffeur availability preview:", availabilityError); }

  const vehicles = (vehicleRows ?? []) as VehicleRow[];
  const availability = (availabilityRows ?? []) as AvailabilityRow[];

  return (
    <section id="chauffeurs" className={chauffeurPreviewStyles.section}>
      <div className={chauffeurPreviewStyles.container}>
        <p className={chauffeurPreviewStyles.label}> <TranslatedText sectionName="chauffeurPreview" textKey="label" /> </p>
        <h2 className={chauffeurPreviewStyles.title}> <TranslatedText sectionName="chauffeurPreview" textKey="title" /> </h2>
        <p className={chauffeurPreviewStyles.description}> <TranslatedText sectionName="chauffeurPreview" textKey="description" /> </p>

        {
          chauffeurs.length === 0 ? 
            (<p className={chauffeurPreviewStyles.emptyMessage}> <TranslatedText sectionName="chauffeurPreview" textKey="noApprovedChauffeurs" /> </p>) 
            : ( <div className={chauffeurPreviewStyles.grid}>
                  {chauffeurs.map((chauffeur) => 
                      { 
                        const chauffeurVehicle = vehicles.find((vehicle) => vehicle.chauffeur_id === chauffeur.id);
                        const todayAvailability = availability.find((item) => item.chauffeur_id === chauffeur.id);

                        return (
                            <article key={chauffeur.id} className={chauffeurPreviewStyles.card}>
                                <div className={chauffeurPreviewStyles.avatar}> {chauffeur.name.charAt(0).toUpperCase()} </div>
                                <h3 className={chauffeurPreviewStyles.name}>{chauffeur.name}</h3>

                                <p className={chauffeurPreviewStyles.vehicle}>
                                  {chauffeurVehicle ? `${chauffeurVehicle.brand} ${chauffeurVehicle.model}` : <TranslatedText sectionName="chauffeurPreview" textKey="vehicleNotAdded" />}
                                </p>

                                <p className={chauffeurPreviewStyles.serviceArea}>
                                  {chauffeur.service_area || <TranslatedText sectionName="chauffeurPreview" textKey="serviceAreaNotAdded" />}
                                </p>

                                <div className={chauffeurPreviewStyles.statusRow}>                    
                                  <span className={chauffeurPreviewStyles.availabilityBadge}>
                                    {todayAvailability ? todayAvailability.status : <TranslatedText sectionName="chauffeurPreview" textKey="noAvailabilityToday" />}
                                  </span>

                                  <span className={chauffeurPreviewStyles.approvedBadge}> <TranslatedText sectionName="chauffeurPreview" textKey="approved" /> </span>
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