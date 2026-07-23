/*================================================================
    build our own admin dashboard.
    creates a new admin page at: http://localhost:3000/admin/bookings
    Admin opens /admin/bookings
        ↓
    page.tsx asks Supabase for bookings
            ↓
    Supabase returns booking rows
            ↓
    page.tsx displays them in a table
=================================================================*/
import { supabaseAdmin } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pageStyles, tableStyles, formStyles, mobileStyle } from "@/styles/classNames";

import Link from "next/link"; 
import { Fragment } from "react";
import { getVehicleMatchResult, type VehicleWheelchairAccess } from "@/lib/vehicleMatching";
import type { WheelchairRequirement } from "@/types/wheelchairRequirementType";

//export const dynamic = "force-dynamic"; //Keep dynamic only in: src/app/admin/bookings/page.tsx 

type AdminBookingsPageProps = { searchParams: Promise<{success?: string; error?: string; }>;};

// type  = creates a TypeScript rule/shape for data
type BookingRow = 
{
    id: string;  pickup_location: string;  destination: string;  pickup_date: string;
    pickup_time: string;  passengers: number;  luggage: number;  trip_type: string;
    status: string;  created_at: string; notes: string; has_pets: boolean;
    infant_seat_count_required: number;  child_seat_count_required: number;
    booster_seat_count_required: number; isofix_required: boolean;
    wheelchair_requirement: string;  wheelchair_passenger_count: number;
    mobility_aid_storage_required: boolean;  extra_large_luggage_required: boolean;
    clients: {name: string;  email: string;  phone: string; } | null;
    chauffeur_id: string | null;
    chauffeurs: {name: string; email: string; phone: string; } | null;
    vehicle_id: string | null;
    vehicles: {
        id: string; brand: string; model: string; license_plate: string;
        vehicle_type: string; vehicle_year: number | null; vehicle_color: string | null;
    } | null;
};

type ChauffeurVehicleOption = {
    id: string; is_default_vehicle: boolean;
    seats: number; luggage_capacity: number;
    infant_seat_count: number; child_seat_count: number; booster_seat_count: number;
    isofix_available: boolean; wheelchair_access: string; wheelchair_capacity: number;
    mobility_aid_storage: boolean; extra_large_luggage: boolean;
};

//each approved chauffeur now includes the default vehicle capabilities required for matching.
type ChauffeurOption = {
    id: string; name: string; email: string;
    account_status: string; accepts_pets: boolean;
    vehicles: ChauffeurVehicleOption[];
};

/*=============Tscrip rules===================
   FUNCTION PURPOSE: QUICK BOOKING ASSIGNMENT
   Updates a booking from the small Save form inside the admin booking list.
   The form sends:
   - bookingId: identifies the booking;
   - chauffeurId: identifies the selected chauffeur;
   - status: contains the selected booking status.

   The function:
   - loads the booking requirements;
   - checks that the chauffeur is approved;
   - checks pet acceptance;
   - finds the chauffeur's default vehicle;
   - checks whether that vehicle matches the booking;
   - saves chauffeur_id, vehicle_id and status;
   - updates the chauffeur's automatic busy period;
   - refreshes the Admin Bookings page.

   TYPESCRIPT NOTES
    with revalidatePath = Refresh the admin bookings page data after the update.
    const vs let ==> const is used to define a variable and variable cannot be reassigned. Use let when the value may change
    const submitted: boolean = true; define a varibale of type boolean assign value true to it.
    const = creates a real variable/value
    let   = creates a real variable/value that can change
    var   = old way to create variables, usually avoid it
    type  = creates a TypeScript rule/shape for data
    supabaseAdmin.rpc() = calls a PostgreSQL function stored in Supabase.
    rpc("get_enum_values") = Run a custom function inside Supabase/PostgreSQL and give me the result.
    supabaseAdmin.from() = says it is a table.
    ?   = optional / safe access
    ??  = fallback when value is null or undefined
    :   = type annotation OR object property value
    ::  = not TypeScript; usually PostgreSQL type cast
====================================*/
async function updateBookingAdminFields(formData: FormData) {
    "use server";

    const bookingId = String(formData.get("bookingId") || "");
    const chauffeurId = String(formData.get("chauffeurId") || "");
    const status = String(formData.get("status") || "");
    const activeStatuses = ["accepted", "confirmed", "completed"];

    if (!bookingId || !status) { redirect("/admin/bookings?error=missing-fields"); }
    if (activeStatuses.includes(status) && !chauffeurId) {redirect("/admin/bookings?error=chauffeur-required"); }

    let vehicleId: string | null = null;

    /* Finds and validates the chauffeur's default vehicle. */
    if (chauffeurId) {
        const [
            { data: bookingRow, error: bookingError },
            { data: chauffeurRow, error: chauffeurError },
            { data: defaultVehicle, error: vehicleError },
        ] = await Promise.all([
            supabaseAdmin.from("bookings").select(`
                chauffeur_id, vehicle_id,
                vehicles(
                    id, chauffeur_id,
                    seats, luggage_capacity,
                    infant_seat_count, child_seat_count, booster_seat_count,
                    isofix_available, wheelchair_access, wheelchair_capacity,
                    mobility_aid_storage, extra_large_luggage
                ),
                passengers, luggage, has_pets,
                infant_seat_count_required, child_seat_count_required,
                booster_seat_count_required, isofix_required,
                wheelchair_requirement, wheelchair_passenger_count,
                mobility_aid_storage_required, extra_large_luggage_required
            `).eq("id", bookingId).maybeSingle(),

            supabaseAdmin.from("chauffeurs")
                .select("id, account_status, accepts_pets")
                .eq("id", chauffeurId).maybeSingle(),

            supabaseAdmin.from("vehicles").select(`
                id, seats, luggage_capacity,
                infant_seat_count, child_seat_count, booster_seat_count,
                isofix_available, wheelchair_access, wheelchair_capacity,
                mobility_aid_storage, extra_large_luggage
            `)
                .eq("chauffeur_id", chauffeurId)
                .eq("is_default_vehicle", true)
                .maybeSingle(),
        ]);

        if (bookingError || chauffeurError || vehicleError) {
            console.error("Could not validate quick assignment:", { bookingError, chauffeurError, vehicleError, });
            redirect("/admin/bookings?error=booking-update-failed");
        }
        if (!bookingRow) { redirect("/admin/bookings?error=booking-update-failed"); }
        if (!chauffeurRow || chauffeurRow.account_status !== "approved") { redirect("/admin/bookings?error=chauffeur-not-approved"); }
        if (bookingRow.has_pets && !chauffeurRow.accepts_pets) { redirect("/admin/bookings?error=chauffeur-does-not-accept-pets"); }
        if (!defaultVehicle) {redirect("/admin/bookings?error=default-vehicle-missing"); }

        const vehicleMatchesBooking = (vehicle: NonNullable<typeof defaultVehicle>) =>
            getVehicleMatchResult(
                {
                    seats: vehicle.seats,
                    luggageCapacity: vehicle.luggage_capacity,
                    infantSeatCount: vehicle.infant_seat_count,
                    childSeatCount: vehicle.child_seat_count,
                    boosterSeatCount: vehicle.booster_seat_count,
                    isofixAvailable: vehicle.isofix_available,
                    wheelchairAccess: vehicle.wheelchair_access as VehicleWheelchairAccess,
                    wheelchairCapacity: vehicle.wheelchair_capacity,
                    mobilityAidStorage: vehicle.mobility_aid_storage,
                    extraLargeLuggage: vehicle.extra_large_luggage,
                },
                {
                    passengers: bookingRow.passengers,
                    luggage: bookingRow.luggage ?? 0,
                    infantSeatCountRequired: bookingRow.infant_seat_count_required,
                    childSeatCountRequired: bookingRow.child_seat_count_required,
                    boosterSeatCountRequired: bookingRow.booster_seat_count_required,
                    isofixRequired: bookingRow.isofix_required,
                    wheelchairRequirement: bookingRow.wheelchair_requirement as WheelchairRequirement,
                    wheelchairPassengerCount: bookingRow.wheelchair_passenger_count,
                    mobilityAidStorageRequired: bookingRow.mobility_aid_storage_required,
                    extraLargeLuggageRequired: bookingRow.extra_large_luggage_required,
                }
            ).matches;

        const currentVehicle = Array.isArray(bookingRow.vehicles)
            ? bookingRow.vehicles[0]
            : bookingRow.vehicles;

        const currentVehicleCanStay =
            bookingRow.chauffeur_id === chauffeurId &&
            bookingRow.vehicle_id !== null &&
            currentVehicle?.id === bookingRow.vehicle_id &&
            currentVehicle.chauffeur_id === chauffeurId &&
            vehicleMatchesBooking(currentVehicle);

        if (currentVehicleCanStay && currentVehicle) {
            vehicleId = currentVehicle.id;
        } else {
            if (!defaultVehicle) { redirect("/admin/bookings?error=default-vehicle-missing"); }
            if (!vehicleMatchesBooking(defaultVehicle)) { redirect("/admin/bookings?error=default-vehicle-mismatch"); }
            vehicleId = defaultVehicle.id;
        }
    }

    /* Saves chauffeur, exact vehicle, status and busy period together. */
    const { error } = await supabaseAdmin.rpc("update_booking_admin_assignment", {
        p_booking_id: bookingId,
        p_chauffeur_id: chauffeurId || null,
        p_vehicle_id: vehicleId,
        p_status: status,
    });

    if (error) {
        console.error("Could not update booking assignment:", error);
        if (error.code === "23P01") {redirect("/admin/bookings?error=chauffeur-time-conflict"); }
        if (error.code === "22023") {
            if (error.message.includes("crosses midnight")) { redirect("/admin/bookings?error=journey-crosses-midnight"); }
            redirect("/admin/bookings?error=assignment-required");
        }

        redirect("/admin/bookings?error=booking-update-failed");
    }

    revalidatePath("/admin/bookings");
    redirect("/admin/bookings?success=booking-updated");
}

export default async function AdminBookingsPage({ searchParams}: AdminBookingsPageProps) {
  const pageMessage = await searchParams;
  const { data: bookings, error } = await supabaseAdmin // data: bookings= you are renaming data to bookings.
    .from("bookings")
    .select
    ( `
        id, pickup_location, destination, pickup_date, pickup_time, 
        passengers, luggage, trip_type, status, notes, created_at, has_pets,
        infant_seat_count_required, child_seat_count_required,
        booster_seat_count_required,  isofix_required,
        wheelchair_requirement, wheelchair_passenger_count,
        mobility_aid_storage_required, extra_large_luggage_required,
        clients (name, email, phone ),
        chauffeur_id, vehicle_id,
        chauffeurs (name, email, phone ),
        vehicles(id, brand, model, license_plate, vehicle_type, vehicle_year, vehicle_color) `
    )
    .order("created_at", { ascending: false });

    if (error) 
        {
            console.error("Could not load bookings:", error);
            return (
                <main className={pageStyles.main}>
                    <div className={pageStyles.containerMedium}>
                        <h1 className={pageStyles.pageTitle}> Admin bookings</h1>
                        <p className={pageStyles.errorMsg}> Could not load bookings. </p>
                    </div>
                </main>
            );
        }

    const { data: approvedChauffeurs, error: chauffeursError } = await supabaseAdmin
        .from("chauffeurs")
        .select(`
            id, name, email, account_status, accepts_pets,
            vehicles(
                id, is_default_vehicle,
                seats, luggage_capacity,
                infant_seat_count, child_seat_count, booster_seat_count,
                isofix_available, wheelchair_access, wheelchair_capacity,
                mobility_aid_storage, extra_large_luggage)`)
        .eq("account_status", "approved")
        .order("name", { ascending: true });

    const chauffeurOptions = (approvedChauffeurs ?? []) as unknown as ChauffeurOption[]; // as unknown => TypeScript, I know you are not sure about this data, but trust me: this is a ChauffeurOption[].
    if (chauffeursError) { console.error("Could not load approved chauffeurs:", chauffeursError);}
    const bookingRows = (bookings ?? []) as unknown as BookingRow[];
    
    const { data: bookingStatuses, error:bookingStatusError } = await supabaseAdmin.rpc( "get_enum_values", { p_enum_type_name: "booking_status"});
    if (bookingStatusError) { console.error("Could not load booking statuses:", bookingStatusError);}
    const bookingStatusOptions = (bookingStatuses ?? []) as string[];
    //===============helper function:
    function formatShortDate(dateValue: string | null) {
            if (!dateValue) { return "-"; }
            const [year, month, day] = dateValue.split("-");
            return `${day}/${month}/${year.slice(2)}`;
        }
    function formatShortTime(timeValue: string | null) {
        if (!timeValue) { return "-"; }
        return timeValue.slice(0, 5);
        }

    // formatShortBookingReference shows a shorter booking reference in the admin list.
    // The full booking ID is still available on the edit booking page.
    function formatShortBookingReference(bookingId: string) {
        if (!bookingId) { return "-"; }
        return bookingId.slice(0, 8);
    }

    function getWheelchairRequirementLabel(requirementValue: string) {
        if (requirementValue === "none") { return "None"; }
        if (requirementValue === "foldable") { return "Foldable wheelchair"; }
        if (requirementValue === "remain_in_wheelchair") { return "Remain seated in wheelchair"; }
        return requirementValue;
    }

    // Creates one readable label for the assigned vehicle.
    function getAssignedVehicleLabel(vehicle: BookingRow["vehicles"]) {
        if (!vehicle) { return "Not assigned"; }
        return `${vehicle.brand} ${vehicle.model} — ${vehicle.license_plate}`;
    }

    /* =========================================================================================
    PURPOSE: FILTER QUICK-SAVE CHAUFFEURS

    Quick Save automatically assigns the chauffeur's default vehicle.

    A chauffeur remains available only when:
    - pets are accepted when required;
    - a default vehicle exists;
    - that default vehicle matches all booking requirements.
    ========================================================================================= */
    function getQuickSaveChauffeurs(booking: BookingRow) {
        return chauffeurOptions.filter((chauffeur) => {
            if (booking.has_pets && !chauffeur.accepts_pets) { return false; }

            const defaultVehicle = (chauffeur.vehicles ?? []).find(
                (vehicle) => vehicle.is_default_vehicle
            );

            if (!defaultVehicle) { return false; }

            return getVehicleMatchResult(
                {
                    seats: defaultVehicle.seats,
                    luggageCapacity: defaultVehicle.luggage_capacity,
                    infantSeatCount: defaultVehicle.infant_seat_count,
                    childSeatCount: defaultVehicle.child_seat_count,
                    boosterSeatCount: defaultVehicle.booster_seat_count,
                    isofixAvailable: defaultVehicle.isofix_available,
                    wheelchairAccess: defaultVehicle.wheelchair_access as VehicleWheelchairAccess,
                    wheelchairCapacity: defaultVehicle.wheelchair_capacity,
                    mobilityAidStorage: defaultVehicle.mobility_aid_storage,
                    extraLargeLuggage: defaultVehicle.extra_large_luggage,
                },
                {
                    passengers: booking.passengers,
                    luggage: booking.luggage ?? 0,
                    infantSeatCountRequired: booking.infant_seat_count_required,
                    childSeatCountRequired: booking.child_seat_count_required,
                    boosterSeatCountRequired: booking.booster_seat_count_required,
                    isofixRequired: booking.isofix_required,
                    wheelchairRequirement: booking.wheelchair_requirement as WheelchairRequirement,
                    wheelchairPassengerCount: booking.wheelchair_passenger_count,
                    mobilityAidStorageRequired: booking.mobility_aid_storage_required,
                    extraLargeLuggageRequired: booking.extra_large_luggage_required,
                }
            ).matches;
        });
    }

    /* =====================================================
        <table>
            <thead>
                <tr>
                    <th>Column1 title</th>
                    <th>Column2 title</th>
                </tr>   
            </thead>
            <tbody>        body section
                <tr>         normal row
                <td>       normal cell: Runaky
                <td>       normal cell: Pending
            </tbody> 
        </table>
    ========================================================*/
    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}> 
                <Link  href="/admin" className={formStyles.link}  > ← Back to admin dashboard </Link>
                <p className={pageStyles.pageLabelUpper}> Admin </p>
                <h1 className={pageStyles.pageTitle}>Booking requests</h1>
                <p className={pageStyles.pageDescription}>  Here you can see booking requests submitted through the website. </p>

                {pageMessage.success === "chauffeur-assigned" && ( <p className={pageStyles.successMsgPage}>    Chauffeur assigned successfully. </p>)}
                {pageMessage.success === "status-updated" && ( <p className={pageStyles.successMsgPage}>    Booking status updated successfully. </p>)}
                {pageMessage.error === "missing-fields" && ( <p className={pageStyles.errorMsgPage}>    Please select the required booking information. </p>)}
                {pageMessage.error === "assign-failed" && ( <p className={pageStyles.errorMsgPage}>    Could not assign chauffeur. Please try again. </p>)}
                {pageMessage.error === "status-update-failed" && (  <p className={pageStyles.errorMsgPage}>    Could not update booking status. Please try again. </p>)}
                {pageMessage.success === "booking-updated" && ( <p className={pageStyles.successMsgPage}> Booking updated successfully. </p>)}
                {pageMessage.error === "booking-update-failed" && (  <p className={pageStyles.errorMsgPage}> Could not update booking. Please try again.  </p>)}
                {pageMessage.error === "chauffeur-time-conflict" && ( <p className={pageStyles.errorMsgPage}> This chauffeur already has another booking during this time. </p>)}
                {pageMessage.error === "chauffeur-required" && ( <p className={pageStyles.errorMsgPage}> Please assign a chauffeur before using an active booking status. </p> )}
                {pageMessage.error === "journey-crosses-midnight" && (<p className={pageStyles.errorMsgPage}>This journey crosses midnight and cannot yet create a busy period. </p> )}
                {pageMessage.error === "chauffeur-not-approved" && ( <p className={pageStyles.errorMsgPage}>Only an approved chauffeur can be assigned.</p>)}
                {pageMessage.error === "chauffeur-does-not-accept-pets" && ( <p className={pageStyles.errorMsgPage}>The selected chauffeur does not accept pets.</p>)}
                {pageMessage.error === "default-vehicle-missing" && (<p className={pageStyles.errorMsgPage}>The selected chauffeur has no default vehicle.</p>)}
                {pageMessage.error === "default-vehicle-mismatch" && (<p className={pageStyles.errorMsgPage}>The default vehicle does not match this booking. Use Edit booking to select another vehicle.</p>)}
                {pageMessage.error === "assignment-required" && ( <p className={pageStyles.errorMsgPage}>An active booking requires a chauffeur and matching vehicle.</p>)}

                {/* Mobile booking cards */}
                <div className="mt-10 grid gap-4 lg:hidden">
                    {bookingRows.map((booking) => (
                            <article  key={booking.id} className={mobileStyle.article} >
                                <div className="border-b border-white/10 pb-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="mt-1">
                                                <span className={mobileStyle.inforCaption}>Ref: </span>
                                                <span className={`${mobileStyle.infoValue} break-all`}>{formatShortBookingReference(booking.id)}</span>
                                            </p>
                                            <p className="mt-1">
                                                <span className={mobileStyle.inforCaption}>Client name: </span>
                                                <span className={mobileStyle.infoValue}>{booking.clients?.name}</span>
                                            </p>
                                            <p className="mt-1">
                                                <span className={mobileStyle.inforCaption}>Email: </span>
                                                <span className={mobileStyle.infoValue}>{booking.clients?.email}</span>
                                            </p>
                                            <div className="grid grid-cols-2 mt-1">
                                                <p>
                                                    <span className={mobileStyle.inforCaption}>Phone: </span>
                                                    <span className={mobileStyle.infoValue}>{booking.clients?.phone}</span>
                                                </p>                                            
                                            </div>                                       
                                            <p>
                                                <span className={mobileStyle.inforCaption}> Pickup  </span>
                                                <span className={mobileStyle.infoValue}>{booking.pickup_location}</span>
                                            </p>
                                            <div>
                                                <span className={mobileStyle.inforCaption}> Destination:  </span>
                                                <span className={mobileStyle.infoValue}>{booking.destination}</span>
                                            </div>
                                        </div>                                   
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-2">
                                    <div className="grid grid-cols-2 ">
                                        <div>
                                            <span className={mobileStyle.inforCaption}> Date: </span>
                                            <span className={mobileStyle.infoValue}>{formatShortDate(booking.pickup_date)}</span>
                                        </div>
                                        <div>
                                            <span className={mobileStyle.inforCaption}> Time: </span>
                                            <span className={mobileStyle.infoValue}>{formatShortTime(booking.pickup_time)}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 ">
                                        <div>
                                            <span className={mobileStyle.inforCaption}> Pax: </span>
                                            <span className={mobileStyle.infoValue}>{booking.passengers}</span>
                                        </div>
                                        <div>
                                            <span className={mobileStyle.inforCaption}> Trip: </span>
                                            <span className={mobileStyle.infoValue}>{booking.trip_type}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <span className={mobileStyle.inforCaption}>  Has pets:  </span>
                                        <span  className={booking.has_pets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed  } >
                                            {booking.has_pets  ? "yes ✓" : "No"}
                                        </span>
                                    </div>
                                    <div className="mt-3 border-t border-white/10 pt-3">
                                        <p className="font-semibold text-white">Passenger support</p>
                                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <span className={mobileStyle.inforCaption}>Infant seats: </span>
                                                <span className={mobileStyle.infoValue}>{booking.infant_seat_count_required}</span>
                                            </div>
                                            <div>
                                                <span className={mobileStyle.inforCaption}>Child seats: </span>
                                                <span className={mobileStyle.infoValue}>{booking.child_seat_count_required}</span>
                                            </div>
                                            <div>
                                                <span className={mobileStyle.inforCaption}>Booster seats: </span>
                                                <span className={mobileStyle.infoValue}>{booking.booster_seat_count_required}</span>
                                            </div>
                                            {booking.wheelchair_requirement === "remain_in_wheelchair" && (
                                                <div>
                                                    <span className={mobileStyle.inforCaption}>Wheelchair pas.: </span>
                                                    <span className={mobileStyle.infoValue}>{booking.wheelchair_passenger_count}</span>
                                                </div>
                                            )}
                                            <div className="col-span-2">
                                                <span className={mobileStyle.inforCaption}>Wheelchair: </span>
                                                <span className={mobileStyle.infoValue}>{getWheelchairRequirementLabel(booking.wheelchair_requirement)}</span>
                                            </div>
                                            <div>
                                                <span className={mobileStyle.inforCaption}>ISOFIX: </span>
                                                <span className={booking.isofix_required ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>
                                                    {booking.isofix_required ? "Yes" : "No"}
                                                </span>
                                            </div>
                                            <div>
                                                <span className={mobileStyle.inforCaption}>Large luggage: </span>
                                                <span className={booking.extra_large_luggage_required ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>
                                                    {booking.extra_large_luggage_required ? "Yes" : "No"}
                                                </span>
                                            </div>
                                            <div className="col-span-2 flex items-center gap-1">
                                                <span className={mobileStyle.inforCaption}>Mobility-aid storage:</span>
                                                <span className={booking.mobility_aid_storage_required ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>
                                                    {booking.mobility_aid_storage_required ? "Yes" : "No"}
                                                </span>
                                            </div>
                                            
                                        </div>
                                    </div>
                                    <div>
                                        <span className={mobileStyle.inforCaption}>  Notes:  </span>
                                        <span className={mobileStyle.infoValue}> {booking.notes || "-----"} </span>
                                    </div>
                                </div>

                                <form action={updateBookingAdminFields} className="mt-2 grid gap-3">
                                    <div>
                                        <span className={mobileStyle.inforCaption}>Assigned vehicle: </span>
                                        <span className={mobileStyle.infoValue}> {getAssignedVehicleLabel(booking.vehicles)} </span>
                                    </div>
                                    <div>
                                        <span className={mobileStyle.inforCaption}>Chauffeur: </span>
                                        <input type="hidden" name="bookingId" value={booking.id} />
                                        <span className={mobileStyle.infoValue}>
                                            <select name="chauffeurId" defaultValue={booking.chauffeur_id ?? ""}  className={`${formStyles.selectForm} w-full`}  >
                                                <option value="">Unassigned</option>
                                                {getQuickSaveChauffeurs(booking).map((chauffeur) => (<option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name}  </option> ))}
                                            </select>
                                        </span>
                                    </div>
                                    <span>
                                        <span className={mobileStyle.inforCaption}>Status: </span>
                                        <select name="status" defaultValue={booking.status} className={`${formStyles.selectForm} w-full`} >
                                            {bookingStatusOptions.map((status) => ( <option key={status} value={status}> {status} </option> ))}
                                        </select>
                                    </span>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button type="submit" className={formStyles.smallButton}> Save </button>
                                        <Link  href={`/admin/bookings/${booking.id}`}  className={formStyles.smallButton} > Edit </Link>
                                    </div>
                                </form>
                            </article>	  ))}

                    {bookingRows.length === 0 && (<div className={mobileStyle.article}>  No bookings found yet. </div> )}
                </div>

                {/* Desktop booking table */}
                <div className={`${tableStyles.DivCyanList} hidden max-h-[75vh] overflow-auto scrollbar-thin scrollbar-thumb-cyan-700 scrollbar-track-slate-950 lg:block`}>
                <table className={`${tableStyles.table1000} min-w-312.5`}>
                    <thead className={tableStyles.tableHeaderCyan}>
                        <tr>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Client </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Pickup </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Destination </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Date </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Time </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Pax  </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Trip </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Luggage </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Has pet </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> </th>
                        </tr>
                    </thead>
                        <tbody>
                            {bookingRows.map((booking) => (
                            <Fragment key={booking.id}>
                                <tr className={`${tableStyles.rowCyan} align-top border-b-0`}>
                                    <td className={tableStyles.cellCaption}>
                                        <div className={tableStyles.cellCaptionGroup}> {booking.clients?.name || "Unknown client"} </div>
                                        <div className={tableStyles.cellInfo}> Ref: {formatShortBookingReference(booking.id)} </div>
                                        <div className={tableStyles.cellInfo}> {booking.clients?.email}</div>
                                        <div className={tableStyles.cellInfo}> {booking.clients?.phone} </div>
                                    </td>

                                    <td className={tableStyles.cell}>{booking.pickup_location}</td>
                                    <td className={tableStyles.cell}>{booking.destination}</td>
                                    <td className={tableStyles.cell}>{formatShortDate(booking.pickup_date)}</td>
                                    <td className={tableStyles.cell}>{formatShortTime(booking.pickup_time)}</td>
                                    <td className={tableStyles.cell}>Pax:{" "}{booking.passengers}</td>
                                    <td className={tableStyles.cell}>Trip:{" "}{booking.trip_type}</td>
                                    <td className={tableStyles.cell}>LUGG:{" "} {booking.luggage}</td>
                                    <td className={`${tableStyles.cell} whitespace-nowrap`}>
                                        <span  className={booking.has_pets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed  } >
                                            {booking.has_pets  ? "Pet ✓" : "No pet"}
                                        </span>
                                    </td>
                                    <td className={tableStyles.cell}></td>
                                </tr>
                                <tr className="border-b border-cyan-400/10 bg-cyan-950/10">
                                    <td colSpan={4} className="px-4 pb-4 pt-0 text-sm text-slate-300">
                                        <div className="rounded-xl bg-slate-950/30 px-3 py-2">
                                            <span className={tableStyles.cellCaptionSecondRow}>Notes: </span>
                                            <span className= {tableStyles.cellNote}> {booking.notes || "-----"} </span>
                                        </div>
                                    </td>
                                    <td colSpan={5} className="px-4 pb-4 pt-0 text-sm text-slate-300">
                                        <form action={updateBookingAdminFields} className="flex items-end justify-end gap-3" >
                                            <input type="hidden" name="bookingId" value={booking.id} />
                                            <label className="grid w-32 shrink-0 gap-2">
                                                <span className={tableStyles.cellCaptionSecondRow}> Booking status</span>
                                                <select  name="status"  defaultValue={booking.status}  className={formStyles.selectForm}  >
                                                    {bookingStatusOptions.map((status) => (<option key={status} value={status}> {status}  </option> ))}
                                                </select>
                                            </label>                                            
                                            <label className="grid w-44 shrink-0 gap-2">
                                                <span className={tableStyles.cellCaptionSecondRow}> Assigned chauffeur</span>
                                                <select name="chauffeurId" defaultValue={booking.chauffeur_id ?? ""}  className={formStyles.selectForm} >
                                                    <option value="">Unassigned</option>
                                                    {getQuickSaveChauffeurs(booking).map((chauffeur) => (<option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name}  </option>  ))}
                                                </select>
                                            </label>
                                            <button type="submit" className={formStyles.smallButton}>
                                                Save
                                            </button>
                                            <Link href={`/admin/bookings/${booking.id}`} className={formStyles.smallButton} >
                                                Edit booking
                                            </Link>
                                        </form>
                                    </td>
                                </tr>
                                <tr className="border-b border-cyan-400/70 bg-cyan-950/10">
                                    <td colSpan={10} className="px-4 py-3 text-sm text-slate-300">
                                        <p className="mb-2 font-semibold text-white">Passenger support</p>

                                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                                            <span><strong className="text-cyan-300">Infant seats:</strong> {booking.infant_seat_count_required}</span>
                                            <span><strong className="text-cyan-300">Child seats:</strong> {booking.child_seat_count_required}</span>
                                            <span><strong className="text-cyan-300">Booster seats:</strong> {booking.booster_seat_count_required}</span>
                                            <span><strong className="text-cyan-300">ISOFIX:</strong> {booking.isofix_required ? "Yes" : "No"}</span>
                                            <span><strong className="text-cyan-300">Wheelchair:</strong> {getWheelchairRequirementLabel(booking.wheelchair_requirement)}</span>

                                            {booking.wheelchair_requirement === "remain_in_wheelchair" && (
                                                <span><strong className="text-cyan-300">Wheelchair passengers:</strong> {booking.wheelchair_passenger_count}</span>
                                            )}

                                            <span><strong className="text-cyan-300">Mobility-aid storage:</strong> {booking.mobility_aid_storage_required ? "Yes" : "No"}</span>
                                            <span><strong className="text-cyan-300">Large luggage:</strong> {booking.extra_large_luggage_required ? "Yes" : "No"}</span>
                                            <span>
                                                <strong className="text-cyan-300">Assigned vehicle:</strong>{" "}
                                                {getAssignedVehicleLabel(booking.vehicles)}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            </Fragment>))}

                            {bookingRows.length === 0 && (<tr><td className={tableStyles.cellEmpty} colSpan={11}> No bookings found yet. </td></tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}