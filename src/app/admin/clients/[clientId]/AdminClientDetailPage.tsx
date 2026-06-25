import { pageStyles, tableStyles, formStyles, mobileStyle } from "@/styles/classNames";
import { formatShortDate, formatShortTime , formatShortDateTime } from "@/lib/formatDateTime";
import { supabaseAdmin } from "@/lib/supabaseServer";
import Link from "next/link";

//export const dynamic = "force-dynamic";  //Keep dynamic only in: src/app//admin/clients/[clientid]/page.tsx 

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
                <p className={pageStyles.pageLabelUpper}> Admin client detail</p>
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
                        <p className={formStyles.formInputInfoValue}> {formatShortDateTime(client.created_at)} </p>
                    </div>
                </div>
                
                <h2 className={tableStyles.headerTableSmall}>Booking history</h2>

                {/* Mobile booking history cards */}
                <div className="mt-6 grid gap-4 lg:hidden">
                    {bookingRows.map((booking) => {
                        let statusColorClasses = tableStyles.statusRedClasses;
                        if (booking.status === "accepted" || booking.status === "completed") { statusColorClasses = tableStyles.statusGreenClasses; }
                        if (booking.status === "pending" || booking.status === "confirmed") {statusColorClasses = tableStyles.statusYellowClasses;  }

                        return (
                        <article key={booking.id} className="rounded-2xl border border-cyan-400/30 bg-cyan-950/20 p-4 text-sm text-white" >
                            <div >
                                <div>
                                    <span className={mobileStyle.inforCaption}>Pickup:  </span>
                                    <span className={mobileStyle.infoValue}>{booking.pickup_location}</span>
                                </div>
                                <div>
                                    <span className={mobileStyle.inforCaption}> Destination:  </span>
                                    <span className={mobileStyle.infoValue}>{booking.destination}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div >
                                        <span className={mobileStyle.inforCaption}>  Date: </span>
                                        <span className={mobileStyle.infoValue}>{formatShortDate(booking.pickup_date)}</span>
                                    </div>
                                    <div>
                                        <span className={mobileStyle.inforCaption}>  Time:  </span>
                                        <span className={mobileStyle.infoValue}>{formatShortTime(booking.pickup_time)}</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <span className={mobileStyle.inforCaption}> Pax: </span>
                                        <span className={mobileStyle.infoValue}>{booking.passengers}</span>
                                    </div>
                                    <div>
                                        <span className={mobileStyle.inforCaption}> Trip:  </span>
                                        <span className={mobileStyle.infoValue}>{booking.trip_type}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-2 flex items-center gap-2">
                                <span className={mobileStyle.inforCaption}> Chauffeur: </span>
                                <span className={mobileStyle.infoValue}>{booking.chauffeurs?.name || "Unassigned"}</span>
                                <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${statusColorClasses}`} >  {booking.status}   </span>
                                {booking.status === "completed" && ( <span className={tableStyles.okCheckSign} aria-hidden="true"> ✓ </span> )}
                            </div>
                        </article> );})
                    }
                    {bookingRows.length === 0 && (<div className="rounded-2xl border border-cyan-400/30 bg-cyan-950/20 p-4 text-sm text-white"> No bookings found for this client.</div> )}
                </div>

                {/* Desktop booking history table */}
                <div className={`${tableStyles.tableDiv} hidden lg:block`}>
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
                        bookingRows.map((booking) => {
                            //	pending, accepted, rejected, confirmed, completed, cancelled
                            //  accepted, completed → green, rejected,cancelled → red,  pending,confirmed → yellow, holiday → yellow
                            let statusColorClasses = tableStyles.statusRedClasses // rejected,cancelled 
                            if (booking.status === "accepted" || booking.status === "completed") {statusColorClasses = tableStyles.statusGreenClasses; }
                            if (booking.status === "pending" || booking.status === "confirmed") { statusColorClasses = tableStyles.statusYellowClasses; }

                            return (
                                <tr key={booking.id} className="border-b border-white/10">
                                    <td className={tableStyles.cell}> {booking.pickup_location} </td>
                                    <td className={tableStyles.cell}> {booking.destination} </td>
                                    <td className={tableStyles.cell}> {booking.pickup_date} </td>
                                    <td className={tableStyles.cell}> {booking.pickup_time} </td>
                                    <td className={tableStyles.cell}> {booking.passengers} </td>
                                    <td className={tableStyles.cell}> {booking.trip_type} </td>
                                    <td className={tableStyles.cell}> {booking.chauffeurs?.name || "Unassigned"} </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <span
                                            className={`rounded-full px-3 py-1 text-xs font-medium ${statusColorClasses}`} > {booking.status} </span>
                                            {booking.status === "completed" && (<span className={tableStyles.okCheckSign} aria-hidden="true"> ✓ </span>)}
                                        </div>
                                    </td>
                                </tr> 
                            );
                        })
                    }
                        {bookingRows.length === 0 && (<tr> <td className="p-4 text-slate-300" colSpan={8}> No bookings found for this client. </td></tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}