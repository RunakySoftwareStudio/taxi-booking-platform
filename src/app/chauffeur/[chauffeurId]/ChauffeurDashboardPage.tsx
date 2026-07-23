import { createClient as createAuthClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import Link from "next/link";
import { pageStyles, tableStyles, formStyles, mobileStyle } from "@/styles/classNames";
import { formatShortDate, formatShortTime } from "@/lib/formatDateTime";
import { Fragment } from "react";
import { TranslatedText } from "@/components/TranslatedText";

//export const dynamic = "force-dynamic"; //Keep dynamic only in: src/app/admin/chauffeurs/[chauffeurid]/page.tsx 
type TypeChauffeurRow = { id: string;  name: string;  email: string;  phone: string;  service_area: string | null;  account_status: string;};

type TypeAssignedBookingRow = {
    id: string;
    pickup_location: string;
    destination: string;
    pickup_date: string;
    pickup_time: string;
    passengers: number;
    luggage: number;
    has_pets: boolean;
    trip_type: string;
    status: string;
    notes: string | null;
    vehicle_id: string | null;
    vehicles: {
        id: string; brand: string; model: string; license_plate: string;
    } | null;
    clients: { name: string; email: string; phone: string } | null;
};

//type TypePromiseChauffeurId = { params: Promise<{ chauffeurId: string; }>;};
type ChauffeurDashboardPageProps = { params: Promise<{chauffeurId: string; }>;searchParams: Promise<{ success?: string; error?: string; }>;};
type TypeVehicleRow = {
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
    infant_seat_count: number;
    child_seat_count: number;
    booster_seat_count: number;
    isofix_available: boolean;
    wheelchair_access: string;
    wheelchair_capacity: number;
    mobility_aid_storage: boolean;
    extra_large_luggage: boolean;
    created_at: string;
};

// Creates one readable label for the vehicle assigned to a booking.
function getAssignedVehicleLabel(vehicle: TypeAssignedBookingRow["vehicles"]) {
    if (!vehicle) { return ""; }
    return `${vehicle.brand} ${vehicle.model} — ${vehicle.license_plate}`;
}

/*
  getTripTypeTextKey converts the database trip type
  into a translation key for readable page text.
*/
function getTripTypeTextKey(tripType: string) {
    if (tripType === "one_way" || tripType === "one-way") { return "tripTypeOneWay"; }
    if (tripType === "return") { return "tripTypeReturn"; }
    if (tripType === "airport") { return "tripTypeAirport"; }
    if (tripType === "business") { return "tripTypeBusiness"; }

    return "";
}

/*
  getBookingStatusTextKey converts the database booking status
  into a translation key for readable dropdown text.
*/
function getBookingStatusTextKey(statusValue: string) {
    if (statusValue === "pending") { return "bookingStatusPending"; }
    if (statusValue === "approved") { return "bookingStatusApproved"; }
    if (statusValue === "accepted") { return "bookingStatusAccepted"; }
    if (statusValue === "assigned") { return "bookingStatusAssigned"; }
    if (statusValue === "completed") { return "bookingStatusCompleted"; }
    if (statusValue === "cancelled") { return "bookingStatusCancelled"; }
    if (statusValue === "rejected") { return "bookingStatusRejected"; }
    if (statusValue === "confirmed") { return "bookingStatusConfirmed"; }

    return "";
}
/*
  getChauffeurAccountStatusTextKey converts the database account status
  into a translation key for readable page text.
*/
function getChauffeurAccountStatusTextKey(accountStatus: string) {
    if (accountStatus === "pending_approval") { return "statusPendingApproval"; }
    if (accountStatus === "approved") { return "statusApproved"; }
    if (accountStatus === "inactive") { return "statusInactive"; }
    if (accountStatus === "suspended") { return "statusSuspended"; }

    return "";
}

function getWheelchairAccessTextKey(accessValue: string) {
    if (accessValue === "none") { return "wheelchairNone"; }
    if (accessValue === "foldable_only") { return "wheelchairFoldableOnly"; }
    if (accessValue === "ramp") { return "wheelchairRamp"; }
    if (accessValue === "lift") { return "wheelchairLift"; }
    return "";
}
// Updates an assigned booking and keeps the chauffeur busy period synchronized.
async function updateAssignedBookingStatus(formData: FormData) {
    "use server";

    const bookingId = String(formData.get("bookingId") || "");
    const submittedChauffeurId = String(formData.get("chauffeurId") || "");
    const status = String(formData.get("status") || "");
    if (!bookingId || !submittedChauffeurId || !status) { redirect(`/chauffeur/${submittedChauffeurId}?error=missing-fields`);  }

    const authSupabase = await createAuthClient();
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) { redirect("/login"); }

    const { data: profile } = await authSupabase
        .from("user_profiles")
        .select("role, chauffeur_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (!profile) { redirect("/unauthorized"); }

    const isAdminUser = profile.role === "admin";
    if (!isAdminUser && profile.chauffeur_id !== submittedChauffeurId) { redirect("/unauthorized"); }

    const authorizedChauffeurId = isAdminUser ? submittedChauffeurId : profile.chauffeur_id;
    if (!authorizedChauffeurId) { redirect("/unauthorized"); }

    // Confirms that the booking belongs to the authorized chauffeur.
    const { data: assignedBooking, error: bookingCheckError } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .eq("id", bookingId)
        .eq("chauffeur_id", authorizedChauffeurId)
        .maybeSingle();

    if (bookingCheckError || !assignedBooking) {
        console.error("Could not verify chauffeur booking:", bookingCheckError);
        redirect(`/chauffeur/${authorizedChauffeurId}?error=status-update-failed`);
    }

    // Updates the booking status and its linked busy period in one transaction.
    const { error } = await supabaseAdmin.rpc("update_booking_admin_assignment", {
        p_booking_id: bookingId,
        p_chauffeur_id: authorizedChauffeurId,
        p_status: status,
    });

    // 23P01 is the PostgreSQL error code for the overlapping-time exclusion constraint.
    if (error) {
        console.error("Could not update chauffeur booking status:", error);
        if (error.code === "23P01") { redirect(`/chauffeur/${authorizedChauffeurId}?error=booking-time-conflict`);  }
        redirect(`/chauffeur/${authorizedChauffeurId}?error=status-update-failed`);
    }

    revalidatePath(`/chauffeur/${authorizedChauffeurId}`);
    revalidatePath("/admin/bookings");

    redirect(`/chauffeur/${authorizedChauffeurId}?success=status-updated`);
}


export default async function ChauffeurDashboardPage({params,searchParams}: ChauffeurDashboardPageProps) {
  const pageMessage = await searchParams;
  const { chauffeurId } = await params;
    /*========================================
        default             → homepage
        if user is admin    → admin chauffeurs page
        if user is chauffeur → homepage
    ===========================================  */
   // Check who is logged in and which chauffeur record belongs to them.
    const authSupabase = await createAuthClient();
    const { data: { user }, } = await authSupabase.auth.getUser();

    if (!user) { redirect("/login"); }

    const { data: profile } = await authSupabase
    .from("user_profiles")
    .select("role, chauffeur_id")
    .eq("user_id", user.id)
    .maybeSingle();

    if (!profile) { redirect("/");}

    const isAdminUser = profile.role === "admin";

    // A chauffeur may only open their own dashboard.
    // An admin may open any chauffeur dashboard.
    if (!isAdminUser && profile.chauffeur_id !== chauffeurId) { redirect( profile.chauffeur_id ? `/chauffeur/${profile.chauffeur_id}` : "/" ); }

    const backLinkHref = isAdminUser ? "/admin/chauffeurs" : "/";
    const backLinkTextKey = isAdminUser ? "backToAdminChauffeurs"  : "backToHomepage";

    // get chauffeur data of this chauffeur id
    const { data: supabaseAdminChauffeur, error: chauffeurError } = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name, email, phone, service_area, account_status, accepts_pets")
        .eq("id", chauffeurId)
        .single();

    // Show error if chauffeur does not exists
    if (chauffeurError || !supabaseAdminChauffeur) 
    {   console.error("Could not load chauffeur:", chauffeurError);
        return (
            <main className={pageStyles.main}>
                <div className={pageStyles.containerMedium}>
                    <p className={pageStyles.errorMsg}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="couldNotLoadChauffeur" /> </p>
                </div>
            </main>
        );
    }

    // get the list of bookings of this chauffeurid in booking table
    const { data: supabaseAdminBookings, error: bookingsError } = await supabaseAdmin
        .from("bookings")
        .select (`id, vehicle_id, pickup_location, destination, pickup_date, pickup_time, passengers, luggage, has_pets, trip_type, status, notes, clients (name, email, phone) `)
        .eq("chauffeur_id", chauffeurId)
        .order("pickup_date", { ascending: true })
        .order("pickup_time", { ascending: true });
    
    // give warnning in form of red message if there are error in bookings
    if (bookingsError) { console.error("Could not load chauffeur bookings:", bookingsError);}

    const { data: supabaseAdminVehicles, error: vehiclesError } = await supabaseAdmin
        .from("vehicles")
        .select(`id, brand, model, license_plate, vehicle_type, seats, luggage_capacity, vehicle_year, vehicle_color, 
            infant_seat_count, child_seat_count, booster_seat_count, isofix_available, wheelchair_access,
            wheelchair_capacity, mobility_aid_storage, extra_large_luggage, created_at`)
        .eq("chauffeur_id", chauffeurId)
        .order("created_at", { ascending: false });
    
    // give warnning in form of red message if there are error in vehicles
    if (vehiclesError) { console.error("Could not load chauffeur vehicles:", vehiclesError); }

    // assign values to know const varaiables
    const chauffeurRow = supabaseAdminChauffeur as TypeChauffeurRow;
    const bookingRows = (supabaseAdminBookings ?? []) as unknown as TypeAssignedBookingRow[];
    const vehicleRows = (supabaseAdminVehicles ?? []) as TypeVehicleRow[];
    
    // get list of bookingStatuses types
    const { data: supabaseAdminBookingStatuses, error: bookingStatusError } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "booking_status" });
    if (bookingStatusError) { console.error("Could not load booking statuses:", bookingStatusError);}
    const bookingStatusOptions = (supabaseAdminBookingStatuses ?? []) as string[];
    const chauffeurAccountStatusTextKey = getChauffeurAccountStatusTextKey(chauffeurRow.account_status);

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}> 
                <div className="flex items-start justify-between gap-4">
                    <Link href={backLinkHref} className={formStyles.link}> <TranslatedText sectionName="chauffeurDashboardPage" textKey={backLinkTextKey} /> </Link>
                    <LogoutButton />
                </div>
                <p className={pageStyles.pageLabelUpper}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="chauffeurLabel" /> </p>
                <h1 className={pageStyles.pageTitle}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="welcomePrefix" /> {chauffeurRow.name} </h1>
                <p className={pageStyles.pageDescription}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="description" /> </p>
                
                {pageMessage.success === "status-updated" && (<p className={pageStyles.successMsgPage}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="statusUpdatedSuccess" /> </p>)}
                {pageMessage.error === "missing-fields" && (<p className={pageStyles.errorMsgPage}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="missingFieldsError" /> </p>)}
                {pageMessage.error === "status-update-failed" && (<p className={pageStyles.errorMsgPage}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="statusUpdateFailedError" /> </p>)}
                {pageMessage.error === "booking-time-conflict" && (<p className={pageStyles.errorMsgPage}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="bookingTimeConflictError" /> </p> )}
                
                {/* Aligns labels with the active language while keeping email and phone characters left-to-right. */}
                <div className={`${formStyles.info} mt-8 grid gap-4 sm:grid-cols-3`}>
                    <div className="text-start">
                        <span className={formStyles.formInputInfoCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="emailLabel" />: </span>
                        <span className={`${formStyles.formInputInfoValue} technical-value`}>{chauffeurRow.email}</span>
                    </div>

                    <div className="text-start">
                        <span className={formStyles.formInputInfoCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="phoneLabel" />: </span>
                        <span className={`${formStyles.formInputInfoValue} technical-value`}>{chauffeurRow.phone}</span>
                    </div>

                    <div className="text-start">
                        <span className={formStyles.formInputInfoCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="statusLabel" />: </span>
                        <span className={formStyles.formInputInfoValue}>{chauffeurAccountStatusTextKey ? <TranslatedText sectionName="chauffeurDashboardPage" textKey={chauffeurAccountStatusTextKey} /> : chauffeurRow.account_status}</span>
                    </div>
                </div>
                {/*====================================                
                → shows chauffeur information
                → has button: Manage availability
                → Shows the three self-management options only to the chauffeur.
                ==========================================*/}
                {!isAdminUser && (
                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                        <article className={`${formStyles.info} grid gap-4`}>
                            <p className="text-sm text-slate-300"><TranslatedText sectionName="chauffeurDashboardPage" textKey="editMyInformationDescription" /></p>
                            <Link href={`/chauffeur/${chauffeurRow.id}/profile`} className={formStyles.primaryButtonOutside}><TranslatedText sectionName="chauffeurDashboardPage" textKey="editMyInformationButton" /></Link>
                        </article>

                        <article className={`${formStyles.info} grid gap-4`}>
                            <p className="text-sm text-slate-300"><TranslatedText sectionName="chauffeurDashboardPage" textKey="manageUnavailabilityDescription" /></p>
                            <Link href={`/chauffeur/${chauffeurRow.id}/availability`} className={formStyles.primaryButtonOutside}>
                            <TranslatedText sectionName="chauffeurDashboardPage" textKey="manageUnavailabilityButton" /></Link>
                        </article>
                    </div>
                )}

                {/* Keeps the existing administrator edit option separate. */}
                {isAdminUser && (
                    <div className="mt-8">
                        <Link href={`/admin/chauffeurs/${chauffeurRow.id}`} className={formStyles.primaryButtonOutside}><TranslatedText sectionName="chauffeurDashboardPage" textKey="editDetailsButton" /></Link>
                    </div>
                )}

                <h3 className={tableStyles.headerTableSmall}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="myVehiclesTitle" /> </h3>
                {/* Mobile vehicle cards  */}
                <div className="mt-6 grid gap-4 lg:hidden">
                    {vehicleRows.map((vehicle) => (
                    <article key={vehicle.id} className={mobileStyle.article}>
                        <div>
                            <TranslatedText sectionName="chauffeurDashboardPage" textKey="brandModelLabel" />
                            <span className={mobileStyle.infoValue}> {vehicle.brand} ({vehicle.model})</span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-1">
                            <div>
                                <span className= {mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="licenseLabel" />: </span>
                                <span className= {mobileStyle.infoValue} >{vehicle.license_plate}</span>
                            </div>
                            <div>
                                <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="typeLabel" /> :</span>
                                <span className={mobileStyle.infoValue} >{vehicle.vehicle_type}</span>
                            </div>
                            <div>
                                <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="seatsLabel" />: </span>
                                <span className={mobileStyle.infoValue} >{vehicle.seats}</span>
                            </div>
                            <div>
                                <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="luggageLabel" />: </span>
                                <span className={mobileStyle.infoValue} >{vehicle.luggage_capacity}</span>
                            </div>
                            <div>
                                <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="yearLabel" /> :</span>
                                <span className={mobileStyle.infoValue} >{vehicle.vehicle_year?vehicle.vehicle_year:"---"}</span>
                            </div>
                            <div>
                                <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="colorLabel" />: </span>
                                <span className={mobileStyle.infoValue} >{vehicle.vehicle_color?vehicle.vehicle_color: "---" }</span>
                            </div>
                            <div className="mt-4 border-t border-white/10 pt-4">
                                <p className="font-semibold text-cyan-300"><TranslatedText sectionName="chauffeurDashboardPage" textKey="passengerSupportTitle" /></p>

                                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                    <div><span className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="infantSeatsLabel" />: </span><span className={mobileStyle.infoValue}>{vehicle.infant_seat_count}</span></div>
                                    <div><span className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="childSeatsLabel" />: </span><span className={mobileStyle.infoValue}>{vehicle.child_seat_count}</span></div>
                                    <div><span className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="boosterSeatsLabel" />: </span><span className={mobileStyle.infoValue}>{vehicle.booster_seat_count}</span></div>
                                    <div><span className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="isofixLabel" />: </span><span className={vehicle.isofix_available ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>{vehicle.isofix_available ? <TranslatedText sectionName="chauffeurDashboardPage" textKey="yes" /> : <TranslatedText sectionName="chauffeurDashboardPage" textKey="no" />}</span></div>

                                    <div className="col-span-2">
                                        <span className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="wheelchairAccessLabel" />: </span>
                                        <span className={mobileStyle.infoValue}>
                                            {getWheelchairAccessTextKey(vehicle.wheelchair_access) ? <TranslatedText sectionName="chauffeurDashboardPage" textKey={getWheelchairAccessTextKey(vehicle.wheelchair_access)} /> : vehicle.wheelchair_access}
                                        </span>
                                    </div>

                                    <div><span className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="wheelchairCapacityLabel" />: </span><span className={mobileStyle.infoValue}>{vehicle.wheelchair_capacity}</span></div>
                                    <div><span className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="mobilityAidStorageLabel" />: </span><span className={vehicle.mobility_aid_storage ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>{vehicle.mobility_aid_storage ? <TranslatedText sectionName="chauffeurDashboardPage" textKey="yes" /> : <TranslatedText sectionName="chauffeurDashboardPage" textKey="no" />}</span></div>
                                    <div><span className={mobileStyle.inforCaption}><TranslatedText sectionName="chauffeurDashboardPage" textKey="extraLargeLuggageLabel" />: </span><span className={vehicle.extra_large_luggage ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>{vehicle.extra_large_luggage ? <TranslatedText sectionName="chauffeurDashboardPage" textKey="yes" /> : <TranslatedText sectionName="chauffeurDashboardPage" textKey="no" />}</span></div>
                                </div>
                            </div>
                        </div>
                    </article>  ))}
                    {vehicleRows.length === 0 && ( 
                        <div className={tableStyles.cellEmpty}> 
                            <TranslatedText sectionName="chauffeurDashboardPage" textKey="noVehiclesMessage" /> 
                        </div>  )}
                </div>

                {/* Desktop vehicle table */}
                <div className={`${tableStyles.tableDiv} hidden lg:block`}>
                <table className={tableStyles.table1000}>
                    <thead className={tableStyles.tableHeaderCyan}>
                    <tr>
                        <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="brandLabel" /> </th>
                        <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="modelLabel" /> </th>
                        <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="licensePlateLabel" /> </th>
                        <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="typeLabel" /> </th>
                        <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="seatsLabel" /> </th>
                        <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="luggageLabel" /> </th>
                        <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="yearLabel" /> </th>
                        <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="colorLabel" /> </th>
                    </tr>
                    </thead>

                    <tbody>
                        {vehicleRows.map((vehicle) => (
                            <Fragment key={vehicle.id}>
                                <tr  className="border-b border-white/10">
                                    <td className={tableStyles.cell}>{vehicle.brand}</td>
                                    <td className={tableStyles.cell}>{vehicle.model}</td>
                                    <td className={tableStyles.cell}>{vehicle.license_plate}</td>
                                    <td className={tableStyles.cell}>{vehicle.vehicle_type}</td>
                                    <td className={tableStyles.cell}>{vehicle.seats}</td>
                                    <td className={tableStyles.cell}>{vehicle.luggage_capacity}</td>
                                    <td className={tableStyles.cell}>{vehicle.vehicle_year || "---"}</td>
                                    <td className={tableStyles.cell}>{vehicle.vehicle_color || "---"}</td>
                                </tr>

                                <tr className="border-b border-cyan-400/30 bg-cyan-950/10">
                                    <td colSpan={8} className="px-4 py-3 text-sm text-slate-300">
                                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                                            <span><strong className="text-cyan-300"><TranslatedText sectionName="chauffeurDashboardPage" textKey="infantSeatsLabel" />:</strong> {vehicle.infant_seat_count}</span>
                                            <span><strong className="text-cyan-300"><TranslatedText sectionName="chauffeurDashboardPage" textKey="childSeatsLabel" />:</strong> {vehicle.child_seat_count}</span>
                                            <span><strong className="text-cyan-300"><TranslatedText sectionName="chauffeurDashboardPage" textKey="boosterSeatsLabel" />:</strong> {vehicle.booster_seat_count}</span>
                                            <span><strong className="text-cyan-300"><TranslatedText sectionName="chauffeurDashboardPage" textKey="isofixLabel" />:</strong> {vehicle.isofix_available ? <TranslatedText sectionName="chauffeurDashboardPage" textKey="yes" /> : <TranslatedText sectionName="chauffeurDashboardPage" textKey="no" />}</span>

                                            <span>
                                                <strong className="text-cyan-300"><TranslatedText sectionName="chauffeurDashboardPage" textKey="wheelchairAccessLabel" />:</strong>{" "}
                                                {getWheelchairAccessTextKey(vehicle.wheelchair_access) ? <TranslatedText sectionName="chauffeurDashboardPage" textKey={getWheelchairAccessTextKey(vehicle.wheelchair_access)} /> : vehicle.wheelchair_access}
                                            </span>

                                            <span><strong className="text-cyan-300"><TranslatedText sectionName="chauffeurDashboardPage" textKey="wheelchairCapacityLabel" />:</strong> {vehicle.wheelchair_capacity}</span>
                                            <span><strong className="text-cyan-300"><TranslatedText sectionName="chauffeurDashboardPage" textKey="mobilityAidStorageLabel" />:</strong> {vehicle.mobility_aid_storage ? <TranslatedText sectionName="chauffeurDashboardPage" textKey="yes" /> : <TranslatedText sectionName="chauffeurDashboardPage" textKey="no" />}</span>
                                            <span><strong className="text-cyan-300"><TranslatedText sectionName="chauffeurDashboardPage" textKey="extraLargeLuggageLabel" />:</strong> {vehicle.extra_large_luggage ? <TranslatedText sectionName="chauffeurDashboardPage" textKey="yes" /> : <TranslatedText sectionName="chauffeurDashboardPage" textKey="no" />}</span>
                                        </div>
                                    </td>
                                </tr>
                            </Fragment>
                        ))}

                        {vehicleRows.length === 0 && ( 
                            <tr> 
                                <td className={tableStyles.cellEmpty} colSpan={8}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="noVehiclesMessage" /> </td> 
                            </tr> )}
                    </tbody>
                </table>
                </div>

                <h3 className={tableStyles.headerTableSmall}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="assignedBookingsTitle" /> ({bookingRows.length})</h3>
                {/* Mobile booking cards  */}
                <div className="mt-6 grid gap-4 lg:hidden">
                {bookingRows.map((booking) => (
                    <article key={booking.id}  className={mobileStyle.article}>
                    <div className="border-b border-white/10 pb-4">
                            <div>
                                <span className= {mobileStyle.inforCaption}><span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="clientLabel" />: </span> </span>
                                <span className= {mobileStyle.infoValue}>{booking.clients?.name || <TranslatedText sectionName="chauffeurDashboardPage" textKey="unknownClient" />}</span>
                            </div>
                            <div>
                                <span className= {mobileStyle.inforCaption}><span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="mailLabel" />: </span></span>
                                <span className= {mobileStyle.infoValue} >{booking.clients?.email}</span>
                            </div>
                            <div>
                                <span className= {mobileStyle.inforCaption}><span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="phoneLabel" />: </span> </span>
                                <span className= {mobileStyle.infoValue} >{booking.clients?.phone}</span>
                            </div>     
                            <div>
                                <span className={mobileStyle.inforCaption}> <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="pickupLabel" />: </span> </span>
                                <span className={mobileStyle.infoValue}>{booking.pickup_location}</span>
                            </div>
                            <div>
                                <span className={mobileStyle.inforCaption}> <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="destinationLabel" />: </span></span>
                                <span className={mobileStyle.infoValue}>{booking.destination}</span>
                            </div>                       
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                            <span className={mobileStyle.inforCaption}> <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="dateLabel" />: </span> </span>
                            <span className={mobileStyle.infoValue}>{formatShortDate(booking.pickup_date)}</span>
                        </div>
                        <div>
                            <span className={mobileStyle.inforCaption}> <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="timeLabel" />: </span></span>
                            <span className={mobileStyle.infoValue}>{formatShortTime(booking.pickup_time)}</span>
                        </div>

                        <div>
                            <span className={mobileStyle.inforCaption}> <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="paxLabel" />: </span> </span>
                            <span className={mobileStyle.infoValue}>{booking.passengers}</span>
                        </div>

                        <div>
                            <span className={mobileStyle.inforCaption}> <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="tripLabel" />: </span> </span>
                            <span className={mobileStyle.infoValue}>
                                {getTripTypeTextKey(booking.trip_type) ? <TranslatedText sectionName="chauffeurDashboardPage" textKey={getTripTypeTextKey(booking.trip_type)} /> : booking.trip_type}
                            </span>
                        </div>
                        <div>
                            <span className={mobileStyle.inforCaption}> <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="hasPetsLabel" />: </span>  </span>
                            <span  className={booking.has_pets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed  } >
                                {booking.has_pets ? <TranslatedText sectionName="chauffeurDashboardPage" textKey="yes" /> : <TranslatedText sectionName="chauffeurDashboardPage" textKey="no" />}
                            </span>
                        </div>
                        <div>
                            <span className={mobileStyle.inforCaption}> <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="luggageLabel" />: </span> </span>
                            <span className={mobileStyle.infoValue}>{booking.luggage}</span>
                        </div>
                    </div>
                    <div className="col-span-2 mt-4">
                        <span className={mobileStyle.inforCaption}>
                            <TranslatedText sectionName="chauffeurDashboardPage"  textKey="assignedVehicleLabel" />:{" "}
                        </span>
                        <span className={mobileStyle.infoValue}>
                            {booking.vehicles
                                ? getAssignedVehicleLabel(booking.vehicles)
                                : (<TranslatedText sectionName="chauffeurDashboardPage" textKey="vehicleNotAssigned" /> )}
                        </span>
                    </div>
                    <div className="mt-4">
                        <span className={mobileStyle.inforCaption}>  <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="notesLabel" />: </span>  </span>
                        <span className={mobileStyle.infoValue}> {booking.notes || "-----"} </span>
                    </div>
                    <form action={updateAssignedBookingStatus} className="mt-5 grid gap-3">
                        <input type="hidden" name="bookingId" value={booking.id} />
                        <input type="hidden" name="chauffeurId" value={chauffeurRow.id} />

                        <select name="status"  defaultValue={booking.status}  className={`${tableStyles.selectTable} w-full`}>
                           {bookingStatusOptions.map((status) => {
                                const bookingStatusTextKey = getBookingStatusTextKey(status);
                                return (
                                    <option key={status} value={status}>
                                        {bookingStatusTextKey ? <TranslatedText sectionName="chauffeurDashboardPage" textKey={bookingStatusTextKey} /> : status}
                                    </option>
                                );
                            })}
                        </select>

                        <button type="submit" className={formStyles.smallButton}>
                            <TranslatedText sectionName="chauffeurDashboardPage" textKey="saveButton" />
                        </button>
                    </form>
                    </article>
                ))}

                {bookingRows.length === 0 && ( <div className={tableStyles.cellEmpty}>  <TranslatedText sectionName="chauffeurDashboardPage" textKey="noAssignedBookingsMessage" />  </div>)}
                </div>

                {/* Desktop booking table */}
                <div className={`${tableStyles.tableDiv} max-h-150 overflow-auto hidden lg:block`}>
                    <table className={tableStyles.table1000}>
                        <thead className={`${tableStyles.tableHeaderCyan} sticky top-0 z-10`}> 
                            <tr>
                                <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="clientLabel" /> </th>
                                <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="pickupLabel" /> </th>
                                <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="destinationLabel" /> </th>
                                <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="dateLabel" /> </th>
                                <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="timeLabel" /> </th>
                                <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="passengersLabel" /> </th>
                                <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="luggageLabel" /> </th>
                                <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="petsLabel" /> </th>
                                <th className={tableStyles.cellCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="tripTypeLabel" /> </th>
                            </tr>
                        </thead>

                        <tbody>
                        {bookingRows.map((booking) => (
                            <Fragment key={booking.id}>                           
                                <tr key={booking.id} className="border-b border-white/10">
                                    <td className={tableStyles.cellCaption}>
                                        <div className={tableStyles.cellCaptionGroup}> {booking.clients?.name || <TranslatedText sectionName="chauffeurDashboardPage" textKey="unknownClient" />} </div>
                                        <div className={tableStyles.cellInfo}> {booking.clients?.email} </div>
                                        <div className={tableStyles.cellInfo}> {booking.clients?.phone} </div>
                                    </td>
                                    <td className={tableStyles.cell}>{booking.pickup_location}</td>
                                    <td className={tableStyles.cell}>{booking.destination}</td>     
                                    <td className={tableStyles.cell}> {formatShortDate(booking.pickup_date)} </td>
                                    <td className={tableStyles.cell}> {formatShortTime(booking.pickup_time)} </td>
                                    <td className={tableStyles.cell}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="paxLabel" />: {booking.passengers} </td>
                                    <td className={tableStyles.cell}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="luggageLabel" />: {booking.luggage} </td>
                                    <td className={`${tableStyles.cell} whitespace-nowrap`}>
                                        <span  className={booking.has_pets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed  } >
                                            {booking.has_pets ? <TranslatedText sectionName="chauffeurDashboardPage" textKey="petYes" /> : <TranslatedText sectionName="chauffeurDashboardPage" textKey="petNo" />}
                                        </span>
                                    </td>
                                    <td className={tableStyles.cell}>
                                        {getTripTypeTextKey(booking.trip_type) ? <TranslatedText sectionName="chauffeurDashboardPage" textKey={getTripTypeTextKey(booking.trip_type)} /> : booking.trip_type}
                                    </td>
                                </tr>
                                <tr className="border-b border-cyan-400/30 bg-cyan-950/10">
                                {/* Keeps notes aligned with the active language, while mixed text remains readable. */}
                                    <td colSpan={5} className="px-4 pb-4 pt-0 text-sm text-slate-300 text-start">
                                        <div className="rounded-xl bg-slate-950/30 px-3 py-2">
                                            <span className="font-semibold text-cyan-300"> <TranslatedText sectionName="chauffeurDashboardPage" textKey="notesLabel" />: </span> 
                                            <span className="wrap-break-word"> {booking.notes || "-----"}</span>
                                        </div>
                                    </td>
                                    <td colSpan={2} className="px-4 pb-4 pt-0 text-sm text-slate-300 text-start">
                                        <div className="rounded-xl bg-slate-950/30 px-3 py-2">
                                            <span className="font-semibold text-cyan-300"> <TranslatedText sectionName="chauffeurDashboardPage" textKey="assignedVehicleLabel" />: </span> 
                                            <span className="wrap-break-word"> {booking.vehicles ? getAssignedVehicleLabel(booking.vehicles) : <TranslatedText sectionName="chauffeurDashboardPage" textKey="vehicleNotAssigned" />}</span>
                                        </div>
                                    </td>
                                    <td colSpan={2} className="px-4 pb-4 pt-0 text-sm text-slate-300 text-start">
                                        <form action={updateAssignedBookingStatus} className="flex items-end justify-end gap-3" >
                                            <input type="hidden" name="bookingId" value={booking.id} />
                                            <input type="hidden" name="chauffeurId" value={chauffeurRow.id} />
                                            <label className="grid min-w-40 shrink-0 gap-1">
                                                <span className="font-semibold text-cyan-300 px-2 py-1"> <TranslatedText sectionName="chauffeurDashboardPage" textKey="bookingStatusLabel"/> </span>
                                                <select  name="status"  defaultValue={booking.status}  className={formStyles.selectForm}  >
                                                    {bookingStatusOptions.map((status) => {
                                                        const bookingStatusTextKey = getBookingStatusTextKey(status);
                                                        return (
                                                            <option key={status} value={status}>
                                                                {bookingStatusTextKey ? <TranslatedText sectionName="chauffeurDashboardPage" textKey={bookingStatusTextKey} /> : status}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </label>                                            
                                            <button type="submit" className={formStyles.smallButton}>
                                                <TranslatedText sectionName="chauffeurDashboardPage" textKey="saveButton" />
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            </Fragment>
                        ))}

                        {bookingRows.length === 0 && (<tr><td className={tableStyles.cellEmpty} colSpan={9}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="noAssignedBookingsMessage" /></td></tr> )}
                        </tbody>
                    </table>
                </div>

            </div>
        </main>
    );
}