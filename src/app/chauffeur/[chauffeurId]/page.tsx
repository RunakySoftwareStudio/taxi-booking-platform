

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseServer";
import Link from "next/link";

export const dynamic = "force-dynamic";

type TypeChauffeurRow = { id: string;  name: string;  email: string;  phone: string;  service_area: string | null;  account_status: string;};
type TypeAssignedBookingRow = 
{
    id: string;  pickup_location: string;  destination: string;  
    pickup_date: string;  pickup_time: string;  passengers: number;  luggage: number;  
    trip_type: string;  status: string;  notes: string | null;
    clients: { name: string;  email: string;  phone: string; } | null;
};

type TypePromiseChauffeurId = { params: Promise<{ chauffeurId: string; }>;};

type TypeVehicleRow = 
{
    id: string;  brand: string;  model: string;
    license_plate: string;  vehicle_type: string;
    seats: number;  luggage_capacity: number;  created_at: string;
};

// Only update this booking if it belongs to this chauffeur.
async function updateAssignedBookingStatus(formData: FormData) 
{  "use server";
    const bookingId = String(formData.get("bookingId") || "");
    const chauffeurId = String(formData.get("chauffeurId") || "");
    const status = String(formData.get("status") || "");

    if (!bookingId || !chauffeurId || !status) {  return;  }

    const { error } = await supabaseAdmin
        .from("bookings")
        .update({ status })
        .eq("id", bookingId)
        .eq("chauffeur_id", chauffeurId);

    if (error) { console.error("Could not update assigned booking status:", error); return; }

    revalidatePath(`/chauffeur/${chauffeurId}`);
    redirect(`/chauffeur/${chauffeurId}`);
}

export default async function ChauffeurDashboardPage ({params}: TypePromiseChauffeurId) 
{
    const {chauffeurId} = await params;

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
            <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
                <div className="mx-auto max-w-6xl">
                    <h1 className="text-3xl font-bold">Chauffeur dashboard</h1>
                    <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200"> Could not load chauffeur. </p>
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
        <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
            <div className="mx-auto max-w-6xl">
                <Link href="/admin/chauffeurs" className="text-sm text-cyan-300 hover:text-cyan-200"> ← Back to Chauffeurs </Link>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> Chauffeur </p>
                <h1 className="mt-3 text-3xl font-bold"> Welcome, {chauffeurRow.name} </h1>
                <p className="mt-4 text-slate-300"> Here you can see bookings assigned to you. </p>

                <div className="mt-6">
                    <Link href={`/chauffeur/${chauffeurRow.id}/availability`} className="mt-6 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 text-base font-semibold text-cyan-100 hover:bg-cyan-400/20" >
                        Manage availability
                    </Link>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <p className="text-sm text-slate-400">Email</p>
                        <p className="mt-2 font-medium">{chauffeurRow.email}</p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <p className="text-sm text-slate-400">Phone</p>
                        <p className="mt-2 font-medium">{chauffeurRow.phone}</p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                        <p className="text-sm text-slate-400">Status</p>
                        <p className="mt-2 font-medium">{chauffeurRow.account_status}</p>
                    </div>
                </div>

                <h3 className="mt-12 text-2xl font-bold">My vehicles</h3>
                <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
                <table className="w-full min-w-200 text-left text-sm">
                    <thead className="border-b border-white/10 bg-white/10 text-slate-300">
                        <tr>
                            <th className="p-4">Brand</th>
                            <th className="p-4">Model</th>
                            <th className="p-4">License plate</th>
                            <th className="p-4">Type</th>
                            <th className="p-4">Seats</th>
                            <th className="p-4">Luggage</th>
                        </tr>
                    </thead>

                    <tbody>
                        {vehicleRows.map((vehicle) => (
                            <tr key={vehicle.id} className="border-b border-white/10">
                            <td className="p-4 text-slate-300">{vehicle.brand}</td>
                            <td className="p-4 text-slate-300">{vehicle.model}</td>
                            <td className="p-4 text-slate-300">{vehicle.license_plate}</td>
                            <td className="p-4 text-slate-300">{vehicle.vehicle_type}</td>
                            <td className="p-4 text-slate-300">{vehicle.seats}</td>
                            <td className="p-4 text-slate-300">{vehicle.luggage_capacity}</td>
                            </tr>
                        ))}
                        {vehicleRows.length === 0 && (<tr><td className="p-4 text-slate-300" colSpan={6}>No vehicles connected to this chauffeur yet.</td></tr>)}
                    </tbody>
                </table>
                </div>
                
                <h3 className="mt-12 text-2xl font-bold">My Bookins</h3>
                <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
                    <table className="w-full min-w-200 text-left text-sm">
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
                            {bookingRows.map((booking) =>(
                                <tr key={booking.id} className="border-b border-white/10">
                                    <td className="p-4">
                                        <div className="font-medium text-white"> {booking.clients?.name || "Unknown client"} </div>
                                        <div className="text-xs text-slate-400"> {booking.clients?.email} </div>
                                        <div className="text-xs text-slate-400"> {booking.clients?.phone} </div>
                                    </td>
                                    <td className="p-4 text-slate-300"> {booking.pickup_location} </td>
                                    <td className="p-4 text-slate-300"> {booking.destination} </td>
                                    <td className="p-4 text-slate-300"> {booking.pickup_date} </td>
                                    <td className="p-4 text-slate-300"> {booking.pickup_time} </td>
                                    <td className="p-4 text-slate-300"> {booking.passengers}  </td>
                                    <td className="p-4 text-slate-300"> {booking.trip_type}   </td>

                                    <td className="p-4">
                                        <form action={updateAssignedBookingStatus} className="flex items-center gap-2">
                                            <input type="hidden" name="bookingId" value={booking.id} />
                                            <input type="hidden" name="chauffeurId" value={chauffeurRow.id} />
                                            <select
                                                name="status" defaultValue={booking.status} 
                                                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                                                {bookingStatusOptions.map((status) => (<option key={status} value={status}> {status} </option>  ))}
                                            </select>

                                            <button type="submit" className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/20">
                                                Save
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            ))}

                            {bookingRows.length === 0 && (<tr><td className="p-4 text-slate-300" colSpan={8}>No assigned bookings found yet.</td></tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}