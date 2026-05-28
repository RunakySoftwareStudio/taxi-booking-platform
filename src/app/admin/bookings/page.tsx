/*
    build our own admin dashboard.
    creates a new admin page at: http://localhost:3000/admin/bookings
    Admin opens /admin/bookings
        ↓
    page.tsx asks Supabase for bookings
            ↓
    Supabase returns booking rows
            ↓
    page.tsx displays them in a table
*/
import { supabaseAdmin } from "@/lib/supabaseServer";

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
};

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
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load bookings:", error);
    
    return (
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
                    <span className="rounded-full bg-yellow-400/10 px-3 py-1 text-xs font-medium text-yellow-200">
                      {booking.status}
                    </span>
                  </td>
                </tr>
              ))}

              {bookingRows.length === 0 && (
                <tr>
                  <td className="p-4 text-slate-300" colSpan={8}>
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