import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles, tableStyles, formStyles, mobileStyle } from "@/styles/classNames";
import { Fragment } from "react";
import VehicleFilters from "./VehicleFilters";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";

//export const dynamic = "force-dynamic"; //Keep dynamic only in: src/app/admin/vehicles/page.tsx

type AdminVehiclesPageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
    chauffeurId?: string;
    vehicleType?: string;
    brand?: string;
    model?: string;
    vehicleLabel?: string;
    licensePlate?: string;
    seats?: string;
    luggageCapacity?: string;
    vehicleYear?: string;
    vehicleColor?: string;
    infantSeatCount?: string;
    childSeatCount?: string;
    boosterSeatCount?: string;
    isofixAvailable?: string;
    wheelchairAccess?: string;
    wheelchairCapacity?: string;
    mobilityAidStorage?: string;
    extraLargeLuggage?: string;

    /* Vehicle list filters, independent of the Add Vehicle form. */
    filterChauffeurId?: string;
    filterLargeLuggage?: string;
    filterMobilityStorage?: string;
  }>;
};
type VehicleRow = {
    id: string;
    chauffeur_id: string;
    brand: string;
    model: string;
    license_plate: string;
    vehicle_status: string;
    is_default_vehicle: boolean;
    status_reason: string | null;
    vehicle_year: number | null;
    vehicle_color: string | null;
    vehicle_type: string;
    seats: number;
    luggage_capacity: number;

    infant_seat_count: number;
    child_seat_count: number;
    booster_seat_count: number;
    isofix_available: boolean;
    wheelchair_access: string;
    wheelchair_capacity: number;
    mobility_aid_storage: boolean;
    extra_large_luggage: boolean;

    created_at: string;
    chauffeurs: {
        name: string;
        email: string;
        phone: string;
    } | null;
};

function getWheelchairAccessLabel(accessValue: string) {
    if (accessValue === "none") { return "None"; }
    if (accessValue === "foldable_only") { return "Foldable wheelchair only"; }
    if (accessValue === "ramp") { return "Ramp"; }
    if (accessValue === "lift") { return "Lift"; }
    return accessValue;
}

/* Returns the background and border styling for one vehicle status.
    available     → normal layout
    damaged       → red
    maintenance   → red
    inactive      → gray
  */
function getVehicleStatusContainerClass(vehicleStatus: string) {
    return vehicleStatus === "available"
        ? ""
        : "border-red-400/50 bg-red-400/10";
}

/* Returns the text styling for one vehicle status. */
function getVehicleStatusTextClass(vehicleStatus: string) {
    return vehicleStatus === "available"
        ? "text-green-300"
        : "text-red-300";
}

/* Verifies Admin authorization before deleting or reading vehicle data. */
async function deleteVehicle(formData: FormData) {
    "use server";
    await requireAdminUser();

    const vehicleId = String(formData.get("vehicleId") || "");
    if (!vehicleId) { redirect("/admin/vehicles?error=missing-fields"); }

    /* Loads a readable vehicle label for error messages. */
    const { data: vehicleRow, error: vehicleLookupError } =
      await supabaseAdmin
        .from("vehicles")
        .select("brand, model, license_plate")
        .eq("id", vehicleId)
        .maybeSingle();

    if (vehicleLookupError) {
      console.error("Could not load the vehicle before deletion:", vehicleLookupError);
      redirect("/admin/vehicles?error=delete-vehicle-failed");
    }

    /* Creates a readable label such as Mercedes Vito (AB-12-CD). */
    const vehicleLabel = vehicleRow
      ? `${vehicleRow.brand} ${vehicleRow.model} (${vehicleRow.license_plate})`
      : "This vehicle";

    const chauffeurId = String(formData.get("chauffeurId") || "");

    /* Prevents deletion when the vehicle is connected to booking history. */
    const {count: linkedBookingCount, error: bookingCountError, } = await supabaseAdmin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_id", vehicleId);

    if (bookingCountError) {
      console.error( "Could not check whether the vehicle has bookings:", bookingCountError );
      redirect("/admin/vehicles?error=delete-vehicle-failed");
    }
    console.error(
      `Could not check whether ${vehicleLabel} has bookings:`,
      bookingCountError
    );

    const encodedVehicleLabel = encodeURIComponent(vehicleLabel);
    /**
     * The resulting URL will look like:
        /admin/vehicles?error=vehicle-has-bookings&chauffeurId=...#chauffeur-vehicles-...
        The parts have separate purposes:
        ?error=vehicle-has-bookings&chauffeurId=...        tells React which warning to display.
        #chauffeur-vehicles-...        tells the browser where to scroll.

        you need to give each chauffeur section an ID This creates an anchor such as: chauffeur-vehicles-3f8d...

        It is redirected/scrolled to the same page next section: id={`chauffeur-vehicles-${group.chauffeurId}`}
            <section key={group.chauffeurId} id={`chauffeur-vehicles-${group.chauffeurId}`} className="scroll-mt-24">
        scroll-mt-24          leaves some space above the section, so it is not positioned tightly against the top of the screen.
     */
    if ((linkedBookingCount ?? 0) > 0) {
      redirect(
        `/admin/vehicles?error=vehicle-has-bookings` +
        `&chauffeurId=${chauffeurId}` +
        `&vehicleLabel=${encodedVehicleLabel}` +
        `#chauffeur-vehicles-${chauffeurId}`);
        }


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

  /**
 * Sets one vehicle as the chauffeur's default vehicle.
 *
 * The PostgreSQL RPC performs the change atomically:
 * - removes the chauffeur's previous default;
 * - sets the selected vehicle as the new default;
 * - rejects unavailable vehicles.
 */
/* Verifies Admin authorization before changing a chauffeur's default vehicle. */
async function setDefaultVehicle(formData: FormData) {
    "use server";
    await requireAdminUser();

    const vehicleId = String(formData.get("vehicleId") || "");
    const chauffeurId = String(formData.get("chauffeurId") || "");
    if (!vehicleId || !chauffeurId) {redirect("/admin/vehicles?error=missing-default-vehicle-fields");}

    const { error } = await supabaseAdmin.rpc("set_default_vehicle", {p_vehicle_id: vehicleId, });
    if (error) {
        console.error("Could not set the default vehicle:", error);
        const encodedErrorMessage = encodeURIComponent(error.message);
        redirect(
            `/admin/vehicles?error=set-default-vehicle-failed` +
            `&chauffeurId=${chauffeurId}` +
            `&vehicleLabel=${encodedErrorMessage}` +
            `#chauffeur-vehicles-${chauffeurId}`
        );
    }

    revalidatePath("/admin/vehicles");

    redirect(
        `/admin/vehicles?success=default-vehicle-updated` +
        `&chauffeurId=${chauffeurId}` +
        `#chauffeur-vehicles-${chauffeurId}`
    );
}

export default async function AdminVehiclesPage({searchParams}: AdminVehiclesPageProps) {
    const pageMessage = await searchParams;

    /* ============================================================
      VEHICLE LIST FILTER VALUES
      Reads the selected filters from the URL.
      These values are independent of the Add Vehicle form.
    ============================================================ */
    const filterChauffeurId = pageMessage.filterChauffeurId ?? "";
    const filterLargeLuggage = pageMessage.filterLargeLuggage === "true";
    const filterMobilityStorage = pageMessage.filterMobilityStorage === "true";

    /* Stores the vehicle label received through the URL. */
    const deletedVehicleLabel =  pageMessage.vehicleLabel?.trim() || "Selected vehicle";

    const { data: vehicles, error: vehiclesError } = await supabaseAdmin
      .from("vehicles")
      .select( `id, chauffeur_id, brand, model, license_plate,  vehicle_status, is_default_vehicle, status_reason, vehicle_year, vehicle_color, vehicle_type, seats, luggage_capacity,
        infant_seat_count, child_seat_count, booster_seat_count, isofix_available, wheelchair_access,
        wheelchair_capacity, mobility_aid_storage, extra_large_luggage,
        created_at, chauffeurs (name, email, phone )` )
      .order("chauffeur_id,created_at", { ascending: false });


    if (vehiclesError) {console.error("Could not load vehicles:", vehiclesError); }

    const vehicleRows = (vehicles ?? []) as unknown as VehicleRow[];

    /* ============================================================
      FILTER VEHICLE RECORDS
      A vehicle must satisfy every selected filter.
      No selected filters means all vehicles are displayed.
    ============================================================ */
    const filteredVehicleRows = vehicleRows.filter((vehicle) =>
      (!filterChauffeurId || vehicle.chauffeur_id === filterChauffeurId) &&
      (!filterLargeLuggage || vehicle.extra_large_luggage === true) &&
      (!filterMobilityStorage || vehicle.mobility_aid_storage === true)
    );

    //group vehicles by chaffeus, This groups all vehicles that have the same chauffeur_id.
    const vehicleGroups = filteredVehicleRows.reduce< { chauffeurId: string; chauffeurName: string; chauffeurEmail: string;  chauffeurPhone: string;  vehicles: VehicleRow[]; }[]>
      (
        (groups, vehicle) => { const existingGroup = groups.find(  (group) => group.chauffeurId === vehicle.chauffeur_id  );
        if (existingGroup) { existingGroup.vehicles.push(vehicle); return groups;}
        groups.push({chauffeurId: vehicle.chauffeur_id, chauffeurName: vehicle.chauffeurs?.name || "Unknown chauffeur",
        chauffeurEmail: vehicle.chauffeurs?.email || "", chauffeurPhone: vehicle.chauffeurs?.phone || "", vehicles: [vehicle], });
        return groups;}, []
      );

      /* ============================================================
        VEHICLE FILTER CHAUFFEUR OPTIONS
        Creates a unique list of chauffeurs from all vehicle records.
        This includes chauffeurs with vehicle history regardless of
        their current approval status.
      ============================================================ */
      const filterChauffeurs = Array.from(
        new Map(
          vehicleRows.map((vehicle) => [
            vehicle.chauffeur_id,
            {
              id: vehicle.chauffeur_id,
              name: vehicle.chauffeurs?.name || "Unknown chauffeur",
            },
          ])
        ).values()
      ).sort((a, b) => a.name.localeCompare(b.name));

      return (
      <main className={pageStyles.main}>
        <div className={pageStyles.container}>
          <Link  href="/admin" className={formStyles.link} > {"\u2190"} Back to admin dashboard </Link>
          <p className={pageStyles.pageLabelUpper}> Admin </p>
          <h1 className={pageStyles.pageTitle}>Vehicles</h1>
          {/* ===== ADMIN VEHICLES PAGE HEADER ===== */}
          <p className={pageStyles.pageDescription}>View, filter and manage registered chauffeur vehicles.</p>

          {pageMessage.success === "vehicle-added" && (<p className={pageStyles.successMsgPage}> Vehicle added successfully. </p> )}
          {pageMessage.error === "missing-fields" && (<p className={pageStyles.errorMsgPage}> Please fill in all required vehicle fields.  </p> )}
          {pageMessage.error === "duplicate-license-plate" && (<p className={pageStyles.errorMsgPage}> A vehicle with this license plate already exists. </p>)}
          {pageMessage.error === "add-vehicle-failed" && ( <p className={pageStyles.errorMsgPage}> Could not add vehicle. Please try again. </p> )}
          {pageMessage.success === "vehicle-deleted" && ( <p className={pageStyles.successMsgPage}> Vehicle deleted successfully.  </p>)}
          {pageMessage.error === "delete-vehicle-failed" && (<p className={pageStyles.errorMsgPage}> Could not delete vehicle. Please try again. </p>)}
          {pageMessage.error === "invalid-capabilities" && ( <p className={pageStyles.errorMsgPage}>Child-seat and wheelchair capacity values must be zero or higher.</p>)}
          {pageMessage.error === "invalid-wheelchair-settings" && (<p className={pageStyles.errorMsgPage}>Ramp or lift access requires a wheelchair capacity of at least 1. Other access types require capacity 0.</p>)}
          {pageMessage.success === "default-vehicle-updated" && (<p className={pageStyles.successMsgPage}> Default vehicle updated successfully. </p>)}
          {pageMessage.error === "missing-default-vehicle-fields" && (<p className={pageStyles.errorMsgPage}>The selected vehicle information is incomplete.</p>)}
          {pageMessage.error === "default-vehicle-check-failed" && (<p className={pageStyles.errorMsgPage}>The vehicle was added, but its automatic default status could not be checked. Please review the chauffeur&apos;s vehicles. </p>)}

          {/* ============================================================
                ADMIN VEHICLE FILTERS
                Displays chauffeur and vehicle capability filters.
                Filtering is handled on the server through URL parameters.
            ============================================================ */}
            <VehicleFilters
              chauffeurs={filterChauffeurs}
              filterChauffeurId={filterChauffeurId}
              filterLargeLuggage={filterLargeLuggage}
              filterMobilityStorage={filterMobilityStorage}
            />

          {/*======section List of vehicles grouped by chauffeur======*/}
          <h3 className={tableStyles.headerTableSmall}>  List of vehicles grouped by chauffeur</h3>

          <div className="mt-8 space-y-8">
            {vehicleGroups.map((group) => (
              <section key={group.chauffeurId} id={`chauffeur-vehicles-${group.chauffeurId}`} className="scroll-mt-24">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-white"> {"Chauffeur: " + group.chauffeurName}  </h2>
                  <p className="wrap-break-word text-sm text-slate-300"> {"Email: " + group.chauffeurEmail}  </p>
                  <p className="text-sm text-slate-300"> {"Phone: " + group.chauffeurPhone} </p>
                  <p className="mt-2 text-sm font-semibold text-cyan-200">  Vehicles: {group.vehicles.length}  </p>
                </div>

                {/* Shows the delete warning inside the affected chauffeur's vehicle section. */}
                {pageMessage.error === "vehicle-has-bookings" && pageMessage.chauffeurId === group.chauffeurId && (
                  <p className={`${pageStyles.errorMsgPage} mb-4`}> Vehicle: {""}  {/* This stands to add a space after Vehicle: */}
                      {deletedVehicleLabel} has booking history and cannot be deleted. Mark it inactive instead.
                  </p>)}

                {/* Show the RPC error inside the affected chauffeur section rather than at the top.  */}
                {pageMessage.error === "set-default-vehicle-failed" && pageMessage.chauffeurId === group.chauffeurId && (
                    <p className={`${pageStyles.errorMsgPage} mb-4`}>
                        Could not update the default vehicle: {deletedVehicleLabel}
                    </p>)}

                {/* ====Mobile vehicle cards===== */}
                <div className="grid gap-4 lg:hidden text-start">
                  {group.vehicles.map((vehicle) => (
                    <article key={vehicle.id} className={`${mobileStyle.article} ${getVehicleStatusContainerClass(vehicle.vehicle_status)}`}>
                                          {vehicle.is_default_vehicle && (
                      <div className="mb-2">
                        <span className="inline-flex rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-200">
                          Default vehicle
                        </span>
                      </div> )}
                      <div>
                        <span className={mobileStyle.inforCaptionBold}> Car brand(model): </span>
                        <span className={mobileStyle.infoValueBold}> {vehicle.brand}  ({vehicle.model}) </span>
                      </div>

                      <div className="mt-2">
                          <span className={mobileStyle.inforCaption}>Status: </span>
                          <span
                              className={`font-semibold ${getVehicleStatusTextClass(vehicle.vehicle_status )}`}>{vehicle.vehicle_status}
                          </span>
                          {vehicle.status_reason && (<p className="mt-1 text-xs text-slate-400"> Reason: {vehicle.status_reason}</p>)}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-1 ">
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
                          <div className="mt-4 border-t border-white/10 pt-4">
                              <p className="font-semibold text-white">Passenger support</p>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                  <div><span className={mobileStyle.inforCaption}>Infant seats: </span><span className={mobileStyle.infoValue}>{vehicle.infant_seat_count}</span></div>
                                  <div><span className={mobileStyle.inforCaption}>Child seats: </span><span className={mobileStyle.infoValue}>{vehicle.child_seat_count}</span></div>
                                  <div><span className={mobileStyle.inforCaption}>Booster seats: </span><span className={mobileStyle.infoValue}>{vehicle.booster_seat_count}</span></div>
                                  <div><span className={mobileStyle.inforCaption}>ISOFIX: </span><span className={vehicle.isofix_available ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>{vehicle.isofix_available ? "Yes" : "No"}</span></div>
                                  <div><span className={mobileStyle.inforCaption}>Wheelchair: </span><span className={mobileStyle.infoValue}>{getWheelchairAccessLabel(vehicle.wheelchair_access)}</span></div>
                                  <div><span className={mobileStyle.inforCaption}>Wheelchair capacity: </span><span className={mobileStyle.infoValue}>{vehicle.wheelchair_capacity}</span></div>
                                  <div><span className={mobileStyle.inforCaption}>Mobility-aid storage: </span><span className={vehicle.mobility_aid_storage ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>{vehicle.mobility_aid_storage ? "Yes" : "No"}</span></div>
                                  <div><span className={mobileStyle.inforCaption}>Large luggage: </span><span className={vehicle.extra_large_luggage ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>{vehicle.extra_large_luggage ? "Yes" : "No"}</span></div>
                              </div>
                          </div>
                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Link  href={`/admin/vehicles/${vehicle.id}`} className={formStyles.smallButton} >
                          Details
                        </Link>
                        {vehicle.is_default_vehicle ? (
                            <span className="inline-flex rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-2 text-xs font-semibold text-yellow-200">
                                Default vehicle
                            </span>
                        ) : vehicle.vehicle_status === "available" ? (
                            <form action={setDefaultVehicle}>
                                <input type="hidden" name="vehicleId" value={vehicle.id} />
                                <input
                                    type="hidden"
                                    name="chauffeurId"
                                    value={vehicle.chauffeur_id}
                                />

                                <button
                                    type="submit"
                                    className="rounded-lg border border-yellow-400/50 px-3 py-2 text-xs font-semibold text-yellow-200 hover:bg-yellow-400/10"
                                >
                                    Set as default
                                </button>
                            </form>
                        ) : (
                            <span className="text-xs font-semibold text-slate-500">
                                Cannot be default
                            </span>
                        )}
                        <form action={deleteVehicle}>
                          <input type="hidden" name="vehicleId" value={vehicle.id} />
                          <input type="hidden" name="chauffeurId" value={vehicle.chauffeur_id}/>
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
                          <Fragment key={vehicle.id}>
                              <tr className={`${tableStyles.rowCyan} ${getVehicleStatusContainerClass(vehicle.vehicle_status)}`}>
                                  <td className={tableStyles.cell}>{vehicle.brand}
                                    {vehicle.is_default_vehicle && (
                                      <div className="mt-1 text-xs font-semibold text-yellow-300">
                                        Default vehicle
                                      </div>)}
                                  </td>
                                  <td className={tableStyles.cell}>{vehicle.model}</td>
                                  <td className={tableStyles.cell}>{vehicle.vehicle_year || "-"}</td>
                                  <td className={tableStyles.cell}>{vehicle.vehicle_color || "-"}</td>
                                  <td className={tableStyles.cell}>
                                    <div>{vehicle.license_plate}</div>
                                    <div
                                        className={`mt-1 text-xs font-semibold ${getVehicleStatusTextClass(vehicle.vehicle_status)}`}>
                                        {vehicle.vehicle_status}
                                    </div>
                                  </td>
                                  <td className={tableStyles.cell}>{vehicle.vehicle_type}</td>
                                  <td className={tableStyles.cell}>{vehicle.seats}</td>
                                  <td className={tableStyles.cell}>{vehicle.luggage_capacity}</td>
                                  <td className={tableStyles.cell}>
                                      <div className="flex flex-wrap items-center gap-3">
                                          <Link href={`/admin/vehicles/${vehicle.id}`} className={formStyles.smallButton}>Details</Link>
                                          {vehicle.is_default_vehicle ? (
                                            <span className="text-xs font-semibold text-yellow-300"> Default </span>
                                            ) : vehicle.vehicle_status === "available" ? (
                                                <form action={setDefaultVehicle}>
                                                    <input type="hidden" name="vehicleId" value={vehicle.id} />
                                                    <input type="hidden" name="chauffeurId" value={vehicle.chauffeur_id}/>
                                                    <button type="submit"
                                                        className="rounded-lg border border-yellow-400/50 px-3 py-2 text-xs font-semibold text-yellow-200 hover:bg-yellow-400/10" >
                                                        Set default
                                                    </button>
                                                </form>
                                            ) : (
                                                <span className="text-xs font-semibold text-slate-500">
                                                    Unavailable
                                                </span>
                                            )
                                          }
                                          <form action={deleteVehicle}>
                                              <input type="hidden" name="vehicleId" value={vehicle.id} />
                                              <input type="hidden" name="chauffeurId" value={vehicle.chauffeur_id}/>
                                              <button type="submit" className={formStyles.deActiveDeleteButton}>Delete</button>
                                          </form>
                                      </div>
                                  </td>
                              </tr>

                              <tr className={`border-b border-cyan-400/70 bg-cyan-950/10 ${
                                  vehicle.vehicle_status === "inactive" ? "border-slate-600 bg-slate-800/70 opacity-80" :
                                    vehicle.vehicle_status !== "available" ? "border-red-400/50 bg-red-400/10" : "" }`}>
                                  <td colSpan={9} className="px-4 py-3 text-sm text-slate-300">
                                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                                          <span><strong className="text-cyan-300">Infant seats:</strong> {vehicle.infant_seat_count}</span>
                                          <span><strong className="text-cyan-300">Child seats:</strong> {vehicle.child_seat_count}</span>
                                          <span><strong className="text-cyan-300">Booster seats:</strong> {vehicle.booster_seat_count}</span>
                                          <span><strong className="text-cyan-300">ISOFIX:</strong> {vehicle.isofix_available ? "Yes" : "No"}</span>
                                          <span><strong className="text-cyan-300">Wheelchair:</strong> {getWheelchairAccessLabel(vehicle.wheelchair_access)}</span>
                                          <span><strong className="text-cyan-300">Capacity:</strong> {vehicle.wheelchair_capacity}</span>
                                          <span><strong className="text-cyan-300">Mobility-aid storage:</strong> {vehicle.mobility_aid_storage ? "Yes" : "No"}</span>
                                          <span><strong className="text-cyan-300">Large luggage:</strong> {vehicle.extra_large_luggage ? "Yes" : "No"}</span>
                                          {vehicle.status_reason && (
                                            <span>
                                                <strong className="text-red-300">Reason:</strong>{" "}
                                                {vehicle.status_reason}
                                            </span>)
                                          }
                                      </div>
                                  </td>
                              </tr>
                          </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            {/* Show a specific message when selected filters return no vehicles. */}
            {vehicleGroups.length === 0 && (
              <p className={tableStyles.cellEmpty}>
                {filterChauffeurId || filterLargeLuggage || filterMobilityStorage
                  ? "No vehicles match the selected filters."
                  : "No vehicles found yet."}
              </p>
            )}
          </div>
        </div>
      </main>
  );
}