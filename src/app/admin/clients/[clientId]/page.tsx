import { pageStyles, tableStyles, formStyles } from "@/styles/classNames";
import { supabaseAdmin } from "@/lib/supabaseServer";
import Link from "next/link";

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
            <div className={pageStyles.container}> 
                
                <Link href="/admin/clients" className={formStyles.link} > ← Back to clients </Link>
                <p className={pageStyles.pageLabel}> Admin client</p>
                <h1 className={pageStyles.pageTitle}>{clientRow.name}</h1>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    <div className={formStyles.info}>
                        <p className={formStyles.formInputInfoCaption}>Email</p>
                        <p className={formStyles.formInputInfoValue}>{clientRow.email}</p>
                    </div>

                    <div className={formStyles.info}>
                        <p className={formStyles.formInputInfoCaption}>Phone</p>
                        <p className={formStyles.formInputInfoValue}>{clientRow.phone}</p>
                    </div>

                    <div className={formStyles.info}>
                        <p className={formStyles.formInputInfoCaption}>Created at</p>
                        <p className={formStyles.formInputInfoValue}> {new Date(clientRow.created_at).toLocaleString()} </p>
                    </div>
                </div>
                
                <h2 className={tableStyles.headerTableSmall}>Booking history</h2>
                <div className={tableStyles.tableDiv}>
                    <table className={tableStyles.table1000}>
                        <thead className={tableStyles.tableHeaderCyan}>
                            <tr>
                                <th className={tableStyles.cellCaption}>Pickup</th>
                                <th className={tableStyles.cellCaption}>Destination</th>
                                <th className={tableStyles.cellCaption}>Date</th>
                                <th className={tableStyles.cellCaption}>Time</th>
                                <th className={tableStyles.cellCaption}>Passengers</th>
                                <th className={tableStyles.cellCaption}>Trip type</th>
                                <th className={tableStyles.cellCaption}>Chauffeur</th>
                                <th className={tableStyles.cellCaption}>Status</th>
                            </tr>
                        </thead>

                        <tbody>
                            {
                                bookingRows.map((booking) => 
                                (
                                    <tr key={booking.id} className="border-b border-white/10">
                                    <td className={tableStyles.cell}> {booking.pickup_location} </td>
                                    <td className={tableStyles.cell}> {booking.destination} </td>
                                    <td className={tableStyles.cell}> {booking.pickup_date} </td>
                                    <td className={tableStyles.cell}> {booking.pickup_time} </td>
                                    <td className={tableStyles.cell}> {booking.passengers} </td>
                                    <td className={tableStyles.cell}> {booking.trip_type} </td>
                                    <td className={tableStyles.cell}> {booking.chauffeurs?.name || "Unassigned"} </td>
                                    <td className={tableStyles.cellCaption}> <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200"> {booking.status} </span> </td> </tr>
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