
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";
import { SlidersHorizontal } from "lucide-react";
/* Reuse the existing booking filter and UUID copy components. */
import ChauffeurBookingFilters from "../ChauffeurBookingFilters";
import CopyBookingIdButton from "../CopyBookingIdButton";

/* Defines the chauffeur route parameter and optional booking search filters. */
type AdminChauffeurSupportPageProps = {
    params: Promise<{chauffeurId: string}>;
    searchParams: Promise<{
        bookingRef?: string;
        bookingStatus?: string;
        dateFrom?: string;
        dateTo?: string;
    }>;
};
/* ============================================================
   ADMIN CHAUFFEUR SUPPORT PAGE
   Verifies Admin authorization before loading chauffeur data.
   Initially read-only; does not expose chauffeur Server Actions.
============================================================ */
/* Displays the selected chauffeur's assigned bookings and search filters. */
export default async function AdminChauffeurBookingsPage({params, searchParams}: AdminChauffeurSupportPageProps) {
    await requireAdminUser();
    const {chauffeurId} = await params;

    /* Reads the optional booking filters from the URL. */
    const filters = await searchParams;
    const bookingRefFilter = filters.bookingRef?.trim() ?? "";
    const bookingStatusFilter = filters.bookingStatus?.trim() ?? "";
    const dateFromFilter = filters.dateFrom?.trim() ?? "";
    const dateToFilter = filters.dateTo?.trim() ?? "";

    /* Load only the information needed for the initial support overview. */
    const {data: chauffeur, error} = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name, email, phone, account_status")
        .eq("id", chauffeurId)
        .maybeSingle();

    if (error) {console.error("Could not load chauffeur for Admin Support:", error); throw new Error("Could not load chauffeur.");}
    if (!chauffeur) {notFound();}

    
    /* ============================================================
    CHAUFFEUR BOOKING DIAGNOSTICS
    Loads bookings assigned to the selected chauffeur.
    Read-only: no booking updates or server actions.
    ============================================================ */
    const {data: chauffeurBookings, error: bookingsError} = await supabaseAdmin
        .from("bookings")
        .select(`
            id, pickup_location, destination, pickup_date, pickup_time,
            status, vehicle_id,
            clients(name),
            vehicles(brand, model, license_plate)
        `)
        .eq("chauffeur_id", chauffeurId)
        .order("pickup_date", {ascending: true})
        .order("pickup_time", {ascending: true});

    if (bookingsError) {
        console.error("Admin Support: Could not load chauffeur bookings:", bookingsError);
    }

    /* ============================================================
    FILTER CHAUFFEUR BOOKINGS
    Filters assigned bookings by reference, status and date range.
    Does not modify booking data or database records.
    ============================================================ */
    const filteredBookings = (chauffeurBookings ?? []).filter((booking) => {
        const matchesReference = booking.id.toLowerCase().includes(bookingRefFilter.toLowerCase());
        const matchesStatus = !bookingStatusFilter || booking.status === bookingStatusFilter;
        const matchesDateFrom = !dateFromFilter || booking.pickup_date >= dateFromFilter;
        const matchesDateTo = !dateToFilter || booking.pickup_date <= dateToFilter;

        return matchesReference && matchesStatus && matchesDateFrom && matchesDateTo;
    });

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href={`/admin/chauffeurs/${chauffeurId}/support`} className={formStyles.link}>
                    {"\u2190"} Back to Support Dashboard
                </Link>

                <p className={pageStyles.pageLabelUpper}>Admin support mode</p>
                <h1 className={pageStyles.pageTitle}>Chauffeur: {chauffeur.name}</h1>
                <p className={pageStyles.pageDescription}>Read-only support view. No chauffeur actions can be performed here.</p>

                {/* Basic account information for troubleshooting. */}
                <section className="mt-6 rounded-xl border border-cyan-400/30 bg-slate-900/70 p-5">
                    <h2 className="mb-4 font-semibold text-cyan-300">Account information</h2>
                    {/* Shows the full chauffeur UUID for Admin troubleshooting. */}
                    <div className="sm:col-span-2 gap-3 mb-3">
                         <div className="flex items-center gap-3">
                            <Link href={`/admin/chauffeurs/${chauffeur.id}`} className={formStyles.link}>Open Chauffeur details</Link>
                            <CopyBookingIdButton recordId={chauffeur.id} label="Copy Chauffeur UUID" />
                        </div>
                    </div>
                    <div className="grid gap-3 text-sm text-white sm:grid-cols-2">
                        <p>Email: {chauffeur.email}</p>
                        <p>Phone: {chauffeur.phone}</p>
                        <p>Account status: {chauffeur.account_status}</p>
                    </div>
                </section>

                {/* ============================================================
                    ADMIN SUPPORT — BOOKING FILTER PANEL
                    Provides read-only booking search controls for the selected
                    chauffeur. Filtering uses URL parameters.
                ============================================================ */}
                <section className="mt-6 rounded-xl border border-cyan-500/30 bg-slate-900/70 p-4 shadow-lg sm:p-6">
                    <div className="mb-4 flex items-center gap-2 border-b border-cyan-500/20 pb-3">
                        <SlidersHorizontal className="h-5 w-5 text-cyan-400" aria-hidden="true" />
                        <h2 className="text-lg font-semibold text-cyan-300">Filter chauffeur bookings</h2>
                    </div>
                    <ChauffeurBookingFilters chauffeurId={chauffeurId} bookingRefFilter={bookingRefFilter} bookingStatusFilter={bookingStatusFilter} dateFromFilter={dateFromFilter} dateToFilter={dateToFilter} />
                </section>

                {/* ============================================================
                    ADMIN SUPPORT — CHAUFFEUR BOOKINGS
                    Shows bookings currently assigned to this chauffeur.
                    Read-only for troubleshooting; no booking actions.
                ============================================================ */}
                <section className="mt-6 rounded-xl border border-cyan-400/30 bg-slate-900/70 p-5">
                    <h2 className="mb-4 text-lg font-semibold text-cyan-300">Chauffeur bookings ({filteredBookings.length})</h2>

                    {bookingsError ? (
                        <p className="text-red-300">Could not load chauffeur bookings. Please check the server logs.</p>
                    ) : !filteredBookings.length ? (
                        //Distinguishes no assigned bookings from searches with no matching results. 
                        <p className="text-sm text-slate-400">
                            {!chauffeurBookings?.length
                                ? "No bookings are currently assigned to this chauffeur."
                                : "No bookings match the selected filters."}
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {filteredBookings.map((booking) => (
                                <article key={booking.id} className="rounded-lg border border-white/10 bg-slate-800/60 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-semibold text-white">{booking.pickup_date} — {booking.pickup_time}</span>
                                        <span className="rounded-md bg-cyan-950 px-2 py-1 text-xs text-cyan-200">{booking.status}</span>
                                    </div>

                                    <p className="mt-1 text-sm text-white">{booking.pickup_location} → {booking.destination}</p>
                                    <p className="mt-1 text-sm text-slate-400">Booking reference: {booking.id.slice(0, 8)}</p>

                                    <p className="mt-1 text-sm text-slate-300">
                                        {/* Supports both array and object relationship responses from Supabase. */}
                                        Client: {(Array.isArray(booking.clients) ? booking.clients[0] : booking.clients)?.name ?? "Unknown"}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-300">
                                        {/* Display the related vehicle whether Supabase returns an array or object. */}
                                        Vehicle: {(() => {
                                            const vehicle = Array.isArray(booking.vehicles) ? booking.vehicles[0] : booking.vehicles;
                                            return vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.license_plate})` : "Not assigned";
                                        })()}
                                    </p>
                                    <div className="flex items-center gap-3">
                                        {/* Opens the details page for the selected booking. */}
                                        <Link href={`/admin/bookings/${booking.id}`} className={formStyles.link}>
                                            Open Booking details
                                        </Link >
                                        <CopyBookingIdButton recordId={booking.id} label="Copy Booking ID" />
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
