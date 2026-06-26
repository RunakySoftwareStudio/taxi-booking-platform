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
        .select( ` id, pickup_date,pickup_location, destination,  pickup_time, passengers, luggage, trip_type, notes, status,  chauffeur_id, has_pets, clients  ( name, email,phone) `    )
        .eq("id", bookingId)
        .single();

    if (error || !bookingRow) {
        console.error("Could not load booking for edit:", error);
        console.error("Booking id from URL:", bookingId);
        notFound();
    }
    const clientRow = Array.isArray(bookingRow.clients)  ? bookingRow.clients[0] ?? null  : bookingRow.clients;
    const bookingForEdit = {  ...bookingRow,  clients: clientRow,  };
    const { data: chauffeurs, error: chauffeursError } = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name, email, account_status,accepts_pets")
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
                <p className={pageStyles.pageDescription}>  Update booking details, status, and assigned chauffeur.  </p>

                <AdminBookingEditForm  booking={bookingForEdit} chauffeurs={chauffeurs ?? []} bookingStatusOptions={(bookingStatuses ?? []) as string[]} tripTypeOptions={(tripTypes ?? []) as string[]} />
            </div>
        </main>
    );
}