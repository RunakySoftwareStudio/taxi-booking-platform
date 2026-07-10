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
    clients: { name: string; email: string; phone: string } | null;
};

//type TypePromiseChauffeurId = { params: Promise<{ chauffeurId: string; }>;};
type ChauffeurDashboardPageProps = { params: Promise<{chauffeurId: string; }>;searchParams: Promise<{ success?: string; error?: string; }>;};
type TypeVehicleRow = 
{
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
};

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

// Only update this booking if it belongs to this chauffeur.
async function updateAssignedBookingStatus(formData: FormData) 
{  "use server";
    const bookingId = String(formData.get("bookingId") || "");
    const chauffeurId = String(formData.get("chauffeurId") || "");
    const status = String(formData.get("status") || "");

    if (!bookingId || !chauffeurId || !status) { redirect(`/chauffeur/${chauffeurId}?error=missing-fields`); }

    const { error } = await supabaseAdmin
        .from("bookings")
        .update({ status })
        .eq("id", bookingId)
        .eq("chauffeur_id", chauffeurId);

    if (error) {
        console.error("Could not update booking status:", error);
        redirect(`/chauffeur/${chauffeurId}?error=status-update-failed`);
    }
    
    revalidatePath(`/chauffeur/${chauffeurId}`);
    redirect(`/chauffeur/${chauffeurId}?success=status-updated`);
}

export default async function ChauffeurDashboardPage({params,searchParams}: ChauffeurDashboardPageProps) {
  const pageMessage = await searchParams;
  const { chauffeurId } = await params;
    /*========================================
        default             → homepage
        if user is admin    → admin chauffeurs page
        if user is chauffeur → homepage
    ===========================================*/
    const authSupabase = await createAuthClient();
    const { data: { user }, } = await authSupabase.auth.getUser();
    let backLinkHref = "/";
    let backLinkTextKey = "backToHomepage";
    let isAdminUser = false;


    if (user) {
        const { data: profile } = await authSupabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

        if (profile?.role === "admin") { backLinkHref = "/admin/chauffeurs"; backLinkTextKey = "backToAdminChauffeurs"; isAdminUser = true; }
    }

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
        .select (` id, pickup_location, destination, pickup_date, pickup_time, passengers, luggage, has_pets, trip_type, status, notes, clients (name, email, phone) `)
        .eq("chauffeur_id", chauffeurId)
        .order("pickup_date", { ascending: true })
        .order("pickup_time", { ascending: true });
    
    // give warnning in form of red message if there are error in bookings
    if (bookingsError) { console.error("Could not load chauffeur bookings:", bookingsError);}

    const { data: supabaseAdminVehicles, error: vehiclesError } = await supabaseAdmin
        .from("vehicles")
        .select(` id, brand, model, license_plate, vehicle_type, seats, luggage_capacity, created_at `)
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

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    <div className={formStyles.info}>
                        <p className={formStyles.formInputInfoCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="emailLabel" /> </p>
                        <p className={formStyles.formInputInfoValue}>{chauffeurRow.email}</p>
                    </div>
                    <div className={formStyles.info}>
                        <p className={formStyles.formInputInfoCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="phoneLabel" /> </p>
                        <p className={formStyles.formInputInfoValue}>{chauffeurRow.phone}</p>
                    </div>
                    <div className={formStyles.info}>
                        <p className={formStyles.formInputInfoCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="statusLabel" /> </p>
                        <p className={formStyles.formInputInfoValue}>
                            {chauffeurAccountStatusTextKey ? <TranslatedText sectionName="chauffeurDashboardPage" textKey={chauffeurAccountStatusTextKey} /> : chauffeurRow.account_status}
                        </p>
                    </div>
                </div>
                {/*====================================                
                → shows chauffeur information
                → has button: Manage availability
                → if admin is viewing: also show Edit chauffeur details
                ==========================================*/}
                <div className="mt-8 flex flex-wrap items-center gap-4">
                    <Link  href={`/chauffeur/${chauffeurRow.id}/availability`} className={formStyles.primaryButtonOutside}  >
                        <TranslatedText sectionName="chauffeurDashboardPage" textKey="manageAvailabilityButton" />
                    </Link>

                    {isAdminUser && ( 
                        <Link  href={`/admin/chauffeurs/${chauffeurRow.id}`} className={formStyles.primaryButtonOutside}  >
                            <TranslatedText sectionName="chauffeurDashboardPage" textKey="editDetailsButton" />
                        </Link>
                    )}
                </div>

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
                        <tr key={vehicle.id} className={tableStyles.rowCyan}>
                            <td className={tableStyles.cell}>{vehicle.brand}</td>
                            <td className={tableStyles.cell}>{vehicle.model}</td>
                            <td className={tableStyles.cell}>{vehicle.license_plate}</td>
                            <td className={tableStyles.cell}>{vehicle.vehicle_type}</td>
                            <td className={tableStyles.cell}>{vehicle.seats}</td>
                            <td className={tableStyles.cell}>{vehicle.luggage_capacity}</td>
                            <td className={tableStyles.cell}>{vehicle.vehicle_year?vehicle.vehicle_year:"---"}</td>
                            <td className={tableStyles.cell}>{vehicle.vehicle_color?vehicle.vehicle_color:"---"}</td>
                        </tr>))}

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
                        
                        <div>
                            <span className={mobileStyle.inforCaption}>  <span className={mobileStyle.inforCaption}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="notesLabel" />: </span>  </span>
                            <span className={mobileStyle.infoValue}> {booking.notes || "-----"} </span>
                        </div>
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
                                    <td colSpan={8} className="px-4 pb-4 pt-0 text-sm text-slate-300">
                                        <div className="rounded-xl bg-slate-950/30 px-3 py-2">
                                        <span className="font-semibold text-cyan-300"><span className="font-semibold text-cyan-300"> <TranslatedText sectionName="chauffeurDashboardPage" textKey="notesLabel" />: </span> </span>
                                        <span className="wrap-break-word"> {booking.notes || "-----"} </span>
                                        </div>
                                    </td>
                                    <td colSpan={3} className="px-4 pb-4 pt-0 text-sm text-slate-300">
                                        <form action={updateAssignedBookingStatus} className="flex items-end justify-end gap-3" >
                                            <input type="hidden" name="bookingId" value={booking.id} />
                                            <input type="hidden" name="chauffeurId" value={chauffeurRow.id} />
                                            <label className="grid w-32 shrink-0 gap-1">
                                                <span className ="font-semibold text-cyan-300 px-2 py-1"><span className="font-semibold text-cyan-300 px-2 py-1"> <TranslatedText sectionName="chauffeurDashboardPage" textKey="bookingStatusLabel" /> </span></span>
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

                        {bookingRows.length === 0 && (<tr><td className={tableStyles.cellEmpty} colSpan={8}> <TranslatedText sectionName="chauffeurDashboardPage" textKey="noAssignedBookingsMessage" /></td></tr> )}
                        </tbody>
                    </table>
                </div>

            </div>
        </main>
    );
}