import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type ClientRow = { id: string; name: string; email: string; phone: string; created_at: string; };
type AdminClientDetailPageProps = { params: Promise<{clientId: string;}>; };
type ClientBookingRow = 
{
    id: string; pickup_location: string; destination: string; pickup_date: string;
    pickup_time: string; passengers: number; luggage: number; trip_type: string; status: string; notes: string | null;
    chauffeurs: { name: string; email: string; phone: string; } | null;
};

export default async function AdminClientDetailPage( {params}: AdminClientDetailPageProps) 
    {
        const { clientId } = await params;

        const { data: client, error: clientError } = await supabaseAdmin
            .from("clients")
            .select("id, name, email, phone, created_at")
            .eq("id", clientId)
            .single();

        const { data: bookings, error: bookingsError } = await supabaseAdmin
            .from("bookings")
            .select( `id, pickup_location, destination, pickup_date, pickup_time, passengers, luggage, trip_type, status, notes, chauffeurs ( name, email, phone)`)
            .eq("client_id", clientId)
            .order("pickup_date", { ascending: false })
            .order("pickup_time", { ascending: false });

        if (clientError || !client) 
        {
            console.error("Could not load client:", clientError);
            return (
                <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
                    <div className="mx-auto max-w-6xl">
                        <h1 className="text-3xl font-bold">Client details</h1>
                        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200"> Could not load client. </p>
                    </div>
                </main>
            );
        }

    if (bookingsError) {console.error("Could not load client bookings:", bookingsError); }

    const clientRow = client as ClientRow;
    const bookingRows = (bookings ?? []) as unknown as ClientBookingRow[];

    return (
        <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
            <div className="mx-auto max-w-6xl">
                
                <Link href="/admin/clients" className="text-sm text-cyan-300 hover:text-cyan-200"> ← Back to clients </Link>
                <p className="mt-8 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> Admin client</p>
                <h1 className="mt-3 text-3xl font-bold">{clientRow.name}</h1>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <p className="text-sm text-slate-400">Email</p>
                        <p className="mt-2 font-medium">{clientRow.email}</p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <p className="text-sm text-slate-400">Phone</p>
                        <p className="mt-2 font-medium">{clientRow.phone}</p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <p className="text-sm text-slate-400">Created at</p>
                        <p className="mt-2 font-medium"> {new Date(clientRow.created_at).toLocaleString()} </p>
                    </div>
                </div>
                <h2 className="mt-12 text-2xl font-bold">Booking history</h2>
                <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
                    <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="border-b border-white/10 bg-white/10 text-slate-300">
                            <tr>
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
                            {
                                bookingRows.map((booking) => 
                                (
                                    <tr key={booking.id} className="border-b border-white/10">
                                    <td className="p-4 text-slate-300"> {booking.pickup_location} </td>
                                    <td className="p-4 text-slate-300"> {booking.destination} </td>
                                    <td className="p-4 text-slate-300"> {booking.pickup_date} </td>
                                    <td className="p-4 text-slate-300"> {booking.pickup_time} </td>
                                    <td className="p-4 text-slate-300"> {booking.passengers} </td>
                                    <td className="p-4 text-slate-300"> {booking.trip_type} </td>
                                    <td className="p-4 text-slate-300"> {booking.chauffeurs?.name || "Unassigned"} </td>
                                    <td className="p-4"> <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200"> {booking.status} </span> </td> </tr>
                                ))
                            }

                            {bookingRows.length === 0 && (<tr> <td className="p-4 text-slate-300" colSpan={8}> No bookings found for this client. </td></tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}