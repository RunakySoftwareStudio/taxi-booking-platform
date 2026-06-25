import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles, mobileStyle } from "@/styles/classNames";

//export const dynamic = "force-dynamic"; //Keep dynamic only in: src/app/admin/vehicles/page.tsx 

type AdminVehiclesPageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
    chauffeurId?: string;
    vehicleType?: string;
    brand?: string;
    model?: string;
    licensePlate?: string;
    seats?: string;
    luggageCapacity?: string;
    vehicleYear?: string;
    vehicleColor?: string;
  }>;
};
type ChauffeurOption = { id: string; name: string;  email: string; };

type VehicleRow = {
    id: string;
    chauffeur_id: string;
    brand: string;
    model: string;
    license_plate: string;
    vehicle_year: number | null;
    vehicle_color: string | null;
    vehicle_type: string;
    seats: number;
    luggage_capacity: number;
    created_at: string;
    chauffeurs: {
                name: string;
                email: string;
                phone: string;
            } | null;
};

async function addVehicle(formData: FormData) {
    "use server";
    
    console.log("addVehicle function started");

    const chauffeurId = String(formData.get("chauffeurId") || "");
    const model = String(formData.get("model") || "").trim();
    const brand = String(formData.get("brand") || "").trim();
    const vehicleYearValue = String(formData.get("vehicleYear") || "");
    const vehicleYear = vehicleYearValue ? Number(vehicleYearValue) : null;
    const vehicleColor = String(formData.get("vehicleColor") || "").trim();
    const licensePlate = String(formData.get("licensePlate") || "").trim().toUpperCase();
    const vehicleType = String(formData.get("vehicleType") || "");
    const seats = Number(formData.get("seats") || 4);
    const luggageCapacity = Number(formData.get("luggageCapacity") || 2);
    const previousFormValues = new URLSearchParams({
      chauffeurId,
      vehicleType,
      brand,
      model,
      licensePlate,
      seats: String(seats),
      luggageCapacity: String(luggageCapacity),
      vehicleYear: vehicleYearValue,
      vehicleColor,
    });

    const previousFormQuery = previousFormValues.toString();

    // to see all the data in console
    console.log("Vehicle form data:", {chauffeurId, brand, model, vehicleYear, vehicleColor, licensePlate, vehicleType, seats,  luggageCapacity, });

    if (!chauffeurId || !brand || !model || !licensePlate || !vehicleType) {
      redirect(`/admin/vehicles?error=missing-fields&${previousFormQuery}`);
    }

    // .select() we can read data inserted
    const { data, error } = await supabaseAdmin
    .from("vehicles")
    .insert({
        chauffeur_id: chauffeurId,
        brand,
        model,
        vehicle_year: vehicleYear,
        vehicle_color: vehicleColor || null,
        license_plate: licensePlate,
        vehicle_type: vehicleType,
        seats,
        luggage_capacity: luggageCapacity,
      })
    .select()
    .single();

    if (error) { 
        console.error("Could not add vehicle:", error);
        if (error.code === "23505") { redirect(`/admin/vehicles?error=duplicate-license-plate&${previousFormQuery}`);; }
        redirect(`/admin/vehicles?error=add-vehicle-failed&${previousFormQuery}`);; //This is useful because server actions cannot use useState directly. So we pass the result through the URL.
    }

    console.log("Vehicle added:", data);

    //So after you add/update/delete a vehicle, the page should show fresh data.
    revalidatePath("/admin/vehicles");

    /*================================================
        //This is useful because server actions cannot use useState directly. So we pass the result through the URL.
        This also sends the user back to the chauffeurs page, but with an extra query parameter:
        /admin/vehicles?success=vehicle-added
        The browser becomes:http://localhost:3000/admin/vehicles?success=vehicle-added
        This part: ?success=vehicle-added
        can be used to show a success message. For example: {pageMessage.success === "vehicle-added" && (<p > Vehicle added successfully. </p> )}
    =============================================*/
    redirect("/admin/vehicles?success=vehicle-added");
}
async function deleteVehicle(formData: FormData) {
    "use server";

    const vehicleId = String(formData.get("vehicleId") || "");
    if (!vehicleId) { redirect("/admin/vehicles?error=missing-fields"); }

    const { error } = await supabaseAdmin
      .from("vehicles")
      .delete()
      .eq("id", vehicleId);

    if (error) {
      console.error("Could not delete vehicle:", error);
      redirect("/admin/vehicles?error=delete-vehicle-failed");
    }

    revalidatePath("/admin/vehicles");
    redirect("/admin/vehicles?success=vehicle-deleted");
  }

export default async function AdminVehiclesPage({searchParams}: AdminVehiclesPageProps) {
    const pageMessage = await searchParams;
    const formValues = {
        chauffeurId: pageMessage.chauffeurId ?? "",
        vehicleType: pageMessage.vehicleType ?? "",
        brand: pageMessage.brand ?? "",
        model: pageMessage.model ?? "",
        licensePlate: pageMessage.licensePlate ?? "",
        seats: pageMessage.seats ?? "4",
        luggageCapacity: pageMessage.luggageCapacity ?? "4",
        vehicleYear: pageMessage.vehicleYear ?? "",
        vehicleColor: pageMessage.vehicleColor ?? "",
    };
    const { data: vehicles, error: vehiclesError } = await supabaseAdmin
      .from("vehicles")
      .select( `id, chauffeur_id, brand, model, license_plate,  vehicle_year, vehicle_color, vehicle_type, seats, luggage_capacity, created_at, chauffeurs (name, email, phone )` )
      .order("chauffeur_id,created_at", { ascending: false });

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
    //group vehicles by chaffeus, This groups all vehicles that have the same chauffeur_id.
    const vehicleGroups = vehicleRows.reduce< { chauffeurId: string; chauffeurName: string; chauffeurEmail: string;  chauffeurPhone: string;  vehicles: VehicleRow[]; }[]>
      (
        (groups, vehicle) => { const existingGroup = groups.find(  (group) => group.chauffeurId === vehicle.chauffeur_id  );
        if (existingGroup) { existingGroup.vehicles.push(vehicle); return groups;}
        groups.push({chauffeurId: vehicle.chauffeur_id, chauffeurName: vehicle.chauffeurs?.name || "Unknown chauffeur",
        chauffeurEmail: vehicle.chauffeurs?.email || "", chauffeurPhone: vehicle.chauffeurs?.phone || "", vehicles: [vehicle], });
        return groups;}, []
      );

    const chauffeurOptions = (approvedChauffeurs ?? []) as unknown as ChauffeurOption[];
    const vehicleTypeOptions = (vehicleTypes ?? []) as string[];

    return (
      <main className={pageStyles.main}>
        <div className={pageStyles.container}> 
          <Link  href="/admin" className={formStyles.link} > ← Back to admin dashboard </Link>
          <p className={pageStyles.pageLabelUpper}> Admin </p>
          <h1 className={pageStyles.pageTitle}>Vehicles</h1>
          <p className={pageStyles.pageDescription}> Add vehicles and connect them to approved chauffeurs. </p>

          {pageMessage.success === "vehicle-added" && (<p className={pageStyles.successMsgPage}> Vehicle added successfully. </p> )}
          {pageMessage.error === "missing-fields" && (<p className={pageStyles.errorMsgPage}> Please fill in all required vehicle fields.  </p> )}
          {pageMessage.error === "duplicate-license-plate" && (<p className={pageStyles.errorMsgPage}> A vehicle with this license plate already exists. </p>)}
          {pageMessage.error === "add-vehicle-failed" && ( <p className={pageStyles.errorMsgPage}> Could not add vehicle. Please try again. </p> )}
          {pageMessage.success === "vehicle-deleted" && ( <p className={pageStyles.successMsgPage}> Vehicle deleted successfully.  </p>)}
          {pageMessage.error === "delete-vehicle-failed" && (<p className={pageStyles.errorMsgPage}> Could not delete vehicle. Please try again. </p>)}

          <form  action={addVehicle}  className={formStyles.form}>
                <div className={formStyles.formDivGridCol3}>
                    <label className="block">
                        <span className={formStyles.span}> Chauffeur </span>
                        <select name="chauffeurId" required defaultValue={formValues.chauffeurId} className={formStyles.selectWFull} >
                            <option value="">Select chauffeur</option>
                            {chauffeurOptions.map((chauffeur) => ( <option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name} - {chauffeur.email} </option> ))}
                        </select>
                    </label>
                    
                    <label className="block">
                        <span className={formStyles.span}> Vehicle type </span>
                        <select  name="vehicleType"  required defaultValue={formValues.vehicleType} className={formStyles.selectWFull}>
                            <option value="">Select vehicle type</option>
                            {vehicleTypeOptions.map((vehicleType) => ( <option key={vehicleType} value={vehicleType}> {vehicleType} </option> ))}
                        </select>
                    </label>  
                    
                    <label className="block">
                        <span className={formStyles.span}> Brand </span>
                        <input name="brand"  required defaultValue={formValues.brand} placeholder="Brand, example Mercedes" className={formStyles.inputWFullCyan} />
                    </label>

                    {/*   md:col-span-2: This makes the whole group start under the left side of the form instead of staying only in the third column.
                          w-20! This forces the input to be small, even if formStyles.inputNumber has w-full. */} 
                    <label className="block">
                      <span className={formStyles.span}>Model</span>
                      <input name="model"  required defaultValue={formValues.model} placeholder="Model, example E-Class" className={formStyles.inputWFullCyan} />
                    </label>

                    <label className="block">
                      <span className={formStyles.span}>License Plate</span>
                      <input name="licensePlate"  required defaultValue={formValues.licensePlate} placeholder="License plate"  className={formStyles.inputWFullCyan} />
                    </label>

                    <div className="flex flex-wrap items-end gap-2">
                        <label className="block">
                          <span className={formStyles.span}>Seats</span>
                        <input name="seats" type="number"  min="1" defaultValue={formValues.seats} required   placeholder="4"  className={`${formStyles.inputNumber} w-20!`}  />
                        </label>

                        <label className="block">
                          <span className={formStyles.span}>Luggage</span>
                        <input  name="luggageCapacity"  type="number"   min="0" defaultValue={formValues.luggageCapacity} required  placeholder="2"  className={`${formStyles.inputNumber} w-20!`}  />
                        </label>

                        <label className="block">
                          <span className={formStyles.span}>Year</span>
                          <input  name="vehicleYear" type="number"  min="1980"  max="2100"  defaultValue={formValues.vehicleYear} placeholder="2024"  className={`${formStyles.inputNumber} w-24!`}  />
                        </label>
                    </div>
                      <label className="block">
                          <span className={formStyles.span}>Color</span>
                          <input  name="vehicleColor"  defaultValue={formValues.vehicleColor} placeholder="Example: black"  className={formStyles.inputWFullCyan} />
                      </label>
                </div>

                <button type="submit" className={`mt-8 ${formStyles.primaryButtonDP}`}> 
                    Add vehicle
                </button>
          </form>

          <h3 className={tableStyles.headerTableSmall}>  List of vehicles grouped by chauffeur</h3>
          <div className="mt-8 space-y-8">
            {vehicleGroups.map((group) => (
              <section key={group.chauffeurId} >
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-white"> {"Chauffeur: " + group.chauffeurName}  </h2>
                  <p className="wrap-break-word text-sm text-slate-300"> {"Email: " + group.chauffeurEmail}  </p>
                  <p className="text-sm text-slate-300"> {"Phone: " + group.chauffeurPhone} </p>
                  <p className="mt-2 text-sm font-semibold text-cyan-200">  Vehicles: {group.vehicles.length}  </p>
                </div>

                {/* Mobile vehicle cards */}
                <div className="grid gap-4 lg:hidden">
                  {group.vehicles.map((vehicle) => (
                    <article  key={vehicle.id} className="rounded-2xl border border-cyan-400/30 bg-cyan-950/20 p-4 text-sm text-white" >
                      <div>
                        <span className={mobileStyle.inforCaptionBold}> Car: </span>
                        <span className={mobileStyle.infoValueBold}> {vehicle.brand} {vehicle.model} </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-1">
                        <div>
                          <span className={mobileStyle.inforCaption}> Year: </span>
                          <span className={mobileStyle.infoValue}>{vehicle.vehicle_year || "-"}</span>
                        </div>

                        <div>
                          <span className={mobileStyle.inforCaption}>  Color: </span>
                          <span className={mobileStyle.infoValue}>{vehicle.vehicle_color || "-"}</span>
                        </div>

                        <div>
                          <span className={mobileStyle.inforCaption}> License:  </span>
                          <span className="mt-1 wrap-break-word">{vehicle.license_plate}</span>
                        </div>

                        <div>
                          <span className={mobileStyle.inforCaption}>  Type:  </span>
                          <span className={mobileStyle.infoValue}>{vehicle.vehicle_type}</span>
                        </div>

                        <div>
                          <span className={mobileStyle.inforCaption}>  Seats:  </span>
                          <span className={mobileStyle.infoValue}>{vehicle.seats}</span>
                        </div>

                        <div>
                          <span className={mobileStyle.inforCaption}> Luggage: </span>
                          <span className={mobileStyle.infoValue}>{vehicle.luggage_capacity}</span>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Link  href={`/admin/vehicles/${vehicle.id}`} className={formStyles.smallButton} >
                          Details
                        </Link>

                        <form action={deleteVehicle}>
                          <input type="hidden" name="vehicleId" value={vehicle.id} />
                          <button type="submit" className={formStyles.deActiveDeleteButton}> Delete </button>
                        </form>
                      </div>
                    </article>
                  ))}
                </div>

                {/* Desktop vehicle table */}
                <div className={`${tableStyles.tableDiv} hidden lg:block`}>
                  <table className={tableStyles.table1000}>
                    <thead className={tableStyles.tableHeaderCyan}>
                      <tr>
                        <th className={tableStyles.cellCaption}>Brand</th>
                        <th className={tableStyles.cellCaption}>Model</th>
                        <th className={tableStyles.cellCaption}>Year</th>
                        <th className={tableStyles.cellCaption}>Color</th>
                        <th className={tableStyles.cellCaption}>License plate</th>
                        <th className={tableStyles.cellCaption}>Type</th>
                        <th className={tableStyles.cellCaption}>Seats</th>
                        <th className={tableStyles.cellCaption}>Luggage</th>
                        <th className={tableStyles.cellCaption}>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {group.vehicles.map((vehicle) => (
                        <tr key={vehicle.id} className={tableStyles.rowCyan}>
                          <td className={tableStyles.cell}>{vehicle.brand}</td>
                          <td className={tableStyles.cell}>{vehicle.model}</td>
                          <td className={tableStyles.cell}>{vehicle.vehicle_year || "-"}</td>
                          <td className={tableStyles.cell}>{vehicle.vehicle_color || "-"}</td>
                          <td className={tableStyles.cell}>{vehicle.license_plate}</td>
                          <td className={tableStyles.cell}>{vehicle.vehicle_type}</td>
                          <td className={tableStyles.cell}>{vehicle.seats}</td>
                          <td className={tableStyles.cell}>{vehicle.luggage_capacity}</td>

                          <td className={tableStyles.cell}>
                            <div className="flex flex-wrap items-center gap-3">
                              <Link href={`/admin/vehicles/${vehicle.id}`}  className={formStyles.smallButton} > Details </Link>
                              <form action={deleteVehicle}>
                                <input type="hidden" name="vehicleId" value={vehicle.id} />
                                <button type="submit" className={formStyles.deActiveDeleteButton} >  Delete </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            {vehicleGroups.length === 0 && (<p className={tableStyles.cellEmpty}>No vehicles found yet.</p> )}
          </div>
        </div>
      </main>
  );
}