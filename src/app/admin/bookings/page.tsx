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
import { pageStyles, tableStyles, formStyles } from "@/styles/classNames";

import Link from "next/link";

export const dynamic = "force-dynamic"; // Next.js says force-dynamic forces dynamic rendering, meaning the route is rendered for each user at request time.

// type  = creates a TypeScript rule/shape for data
type BookingRow = 
{
    id: string;  pickup_location: string;  destination: string;  pickup_date: string;
    pickup_time: string;  passengers: number;  luggage: number;  trip_type: string;
    status: string;  created_at: string;
    clients: {name: string;  email: string;  phone: string; } | null;
    chauffeur_id: string | null;
    chauffeurs: {  name: string; email: string; phone: string; } | null;
};

type ChauffeurOption = { id: string;  name: string;  email: string;  account_status: string;};

/*=============Tscrip rules===================
    Update the booking with this ID and set its status to the selected status.
    It receives data from a small form inside the admin table:
        bookingId
        status
    Then it updates Supabase:
    with revalidatePath = Refresh the admin bookings page data after the update.
    const vs let ==> const is used to define a variable and variable cannot be reassigned. Use let when the value may change
    const submitted: boolean = true; define a varibale of type boolean assign value true to it.
    const = creates a real variable/value
    let   = creates a real variable/value that can change
    var   = old way to create variables, usually avoid it
    type  = creates a TypeScript rule/shape for data
    supabaseAdmin.rpc() = says it is an enum type, not a table. 
    rpc("get_enum_values") = Run a custom function inside Supabase/PostgreSQL and give me the result.
    supabaseAdmin.from() = says it is a table.
    ?   = optional / safe access
    ??  = fallback when value is null or undefined
    :   = type annotation OR object property value
    ::  = not TypeScript; usually PostgreSQL type cast
====================================*/
async function updateBookingStatus(formData: FormData) 
{
    "use server";

    const bookingId = String(formData.get("bookingId") || "");
    const status = String(formData.get("status") || "");

    console.log("Updating booking status:", {bookingId,status,});

    if (!bookingId || !status) { console.error("Missing bookingId or status"); return;}

    const selectedBooking = await supabaseAdmin // data and error are property names returned by Supabase.
        .from("bookings")
        .update({ status })
        .eq("id", bookingId) // Find only the row where the column id is equal to bookingId.
        .select("id, status") //This line forces Supabase to return the updated row:
        .single(); //.single(), Supabase returns one object: Without .single(), Supabase may return an array:

    if (selectedBooking.error) { console.error("Could not update booking status:", selectedBooking.error);return;}

    console.log("Booking status updated:", selectedBooking.data);

    revalidatePath("/admin/bookings"); //Refresh the admin bookings page data after the update.
    redirect("/admin/bookings"); //And this line forces the admin page to reload:
}

async function assignChauffeurToBooking(formData: FormData) {
    "use server";

    const bookingId = String(formData.get("bookingId") || "");
    const chauffeurIdValue = String(formData.get("chauffeurId") || "");

    if (!bookingId) { return; } // Stop the current function here if bookingId is missing. It does not stop the whole page. Leave this function now.

    const chauffeurId = chauffeurIdValue || null;

    const result = await supabaseAdmin
        .from("bookings")
        .update({ chauffeur_id: chauffeurId })
        .eq("id", bookingId);

    // console.error = shows a red error message or marks it as an error.
    if (result.error) { console.error("Could not assign chauffeur:", result.error); return; }

    revalidatePath("/admin/bookings");
    redirect("/admin/bookings");
}

export default async function AdminBookingsPage() {
  const { data: bookings, error } = await supabaseAdmin // data: bookings= you are renaming data to bookings.
    .from("bookings")
    .select
    ( `
        id, pickup_location, destination, pickup_date, pickup_time, 
        passengers, luggage, trip_type, status, created_at,
        clients (name, email, phone ),
        chauffeur_id,
        chauffeurs (name, email, phone ) `
    )
    .order("created_at", { ascending: false });

    if (error) 
        {
            console.error("Could not load bookings:", error);
            return (
                <main className={pageStyles.main}>
                    <div className={pageStyles.containerMedium}>
                        <h1 className={pageStyles.pageTitle}> Admin bookings</h1>
                        <p className={pageStyles.errorMessage}> Could not load bookings. </p>
                    </div>
                </main>
            );
        }

    const { data: approvedChauffeurs, error: chauffeursError } = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name, email, account_status")
        .eq("account_status", "approved")
        .order("name", { ascending: true });

    const chauffeurOptions = (approvedChauffeurs ?? []) as unknown as ChauffeurOption[]; // as unknown => TypeScript, I know you are not sure about this data, but trust me: this is a ChauffeurOption[].
    if (chauffeursError) { console.error("Could not load approved chauffeurs:", chauffeursError);}
    const bookingRows = (bookings ?? []) as unknown as BookingRow[];
    

    const { data: bookingStatuses, error:bookingStatusError } = await supabaseAdmin.rpc( "get_enum_values", { p_enum_type_name: "booking_status"});
    if (bookingStatusError) { console.error("Could not load booking statuses:", bookingStatusError);}
    const bookingStatusOptions = (bookingStatuses ?? []) as string[];
    
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
            <p className={pageStyles.pageLabel}> Admin </p>
            <h1 className={pageStyles.pageTitle}>Booking requests</h1>
            <p className={pageStyles.pageDescription}>  Here you can see booking requests submitted through the website. </p>

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
                    <th className={tableStyles.cellCaption}>Assigned chauffeur</th>
                    <th className={tableStyles.cellCaption}>Status</th>
                </tr>
                </thead>

                <tbody>
                    { bookingRows.map((booking) => (
                        <tr key={booking.id} className={tableStyles.rowCyan}>
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
                                <form action={assignChauffeurToBooking} className="flex items-center gap-2">
                                    <input type="hidden" name="bookingId" value={booking.id} />
                                    <select name="chauffeurId" defaultValue={booking.chauffeur_id ?? ""} className={tableStyles.selectTable}>
                                        <option value="">Unassigned</option>
                                        {chauffeurOptions.map((chauffeur) => ( <option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name} </option> ))}
                                    </select>

                                    <button type="submit" className={formStyles.smallButton}>
                                        Save
                                    </button>   
                                </form>
                            </td>
                            <td className={tableStyles.cellCaption}>
                                <form action={updateBookingStatus} className="flex items-center gap-2">
                                    <input type="hidden" name="bookingId" value={booking.id} />
                                    <select name="status"  defaultValue={booking.status}  className={tableStyles.selectTable}>
                                        {bookingStatusOptions.map((status) => (<option key={status} value={status}>{status}</option> ))} 
                                    </select>
                                    <button type="submit" className={formStyles.smallButton}>
                                        Save
                                    </button>                                
                                </form>
                            </td>
                        </tr>
                    ))}

                    {bookingRows.length === 0 && ( <tr> <td className={tableStyles.cellEmpty} colSpan={9}>  No bookings found yet. </td> </tr>)}
                </tbody>
            </table>
            </div>
        </div>
        </main>
    );
}