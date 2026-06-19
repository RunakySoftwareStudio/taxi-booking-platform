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

//export const dynamic = "force-dynamic"; //Keep dynamic only in: src/app/admin/bookings/page.tsx 

type AdminBookingsPageProps = { searchParams: Promise<{success?: string; error?: string; }>;};

// type  = creates a TypeScript rule/shape for data
type BookingRow = 
{
    id: string;  pickup_location: string;  destination: string;  pickup_date: string;
    pickup_time: string;  passengers: number;  luggage: number;  trip_type: string;
    status: string;  created_at: string; notes: string;
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
async function updateBookingAdminFields(formData: FormData) {
    "use server";

    const bookingId = String(formData.get("bookingId") || "");
    const chauffeurId = String(formData.get("chauffeurId") || "");
    const status = String(formData.get("status") || "");

    if (!bookingId || !status) {   redirect("/admin/bookings?error=missing-fields");  }

    const { error } = await supabaseAdmin
        .from("bookings")
        .update({ chauffeur_id: chauffeurId || null,status, })
        .eq("id", bookingId);

    if (error) {
        console.error("Could not update booking admin fields:", error);
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
        passengers, luggage, trip_type, status, notes, created_at,
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
                        <p className={pageStyles.errorMsg}> Could not load bookings. </p>
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

            <div className={tableStyles.DivCyanList}>
                 <table className={`${tableStyles.table1000} min-w-[1250px]`}>
                    <thead className={tableStyles.tableHeaderCyan}>
                        <tr>
                            <th className={tableStyles.cellCaption}>Client</th>
                            <th className={tableStyles.cellCaption}>Pickup</th>
                            <th className={tableStyles.cellCaption}>Destination</th>
                            <th className={tableStyles.cellCaption}>Date</th>
                            <th className={tableStyles.cellCaption}>Time</th>
                            <th className={tableStyles.cellCaption}>Passengers</th>
                            <th className={tableStyles.cellCaption}>Trip type</th>
                            <th className={tableStyles.cellCaption}>Notes</th>
                            <th className={tableStyles.cellCaption}>Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        { bookingRows.map((booking) => (
                            <tr key={booking.id} className={tableStyles.rowCyan}>
                                <td className={tableStyles.cellCaption}>
                                    <div className={tableStyles.cellCaptionGroup}> {booking.clients?.name || "Unknown client"} </div>
                                    <div className={tableStyles.cellInfo}> {booking.clients?.email} </div>
                                    <div className={tableStyles.cellInfo}> {booking.clients?.phone} </div>
                                    <div className="mt-3">
                                        <Link href={`/admin/bookings/${booking.id}`} className={formStyles.smallButton} > Edit </Link>
                                    </div>
                                </td>
                                <td className={tableStyles.cell}> {booking.pickup_location} </td>
                                <td className={tableStyles.cell}> {booking.destination} </td>
                                <td className={tableStyles.cell}> {booking.pickup_date} </td>
                                <td className={tableStyles.cell}> {booking.pickup_time} </td>
                                <td className={tableStyles.cell}> {booking.passengers}  </td>
                                <td className={tableStyles.cell}> {booking.trip_type}   </td>
                                <td className={tableStyles.cell}> {booking.notes}   </td>
                                <td className={tableStyles.cell}>
                                <form action={updateBookingAdminFields} className="flex min-w-[300px] flex-wrap items-center gap-3" >
                                    <input type="hidden" name="bookingId" value={booking.id} />
                                    <select name="chauffeurId" defaultValue={booking.chauffeur_id ?? ""} className={formStyles.selectForm} >
                                    <option value="">Unassigned</option>
                                        {chauffeurOptions.map((chauffeur) => ( <option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name} </option>))}
                                    </select>

                                    <select name="status" defaultValue={booking.status} className={formStyles.selectForm}  >
                                        {bookingStatusOptions.map((status) => ( <option key={status} value={status}> {status} </option> ))}
                                    </select>

                                    <button type="submit" className={formStyles.smallButton}>
                                        Save
                                    </button>
                                </form>
                                </td>
                            </tr>
                        ))}

                        {bookingRows.length === 0 && ( <tr> <td className={tableStyles.cellEmpty} colSpan={10}>  No bookings found yet. </td> </tr>)}
                    </tbody>
                </table>
            </div>
        </div>
        </main>
    );
}