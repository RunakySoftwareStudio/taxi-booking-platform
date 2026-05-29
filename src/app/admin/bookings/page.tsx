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

export const dynamic = "force-dynamic";

type BookingRow = 
{
  id: string;
  pickup_location: string;
  destination: string;
  pickup_date: string;
  pickup_time: string;
  passengers: number;
  luggage: number;
  trip_type: string;
  status: string;
  created_at: string;
  clients: 
    {
        name: string;
        email: string;
        phone: string;
    } | null;
    chauffeur_id: string | null;
    chauffeurs: 
    {
        name: string;
        email: string;
        phone: string;
    } | null;
};

type ChauffeurOption = {
  id: string;
  name: string;
  email: string;
  account_status: string;
};

/*================================
Update the booking with this ID and set its status to the selected status.
It receives data from a small form inside the admin table:
    bookingId
    status
Then it updates Supabase:
with revalidatePath = Refresh the admin bookings page data after the update.
====================================*/
async function updateBookingStatus(formData: FormData) 
{
    "use server";

    const bookingId = String(formData.get("bookingId") || "");
    const status = String(formData.get("status") || "");

    console.log("Updating booking status:", {bookingId,status,});

    if (!bookingId || !status) { console.error("Missing bookingId or status"); return;}

    const { data, error } = await supabaseAdmin
        .from("bookings")
        .update({ status })
        .eq("id", bookingId) // Find only the row where the column id is equal to bookingId.
        .select("id, status") //This line forces Supabase to return the updated row:
        .single();

    if (error) { console.error("Could not update booking status:", error);return;}

    console.log("Booking status updated:", data);

    revalidatePath("/admin/bookings"); //Refresh the admin bookings page data after the update.
    redirect("/admin/bookings"); //And this line forces the admin page to reload:
}

async function assignChauffeurToBooking(formData: FormData) {
    "use server";

    const bookingId = String(formData.get("bookingId") || "");
    const chauffeurIdValue = String(formData.get("chauffeurId") || "");

    if (!bookingId) {
        return;
    }

    const chauffeurId = chauffeurIdValue || null;

    const { error } = await supabaseAdmin
        .from("bookings")
        .update({ chauffeur_id: chauffeurId })
        .eq("id", bookingId);

    if (error) {
        console.error("Could not assign chauffeur:", error);
        return;
    }

    revalidatePath("/admin/bookings");
    redirect("/admin/bookings");
}

export default async function AdminBookingsPage() {
  const { data: bookings, error } = await supabaseAdmin
    .from("bookings")
    .select(
      `
        id,
        pickup_location,
        destination,
        pickup_date,
        pickup_time,
        passengers,
        luggage,
        trip_type,
        status,
        created_at,
        clients (
            name,
            email,
            phone
        ),
        chauffeur_id,
        chauffeurs (
            name,
            email,
            phone
        )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {console.error("Could not load bookings:", error);
        return 
        (
        <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
            <div className="mx-auto max-w-6xl">
            <h1 className="text-3xl font-bold">Admin bookings</h1>
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
                Could not load bookings.
            </p>
            </div>
        </main>
        );
    }
    
    const { data: approvedChauffeurs, error: chauffeursError } = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name, email, account_status")
        .eq("account_status", "approved")
        .order("name", { ascending: true });

    const chauffeurOptions = (approvedChauffeurs ?? []) as unknown as ChauffeurOption[];
    if (chauffeursError) { console.error("Could not load approved chauffeurs:", chauffeursError);
}
    const bookingRows = (bookings ?? []) as unknown as BookingRow[];
  

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
          Admin
        </p>

        <h1 className="mt-3 text-3xl font-bold">Booking requests</h1>

        <p className="mt-4 max-w-2xl text-slate-300">
          Here you can see booking requests submitted through the website.
        </p>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-white/10 bg-white/10 text-slate-300">
              <tr>
                <th className="p-4">Client</th>
                <th className="p-4">Pickup</th>
                <th className="p-4">Destination</th>
                <th className="p-4">Date</th>
                <th className="p-4">Time</th>
                <th className="p-4">Passengers</th>
                <th className="p-4">Trip type</th>
                <th className="p-4">Chauffeur</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>

            <tbody>
              {bookingRows.map((booking) => (
                <tr key={booking.id} className="border-b border-white/10">
                    <td className="p-4">
                        <div className="font-medium text-white">
                        {booking.clients?.name || "Unknown client"}
                        </div>
                        <div className="text-xs text-slate-400">
                        {booking.clients?.email}
                        </div>
                        <div className="text-xs text-slate-400">
                        {booking.clients?.phone}
                        </div>
                    </td>

                    <td className="p-4 text-slate-300">
                        {booking.pickup_location}
                    </td>

                    <td className="p-4 text-slate-300">
                        {booking.destination}
                    </td>

                    <td className="p-4 text-slate-300">
                        {booking.pickup_date}
                    </td>

                    <td className="p-4 text-slate-300">
                        {booking.pickup_time}
                    </td>

                    <td className="p-4 text-slate-300">
                        {booking.passengers}
                    </td>

                    <td className="p-4 text-slate-300">
                        {booking.trip_type}
                    </td>

                    <td className="p-4">
                        <form action={assignChauffeurToBooking} className="flex items-center gap-2">
                            <input type="hidden" name="bookingId" value={booking.id} />
                            <select
                                name="chauffeurId"
                                defaultValue={booking.chauffeur_id ?? ""}
                                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                                <option value="">Unassigned</option>

                                {chauffeurOptions.map((chauffeur) => ( <option key={chauffeur.id} value={chauffeur.id}> {chauffeur.name} </option> ))}
                            </select>

                            <button type="submit" className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300" >
                                Save
                            </button>
                        </form>

                        {booking.chauffeurs && ( <p className="mt-2 text-xs text-slate-400"> Assigned: {booking.chauffeurs.name} </p> )}
                    </td>
                    <td className="p-4">
                        <form action={updateBookingStatus} className="flex items-center gap-2">
                            <input type="hidden" name="bookingId" value={booking.id} />

                            <select
                                name="status"
                                defaultValue={booking.status}
                                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                                >
                                <option value="pending">pending</option>
                                <option value="accepted">accepted</option>
                                <option value="rejected">rejected</option>
                                <option value="confirmed">confirmed</option>
                                <option value="completed">completed</option>
                                <option value="cancelled">cancelled</option>
                            </select>

                            <button type="submit" className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
                                Save
                            </button>
                        </form>
                    </td>

                </tr>
              ))}

              {bookingRows.length === 0 && (
                <tr>
                  <td className="p-4 text-slate-300" colSpan={9}>
                    No bookings found yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}