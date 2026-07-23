import Link from "next/link";
import { notFound } from "next/navigation";
import AdminBookingEditForm from "@/components/AdminBookingEditForm";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";


export const dynamic = "force-dynamic";

type AdminBookingEditPageProps = { params: Promise<{ bookingId: string; }>;};

export default async function AdminBookingEditPage({ params}: AdminBookingEditPageProps) {  
    const { bookingId } = await params;
    const { data: bookingRow, error } = await supabaseAdmin
        .from("bookings")
        .select(`
                id, pickup_date, pickup_location, destination, pickup_time,
                passengers, luggage, trip_type, notes, status, chauffeur_id, vehicle_id, has_pets,
                infant_seat_count_required, child_seat_count_required,
                booster_seat_count_required, isofix_required,
                wheelchair_requirement, wheelchair_passenger_count,
                mobility_aid_storage_required, extra_large_luggage_required,
                clients(name, email, phone)
            `)
        .eq("id", bookingId)
        .single();

    if (error || !bookingRow) {
        console.error("Could not load booking for edit:", error);
        notFound();
    }
    const clientRow = Array.isArray(bookingRow.clients)  ? bookingRow.clients[0] ?? null  : bookingRow.clients;
    const bookingForEdit = {  ...bookingRow,  clients: clientRow,  };
    
    // in this selection by supabase, Supabase recognizes the existing foreign key: vehicles.chauffeur_id → chauffeurs.id
    const { data: chauffeurs, error: chauffeursError } = await supabaseAdmin
    .from("chauffeurs")
    .select(`
        id, name, email, account_status, accepts_pets,
        vehicles(
            id, brand, model, license_plate, vehicle_type,
            vehicle_year, vehicle_color, seats, luggage_capacity,
            infant_seat_count, child_seat_count, booster_seat_count,
            isofix_available, wheelchair_access, wheelchair_capacity,
            mobility_aid_storage, extra_large_luggage)`)
    .eq("account_status", "approved") //Only return chauffeurs whose account_status is approved.
    .order("name", { ascending: true });
    if (chauffeursError) { console.error("Could not load chauffeurs:", chauffeursError); }

    const { data: bookingStatuses, error: bookingStatusError } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "booking_status", });
    if (bookingStatusError) { console.error("Could not load booking statuses:", bookingStatusError); }

    const { data: tripTypes, error: tripTypeError } = await supabaseAdmin.rpc("get_enum_values",  { p_enum_type_name: "trip_type"} );
    if (tripTypeError) { console.error("Could not load trip types:", tripTypeError); }

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href="/admin/bookings" className={formStyles.link}>  ← Back to admin bookings  </Link>
                <p className={pageStyles.pageLabelUpper}>Admin</p>
                <h1 className={pageStyles.pageTitle}>Edit booking</h1>
                <p className={pageStyles.pageDescription}> Update booking details, status, and assigned chauffeur. </p>

                <div className="mt-6 rounded-2xl border border-cyan-400/30 bg-slate-900/70 p-4">
                    <p className="text-sm font-semibold text-cyan-300"> Booking reference </p>
                    <p className="mt-2 break-all font-mono text-sm text-slate-200"> {bookingRow.id} </p>
                    <p className="mt-2 text-xs text-slate-400"> Use this reference together with the client email on the public booking status page. </p>
                </div>

                <AdminBookingEditForm  booking={bookingForEdit} chauffeurs={chauffeurs ?? []} bookingStatusOptions={(bookingStatuses ?? []) as string[]} tripTypeOptions={(tripTypes ?? []) as string[]} />            </div>
        </main>
    );
}