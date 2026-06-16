import { createClient as createAuthClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import Link from "next/link";
import { pageStyles, tableStyles, formStyles } from "@/styles/classNames";

//export const dynamic = "force-dynamic"; //Keep dynamic only in: src/app/admin/chauffeurs/[chauffeurid]/page.tsx 

type TypeChauffeurRow = { id: string;  name: string;  email: string;  phone: string;  service_area: string | null;  account_status: string;};

type TypeAssignedBookingRow = {
    id: string;  pickup_location: string;  destination: string;  
    pickup_date: string;  pickup_time: string;  passengers: number;  luggage: number;  
    trip_type: string;  status: string;  notes: string | null;
    clients: { name: string;  email: string;  phone: string; } | null;
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
    let backLinkText = "← Back to homepage";
    let isAdminUser = false;

    if (user) {
        const { data: profile } = await authSupabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

        if (profile?.role === "admin") { backLinkHref = "/admin/chauffeurs";  backLinkText = "← Back to admin chauffeurs";  isAdminUser = true;}
    }

    // get chauffeur data of this chauffeur id
    const { data: supabaseAdminChauffeur, error: chauffeurError } = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name, email, phone, service_area, account_status")
        .eq("id", chauffeurId)
        .single();

    // Show error if chauffeur does not exists
    if (chauffeurError || !supabaseAdminChauffeur) 
    {   console.error("Could not load chauffeur:", chauffeurError);
        return (
            <main className={pageStyles.main}>
                <div className={pageStyles.containerMedium}>
                    <p className={pageStyles.errorMsg}> Could not load chauffeur. </p>
                </div>
            </main>
        );
    }

    // get the list of bookings of this chauffeurid in booking table
    const { data: supabaseAdminBookings, error: bookingsError } = await supabaseAdmin
        .from("bookings")
        .select (` id, pickup_location, destination, pickup_date, pickup_time, passengers, luggage, trip_type, status, notes, clients (name, email, phone) `)
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

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}> 
                <div className="flex items-start justify-between gap-4">
                    <Link href={backLinkHref} className={formStyles.link}> {backLinkText} </Link>
                    <LogoutButton />
                </div>
                <p className={pageStyles.pageLabelUpper}> Chauffeur </p>
                <h1 className={pageStyles.pageTitle}> Welcome, {chauffeurRow.name} </h1>
                <p className={pageStyles.pageDescription}> Here you can see bookings assigned to you. </p>
                
                {pageMessage.success === "status-updated" && (<p className={pageStyles.successMsgPage}> Booking status updated successfully. </p>)}
                {pageMessage.error === "missing-fields" && (<p className={pageStyles.errorMsgPage}> Please select the required booking information. </p>)}
                {pageMessage.error === "status-update-failed" && (<p className={pageStyles.errorMsgPage}> Could not update booking status. Please try again.</p>)}

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    <div className={formStyles.info}>
                        <p className={formStyles.formInputInfoCaption}>Email</p>
                        <p className={formStyles.formInputInfoValue}>{chauffeurRow.email}</p>
                    </div>
                    <div className={formStyles.info}>
                        <p className={formStyles.formInputInfoCaption}>Phone</p>
                        <p className={formStyles.formInputInfoValue}>{chauffeurRow.phone}</p>
                    </div>
                    <div className={formStyles.info}>
                        <p className={formStyles.formInputInfoCaption}>Status</p>
                        <p className={formStyles.formInputInfoValue}>{chauffeurRow.account_status}</p>
                    </div>
                </div>
                {/*====================================                
                → shows chauffeur information
                → has button: Manage availability
                → if admin is viewing: also show Edit chauffeur details
                ==========================================*/}
                <div className="mt-8 flex flex-wrap items-center gap-4">
                    <Link  href={`/chauffeur/${chauffeurRow.id}/availability`} className={formStyles.primaryButtonOutside}  >
                        Manage availability
                    </Link>

                    {isAdminUser && ( 
                        <Link  href={`/admin/chauffeurs/${chauffeurRow.id}`} className={formStyles.primaryButtonOutside}  >
                            Edit chauffeur details
                        </Link>
                    )}
                </div>

                <h3 className={tableStyles.headerTableSmall}>My vehicles</h3>
                <div className={tableStyles.tableDiv}>
                    <table className={tableStyles.table1000}>
                        <thead className={tableStyles.tableHeaderCyan}>
                            <tr>
                                <th className={tableStyles.cellCaption}>Brand</th>
                                <th className={tableStyles.cellCaption}>Model</th>
                                <th className={tableStyles.cellCaption}>License plate</th>
                                <th className={tableStyles.cellCaption}>Type</th>
                                <th className={tableStyles.cellCaption}>Seats</th>
                                <th className={tableStyles.cellCaption}>Luggage</th>
                                <th className={tableStyles.cellCaption}>Year</th>
                                <th className={tableStyles.cellCaption}>Color</th>
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
                                    <td className={tableStyles.cell}>{vehicle.vehicle_year}</td>
                                    <td className={tableStyles.cell}>{vehicle.vehicle_color}</td>
                                </tr>
                            ))}
                            {vehicleRows.length === 0 && (<tr><td className={tableStyles.cellEmpty} colSpan={8}>No vehicles connected to this chauffeur yet.</td></tr>)}
                        </tbody>
                    </table>
                </div>
                <h3 className={tableStyles.headerTableSmall}>My Bookings</h3>
                <div className={tableStyles.tableDiv}>
                    <table className={tableStyles.table1000}>
                        <thead className={tableStyles.tableHeaderCyan}>
                            <tr>
                                <th className={tableStyles.cellCaption}>Client</th>
                                <th className={tableStyles.cellCaption}>Pickup</th>
                                <th className={tableStyles.cellCaption}>Destination</th>
                                <th className={tableStyles.cellCaption}>Date</th>
                                <th className={tableStyles.cellCaption}>Time</th>
                                <th className={tableStyles.cellCaption}>Passengers</th>
                                <th className={tableStyles.cellCaption}>Trip type</th>
                                <th className={tableStyles.cellCaption}>Status</th>
                            </tr>
                        </thead>

                        <tbody>
                            {bookingRows.map((booking) =>(
                                <tr key={booking.id} className="border-b border-white/10">
                                    <td className={tableStyles.cellCaption}>
                                        <div className={tableStyles.cellCaptionGroup}> {booking.clients?.name || "Unknown client"} </div>
                                        <div className={tableStyles.cellInfo}> {booking.clients?.email} </div>
                                        <div className={tableStyles.cellInfo}> {booking.clients?.phone} </div>
                                    </td>
                                    <td className={tableStyles.cell}> {booking.pickup_location} </td>
                                    <td className={tableStyles.cell}> {booking.destination} </td>
                                    <td className={tableStyles.cell}> {booking.pickup_date} </td>
                                    <td className={tableStyles.cell}> {booking.pickup_time} </td>
                                    <td className={tableStyles.cell}> {booking.passengers}  </td>
                                    <td className={tableStyles.cell}> {booking.trip_type}   </td>
                                    <td className={tableStyles.cellCaption}>
                                        <form action={updateAssignedBookingStatus} className="flex items-center gap-2">
                                            <input type="hidden" name="bookingId" value={booking.id} />
                                            <input type="hidden" name="chauffeurId" value={chauffeurRow.id} />
                                            <select name="status" defaultValue={booking.status} className={tableStyles.selectTable}>
                                                {bookingStatusOptions.map((status) => (<option key={status} value={status}> {status} </option>  ))}
                                            </select>

                                            <button type="submit" className={formStyles.smallButton}>
                                                Save
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            ))}

                            {bookingRows.length === 0 && (<tr><td className={tableStyles.cellEmpty} colSpan={8}>No assigned bookings found yet.</td></tr>)}

                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}