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
import { pageStyles, tableStyles, formStyles, mobileStyle } from "@/styles/classNames";

import Link from "next/link"; 
import { Fragment } from "react";
import ScrollToBooking from "@/components/ScrollToBooking";
import SearchableChauffeurFilter from "./SearchableChauffeurFilter";
import { SlidersHorizontal } from "lucide-react";
import CopyBookingIdButton from "@/app/admin/chauffeurs/[chauffeurId]/support/CopyBookingIdButton";
/* Protect Admin booking operations independently of page access. */
import IncludeCancelledCheckbox from "./IncludeCancelledCheckbox";

//export const dynamic = "force-dynamic"; //Keep dynamic only in: src/app/admin/bookings/page.tsx 
/**
 * These new values will later mean:
    search        → Search bookings
    assignment    → all / assigned / unassigned
    chauffeurId   → one specific chauffeur
    pickupDate    → journey date
    sort          → newest / oldest / journey date

    For example, eventually the URL could look like:
    /admin/bookings?assignment=unassigned
    or:
    /admin/bookings?chauffeurId=123...
    or several together:
    /admin/bookings?assignment=assigned&pickupDate=2026-10-20&sort=journey_asc
 */
type AdminBookingsPageProps = {
    searchParams: Promise<{
        success?: string;
        error?: string;
        bookingId?: string;

        /* Include cancelled bookings only when explicitly requested. */
        includeCancelled?: string;
        /* Admin booking-list search and filter values. */
        search?: string;
        assignment?: string;
        chauffeurId?: string;
        pickupDate?: string;
        period?: string;
        sort?: string;
        page?: string;
    }>;
};

// type  = creates a TypeScript rule/shape for data
type BookingRow = 
{
    id: string;  pickup_location: string;  destination: string;  pickup_date: string;
    pickup_time: string;  passengers: number;  luggage: number;  trip_type: string;
    status: string;  created_at: string; notes: string; has_pets: boolean;
    infant_seat_count_required: number;  child_seat_count_required: number;
    booster_seat_count_required: number; isofix_required: boolean;
    wheelchair_requirement: string;  wheelchair_passenger_count: number;
    mobility_aid_storage_required: boolean;  extra_large_luggage_required: boolean;
    clients: {name: string;  email: string;  phone: string; } | null;
    chauffeur_id: string | null;
    chauffeurs: {name: string; email: string; phone: string; } | null;
    vehicle_id: string | null;
    vehicles: {
        id: string; brand: string; model: string; license_plate: string;
        vehicle_type: string; vehicle_year: number | null; vehicle_color: string | null;
    } | null;
};

type ChauffeurVehicleOption = {
    id: string; is_default_vehicle: boolean;
    vehicle_status: string;
    seats: number; luggage_capacity: number;
    infant_seat_count: number; child_seat_count: number; booster_seat_count: number;
    isofix_available: boolean; wheelchair_access: string; wheelchair_capacity: number;
    mobility_aid_storage: boolean; extra_large_luggage: boolean;
};

//each approved chauffeur now includes the default vehicle capabilities required for matching.
type ChauffeurOption = {
    id: string; name: string; email: string;
    account_status: string; operational_status: string;
    accepts_pets: boolean; vehicles: ChauffeurVehicleOption[];
};

export default async function AdminBookingsPage({ searchParams}: AdminBookingsPageProps) {
    const pageMessage = await searchParams;

    /* Cancelled bookings are hidden by default. */
    const includeCancelled = pageMessage.includeCancelled === "true";

    /* Stores the booking selected from the assignment-alert page. */
    const selectedBookingId = pageMessage.bookingId ?? null;

    /* Reads and validates the Admin assignment filter from the URL. */
    const assignmentFilter =
        pageMessage.assignment === "assigned" || pageMessage.assignment === "unassigned"
            ? pageMessage.assignment
            : "all";

    /* Stores the chauffeur selected in the Admin booking filter. */
    const selectedChauffeurId = pageMessage.chauffeurId?.trim() ?? "";

    /* Reads and validates the journey-date filter from the URL. */
    const selectedPickupDate =
        /^\d{4}-\d{2}-\d{2}$/.test(pageMessage.pickupDate ?? "")
            ? pageMessage.pickupDate ?? ""
            : "";

    /* Reads the requested booking-list page and prevents invalid page numbers. */
    const requestedPage = Number(pageMessage.page ?? "1");
    const currentPage =
        Number.isInteger(requestedPage) && requestedPage > 0
            ? requestedPage
            : 1;

    const pageSize = 20;

    /* Calculates the database row range for the selected booking page. */
    const pageFrom = (currentPage - 1) * pageSize;
    const pageTo = pageFrom + pageSize - 1;

    /* Reads and validates the journey-period filter from the URL. That gives a value such as:2026-10-19*/
    const journeyPeriod =
        pageMessage.period === "today" ||
        pageMessage.period === "upcoming" ||
        pageMessage.period === "past"
            ? pageMessage.period
            : "all";

    /* Returns today's calendar date in the Netherlands for journey filtering. */
    const todayDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Amsterdam",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());

    let bookingsQuery = supabaseAdmin // data: bookings= you are renaming data to bookings.
        .from("bookings")
        .select
        ( `
            id, pickup_location, destination, pickup_date, pickup_time,
            passengers, luggage, trip_type, status, notes, created_at, has_pets,
            infant_seat_count_required, child_seat_count_required,
            booster_seat_count_required,  isofix_required,
            wheelchair_requirement, wheelchair_passenger_count,
            mobility_aid_storage_required, extra_large_luggage_required,
            clients (name, email, phone ),
            chauffeur_id, vehicle_id,
            chauffeurs (name, email, phone ),
            vehicles(id, brand, model, license_plate, vehicle_type, vehicle_year, vehicle_color) `,
             { count: "exact" }
        )

        /* Switch between active and cancelled booking lists. */
        if (includeCancelled) {
            bookingsQuery = bookingsQuery.eq("status", "cancelled");
        } else {
            bookingsQuery = bookingsQuery.neq("status", "cancelled");
        }

    /*
        Filters bookings by a specific chauffeur when selected.
        A specific chauffeur takes priority over the general assigned/unassigned filter.

        That gives us:
        Specific chauffeur selected
                ↓
        Bookings for that chauffeur only

        No chauffeur selected + Assigned
                ↓
        All assigned bookings

        No chauffeur selected + Unassigned
                ↓
        All unassigned bookings

        No chauffeur selected + All
                ↓
        All bookings
    */
    if (selectedChauffeurId) {bookingsQuery = bookingsQuery.eq("chauffeur_id", selectedChauffeurId);}
    else if (assignmentFilter === "assigned") {bookingsQuery = bookingsQuery.not("chauffeur_id", "is", null);}
    else if (assignmentFilter === "unassigned") {bookingsQuery = bookingsQuery.is("chauffeur_id", null);}

   /* Exact journey date takes priority over the broader journey-period filter. */
    if (selectedPickupDate) {
        bookingsQuery = bookingsQuery.eq("pickup_date", selectedPickupDate);
    }
    else if (journeyPeriod === "today") {
        bookingsQuery = bookingsQuery.eq("pickup_date", todayDate);
    }
    else if (journeyPeriod === "upcoming") {
        bookingsQuery = bookingsQuery.gt("pickup_date", todayDate);
    }
    else if (journeyPeriod === "past") {
        bookingsQuery = bookingsQuery.lt("pickup_date", todayDate);
    }

    /* Orders the results and loads only the bookings for the selected page. */
    bookingsQuery = bookingsQuery
        .order("created_at", { ascending: false })
        .range(pageFrom, pageTo);

    const { data: bookings, error, count: bookingCount } = await bookingsQuery;

    /* Calculates how many booking pages are available. */
    const totalBookings = bookingCount ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalBookings / pageSize));

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
        .select(`
                id, name, email, account_status, operational_status, accepts_pets,
                vehicles(
                    id, is_default_vehicle, vehicle_status,
                    seats, luggage_capacity,
                    infant_seat_count, child_seat_count, booster_seat_count,
                    isofix_available, wheelchair_access, wheelchair_capacity,
                    mobility_aid_storage, extra_large_luggage)`)
        .eq("account_status", "approved")
        .order("name", { ascending: true });

    const chauffeurOptions = (approvedChauffeurs ?? []) as unknown as ChauffeurOption[]; // as unknown => TypeScript, I know you are not sure about this data, but trust me: this is a ChauffeurOption[].
    if (chauffeursError) { console.error("Could not load approved chauffeurs:", chauffeursError);}
    const bookingRows = (bookings ?? []) as unknown as BookingRow[];
    
    //===============helper function:
    function formatShortDate(dateValue: string | null) {
            if (!dateValue) { return "-"; }
            const [year, month, day] = dateValue.split("-");
            return `${day}/${month}/${year.slice(2)}`;
        }
    function formatShortTime(timeValue: string | null) {
        if (!timeValue) { return "-"; }
        return timeValue.slice(0, 5);
        }

    // formatShortBookingReference shows a shorter booking reference in the admin list.
    // The full booking ID is still available on the edit booking page.
    function formatShortBookingReference(bookingId: string) {
        if (!bookingId) { return "-"; }
        return bookingId.slice(0, 8);
    }

    function getWheelchairRequirementLabel(requirementValue: string) {
        if (requirementValue === "none") { return "None"; }
        if (requirementValue === "foldable") { return "Foldable wheelchair"; }
        if (requirementValue === "remain_in_wheelchair") { return "Remain seated in wheelchair"; }
        return requirementValue;
    }

    // Creates one readable label for the assigned vehicle.
    function getAssignedVehicleLabel(vehicle: BookingRow["vehicles"]) {
        if (!vehicle) { return "Not assigned"; }
        return `${vehicle.brand} ${vehicle.model} — ${vehicle.license_plate}`;
    }

    /* Builds a booking-list URL while keeping the active Admin filters. */
    function buildBookingsPageUrl(pageNumber: number) {
        const params = new URLSearchParams();
        /* Preserve the cancelled-bookings filter during pagination. */
        if (includeCancelled) {params.set("includeCancelled", "true");}
        if (assignmentFilter !== "all") {params.set("assignment", assignmentFilter);}
        if (pageMessage.search) {params.set("search", pageMessage.search);}
        if (pageMessage.chauffeurId) {params.set("chauffeurId", pageMessage.chauffeurId);}
        if (pageMessage.pickupDate) {params.set("pickupDate", pageMessage.pickupDate);}
        if (pageMessage.sort) {params.set("sort", pageMessage.sort);}
        if (journeyPeriod !== "all") {params.set("period", journeyPeriod);}
        params.set("page", String(pageNumber));

        return `/admin/bookings?${params.toString()}`;
    }

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
            {/* Scrolls to the booking opened from an assignment alert. */}
            <ScrollToBooking bookingId={selectedBookingId} />
            <div className={pageStyles.container}> 
                <Link  href="/admin" className={formStyles.link}  > ← Back to admin dashboard </Link>
                <p className={pageStyles.pageLabelUpper}> Admin </p>
                <h1 className={pageStyles.pageTitle}>Booking requests</h1>
                <p className={pageStyles.pageDescription}>  Here you can see booking requests submitted through the website. </p>

                {/* ============================================================
                    ADMIN BOOKINGS FILTER PANEL
                    Groups existing search controls into a clearly labelled box.
                    The filtering logic remains unchanged.
                ============================================================ */}
                <section className="mt-6 rounded-xl border border-cyan-500/30 bg-slate-900/70 p-4 shadow-lg sm:p-6">
                    <div className="mb-4 flex items-center gap-2 border-b border-cyan-500/20 pb-3">
                        <SlidersHorizontal className="h-5 w-5 text-cyan-400" aria-hidden="true" />
                        <h2 className="text-lg font-semibold text-cyan-300">Filter chauffeurs</h2>
                    </div>
                    {/* Filters bookings by whether a chauffeur is assigned. */}
                    <form method="GET" action="/admin/bookings" className="mt-6 flex flex-wrap items-end gap-3">
                        {/* Keeps Assignment and Chauffeur filters synchronized. */}
                        <SearchableChauffeurFilter
                            chauffeurs={chauffeurOptions.map((chauffeur) => ({id: chauffeur.id, name: chauffeur.name, }))}
                            assignmentFilter={assignmentFilter} selectedChauffeurId={selectedChauffeurId}
                        />

                        {/* Filters bookings by their journey date relative to today. */}
                        <div>
                            <label htmlFor="period" className="mb-1 block text-sm text-slate-300">
                                Journey period
                            </label>

                            <select id="period" name="period" defaultValue={journeyPeriod} className={formStyles.selectForm}>
                                <option value="all">All dates</option>
                                <option value="today">Today</option>
                                <option value="upcoming">Upcoming</option>
                                <option value="past">Past bookings</option>
                            </select>
                        </div>

                        {/* Filters bookings by journey pickup date. */}
                        <div>
                            <label htmlFor="pickupDate" className="mb-1 block text-sm text-slate-300">
                                Journey date
                            </label>
                            <input id="pickupDate" type="date" name="pickupDate" defaultValue={selectedPickupDate} className={formStyles.selectForm} />
                        </div>
                        {/* Allow Admin to include cancelled bookings in the list. */}
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            {/* Automatically refresh the booking list when toggled. */}
                            <IncludeCancelledCheckbox includeCancelled={includeCancelled} />
                        </label>
                        {/* Apply the filter. */}
                        <button type="submit" className={formStyles.filterButton}>
                            Search
                        </button>
                    </form>
                </section>

                {/* Shows booking count and page navigation while keeping the table scroll available. */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-400">
                        Showing {totalBookings === 0 ? 0 : pageFrom + 1}–
                        {Math.min(pageTo + 1, totalBookings)} of {totalBookings} bookings
                    </p>

                    {totalPages > 1 && (
                        <div className="flex flex-wrap items-center gap-2">
                            {currentPage > 1 && (
                                <Link href={buildBookingsPageUrl(currentPage - 1)} className={formStyles.link}>
                                    Previous
                                </Link>
                            )}

                            {Array.from({ length: totalPages }, (_, index) => {
                                const pageNumber = index + 1;
                                return (
                                    <Link key={pageNumber} href={buildBookingsPageUrl(pageNumber)}
                                        className={
                                            pageNumber === currentPage
                                                ? "rounded-md bg-cyan-600 px-3 py-1 text-sm font-semibold text-white"
                                                : "rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-cyan-500"
                                        }>
                                        {pageNumber}
                                    </Link>
                                );
                            })}

                            {currentPage < totalPages && (
                                <Link href={buildBookingsPageUrl(currentPage + 1)} className={formStyles.link}>
                                    Next
                                </Link>
                            )}
                        </div>
                    )}
                </div>
                {pageMessage.success === "chauffeur-assigned" && ( <p className={pageStyles.successMsgPage}>    Chauffeur assigned successfully. </p>)}
                {pageMessage.success === "status-updated" && ( <p className={pageStyles.successMsgPage}>    Booking status updated successfully. </p>)}
                {pageMessage.error === "missing-fields" && ( <p className={pageStyles.errorMsgPage}>    Please select the required booking information. </p>)}
                {pageMessage.error === "assign-failed" && ( <p className={pageStyles.errorMsgPage}>    Could not assign chauffeur. Please try again. </p>)}
                {pageMessage.error === "status-update-failed" && (  <p className={pageStyles.errorMsgPage}>    Could not update booking status. Please try again. </p>)}
                {pageMessage.success === "booking-updated" && ( <p className={pageStyles.successMsgPage}> Booking updated successfully. </p>)}
                {pageMessage.error === "booking-update-failed" && (  <p className={pageStyles.errorMsgPage}> Could not update booking. Please try again.  </p>)}
                {pageMessage.error === "chauffeur-time-conflict" && ( <p className={pageStyles.errorMsgPage}> This chauffeur already has another booking during this time. </p>)}
                {/* Explain when a chauffeur is unavailable because of an offline or holiday period. */}
                {pageMessage.error === "chauffeur-unavailable-period" && (<p className={pageStyles.errorMsgPage}> The selected chauffeur is unavailable during the requested time.</p>)}
                {pageMessage.error === "chauffeur-required" && ( <p className={pageStyles.errorMsgPage}> Please assign a chauffeur before using an active booking status. </p> )}
                {pageMessage.error === "journey-crosses-midnight" && (<p className={pageStyles.errorMsgPage}>This journey crosses midnight and cannot yet create a busy period. </p> )}
                {pageMessage.error === "chauffeur-not-approved" && ( <p className={pageStyles.errorMsgPage}>Only an approved chauffeur can be assigned.</p>)}
                {pageMessage.error === "chauffeur-does-not-accept-pets" && ( <p className={pageStyles.errorMsgPage}>The selected chauffeur does not accept pets.</p>)}
                {pageMessage.error === "default-vehicle-missing" && (<p className={pageStyles.errorMsgPage}>The selected chauffeur has no default vehicle.</p>)}
                {pageMessage.error === "default-vehicle-mismatch" && (<p className={pageStyles.errorMsgPage}>The default vehicle does not match this booking. Use Edit booking to select another vehicle.</p>)}
                {pageMessage.error === "assignment-required" && ( <p className={pageStyles.errorMsgPage}>An active booking requires a chauffeur and matching vehicle.</p>)}
                {pageMessage.error === "chauffeur-unavailable" && ( <p className={pageStyles.errorMsgPage}> The selected chauffeur is not operationally available. </p>)}
                {pageMessage.error === "default-vehicle-unavailable" && (<p className={pageStyles.errorMsgPage}>The selected chauffeur&apos;s default vehicle is not operationally available. </p>)}
                {/* Explains why the selected chauffeur cannot be assigned to this booking. */}
                {pageMessage.error === "chauffeur-compliance-invalid" && (<p className={pageStyles.errorMsgPage}>Chauffeur compliance is not valid for this booking pickup date.</p>)}

                {/* Mobile booking cards */}
                <div className="mt-10 grid gap-4 lg:hidden">
                    {bookingRows.map((booking) => (
                        /*
                            What this does:
                                id={`booking-${booking.id}`}
                                creates an HTML location such as:   booking-66905db4-95c5-49d5-a270-9ab573f6eebd
                                This part checks whether the current card is the selected booking:  selectedBookingId === booking.id
                                When true, it adds a red border and background.
                        */
                        <article  data-booking-id={booking.id} key={booking.id}
                            className={`${mobileStyle.article} scroll-mt-24 ${ selectedBookingId === booking.id ? mobileStyle.redBorder : "" }`} >
                                <div className="border-b border-white/10 pb-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="mt-2">
                                                <span className={mobileStyle.inforCaption}>Ref: </span>
                                                <span className={`${mobileStyle.infoValue} break-all`}>{formatShortBookingReference(booking.id)}</span>
                                            </p>
                                            <p className="mt-2">
                                                <span className={mobileStyle.inforCaption}>Client name: </span>
                                                <span className={mobileStyle.infoValue}>{booking.clients?.name}</span>
                                            </p>
                                            <p className="mt-2">
                                                <span className={mobileStyle.inforCaption}>Email: </span>
                                                <span className={mobileStyle.infoValue}>{booking.clients?.email}</span>
                                            </p>
                                            <div className="grid grid-cols-2 mt-2">
                                                <p>
                                                    <span className={mobileStyle.inforCaption}>Phone: </span>
                                                    <span className={mobileStyle.infoValue}>{booking.clients?.phone}</span>
                                                </p>                                            
                                            </div>                                       
                                            <p className="mt-2">
                                                <span className={mobileStyle.inforCaption}> Pickup  </span>
                                                <span className={mobileStyle.infoValue}>{booking.pickup_location}</span>
                                            </p>
                                            <div className="mt-2">
                                                <span className={mobileStyle.inforCaption}> Destination:  </span>
                                                <span className={mobileStyle.infoValue}>{booking.destination}</span>
                                            </div>

                                            {/* Display booking status and assigned chauffeur on mobile. */}
                                            <div className="mt-2 grid gap-2">
                                                <div>
                                                    <span className={mobileStyle.inforCaption}>Status: </span>
                                                    <span className={mobileStyle.infoValue}>{booking.status}</span>
                                                </div>

                                                <div>
                                                    <span className={mobileStyle.inforCaption}>Assigned chauffeur: </span>
                                                    <span className={mobileStyle.infoValue}>{booking.chauffeurs?.name ?? "Unassigned"}</span>
                                                </div>
                                            </div>
                                        </div>                                   
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-2">
                                    <div className="grid grid-cols-2 ">
                                        <div>
                                            <span className={mobileStyle.inforCaption}> Date: </span>
                                            <span className={mobileStyle.infoValue}>{formatShortDate(booking.pickup_date)}</span>
                                        </div>
                                        <div>
                                            <span className={mobileStyle.inforCaption}> Time: </span>
                                            <span className={mobileStyle.infoValue}>{formatShortTime(booking.pickup_time)}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 ">
                                        <div>
                                            <span className={mobileStyle.inforCaption}> Pax: </span>
                                            <span className={mobileStyle.infoValue}>{booking.passengers}</span>
                                        </div>
                                        <div>
                                            <span className={mobileStyle.inforCaption}> Trip: </span>
                                            <span className={mobileStyle.infoValue}>{booking.trip_type}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <span className={mobileStyle.inforCaption}>  Has pets:  </span>
                                        <span  className={booking.has_pets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed  } >
                                            {booking.has_pets  ? "yes ✓" : "No"}
                                        </span>
                                    </div>
                                    <div className="mt-3 border-t border-white/10 pt-3">
                                        <p className="font-semibold text-white">Passenger support</p>
                                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <span className={mobileStyle.inforCaption}>Infant seats: </span>
                                                <span className={mobileStyle.infoValue}>{booking.infant_seat_count_required}</span>
                                            </div>
                                            <div>
                                                <span className={mobileStyle.inforCaption}>Child seats: </span>
                                                <span className={mobileStyle.infoValue}>{booking.child_seat_count_required}</span>
                                            </div>
                                            <div>
                                                <span className={mobileStyle.inforCaption}>Booster seats: </span>
                                                <span className={mobileStyle.infoValue}>{booking.booster_seat_count_required}</span>
                                            </div>
                                            {booking.wheelchair_requirement === "remain_in_wheelchair" && (
                                                <div>
                                                    <span className={mobileStyle.inforCaption}>Wheelchair pas.: </span>
                                                    <span className={mobileStyle.infoValue}>{booking.wheelchair_passenger_count}</span>
                                                </div>
                                            )}
                                            <div className="col-span-2">
                                                <span className={mobileStyle.inforCaption}>Wheelchair: </span>
                                                <span className={mobileStyle.infoValue}>{getWheelchairRequirementLabel(booking.wheelchair_requirement)}</span>
                                            </div>
                                            <div>
                                                <span className={mobileStyle.inforCaption}>ISOFIX: </span>
                                                <span className={booking.isofix_required ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>
                                                    {booking.isofix_required ? "Yes" : "No"}
                                                </span>
                                            </div>
                                            <div>
                                                <span className={mobileStyle.inforCaption}>Large luggage: </span>
                                                <span className={booking.extra_large_luggage_required ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>
                                                    {booking.extra_large_luggage_required ? "Yes" : "No"}
                                                </span>
                                            </div>
                                            <div className="col-span-2 flex items-center gap-1">
                                                <span className={mobileStyle.inforCaption}>Mobility-aid storage:</span>
                                                <span className={booking.mobility_aid_storage_required ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>
                                                    {booking.mobility_aid_storage_required ? "Yes" : "No"}
                                                </span>
                                            </div>
                                            
                                        </div>
                                    </div>
                                    <div>
                                        <span className={mobileStyle.inforCaption}>  Notes:  </span>
                                        <span className={mobileStyle.infoValue}> {booking.notes || "-----"} </span>
                                    </div>
                                </div>
                                {/* Open the booking details page for all management operations. */}
                                <div className="mt-3 flex justify-end">
                                    <Link href={`/admin/bookings/${booking.id}`} className={formStyles.smallButton}>
                                        View / Edit Booking
                                    </Link>
                                </div>
                            </article>	  ))}

                    {bookingRows.length === 0 && (<div className={mobileStyle.article}>  No bookings found yet. </div> )}
                </div>

                {/* Desktop booking table */}
                <div className={`${tableStyles.DivCyanList} hidden max-h-[75vh] overflow-auto scrollbar-thin scrollbar-thumb-cyan-700 scrollbar-track-slate-950 lg:block`}>
                <table className={`${tableStyles.table1000} min-w-312.5`}>
                    <thead className={tableStyles.tableHeaderCyan}>
                        <tr>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Client </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Pickup </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Destination </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Date </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Time </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Pax  </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Trip </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Luggage </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> Has pet </th>
                            <th className={`${tableStyles.cellCaption} sticky top-0 z-20 bg-slate-950`}> </th>
                        </tr>
                    </thead>
                        <tbody>
                            {bookingRows.map((booking) => {
                                    /* Checks whether this is the booking opened from an assignment alert. */
                                    const isSelectedBooking = selectedBookingId === booking.id;

                                    /* Returns the three desktop rows belonging to one booking. */
                                    return (
                                        <Fragment key={booking.id}>
                                        {/*This highlights the first row of the selected desktop booking.
                                            border-l-2 border-r-2 border-t-2 border-red-400
                                            mean:
                                                border-l-2 → left border
                                                border-r-2 → right border
                                                border-t-2 → top border
                                                border-b-2 → bottom border
                                                border-red-400 → red color
                                        */}
                                        <tr  data-booking-id={booking.id}
                                              className={`${tableStyles.rowCyan} scroll-mt-24 align-top border-b-0  ${isSelectedBooking ? "bg-red-400/10" : "" }`}>
                                            <td className={`${tableStyles.cellCaption} ${isSelectedBooking ? "border-l-2 border-t-2 border-red-400" : "" }`}>
                                                <div className={tableStyles.cellCaptionGroupBold}> {booking.clients?.name || "Unknown client"} </div>
                                                <div className={tableStyles.cellInfo}> Ref: {formatShortBookingReference(booking.id)} </div>
                                                <div className={tableStyles.cellInfo}> {booking.clients?.email}</div>
                                                <div className={tableStyles.cellInfo}> {booking.clients?.phone} </div>
                                            </td>

                                            <td className={`${tableStyles.cell} ${isSelectedBooking ? "border-t-2 border-red-400" : "" }`}>
                                                {booking.pickup_location}
                                            </td>
                                            <td className={`${tableStyles.cell} ${isSelectedBooking ? "border-t-2 border-red-400" : "" }`}>{booking.destination}</td>
                                            <td className={`${tableStyles.cell} ${isSelectedBooking ? "border-t-2 border-red-400" : "" }`}>{formatShortDate(booking.pickup_date)}</td>
                                            <td className={`${tableStyles.cell} ${isSelectedBooking ? "border-t-2 border-red-400" : "" }`}>{formatShortTime(booking.pickup_time)}</td>
                                            <td className={`${tableStyles.cell} ${isSelectedBooking ? "border-t-2 border-red-400" : "" }`}>Pax:{" "}{booking.passengers}</td>
                                            <td className={`${tableStyles.cell} ${isSelectedBooking ? "border-t-2 border-red-400" : "" }`}>Trip:{" "}{booking.trip_type}</td>
                                            <td className={`${tableStyles.cell} ${isSelectedBooking ? "border-t-2 border-red-400" : "" }`}>LUGG:{" "} {booking.luggage}</td>
                                            <td className={`${tableStyles.cell} ${isSelectedBooking ? "border-t-2 border-red-400" : "" } whitespace-nowrap`}>
                                                <span  className={booking.has_pets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed  } >
                                                    {booking.has_pets  ? "Pet ✓" : "No pet"}
                                                </span>
                                            </td>
                                            <td className={`${tableStyles.cell} ${isSelectedBooking ? "border-r-2 border-t-2 border-red-400" : ""}`}></td>
                                        </tr>
                                        <tr className={`border-b border-cyan-400/10 bg-cyan-950/10 ${isSelectedBooking ? "bg-red-400/10" : "" }`}>
                                            <td colSpan={5}  className={`px-4 pb-4 pt-0 text-sm text-slate-300 ${ isSelectedBooking ? "border-l-2 border-red-400" : "" }`}>
                                                <div className="rounded-xl bg-slate-950/30 px-3 py-2">
                                                    <span className={tableStyles.cellCaptionSecondRow}>Notes: </span>
                                                    <span className= {tableStyles.cellNote}> {booking.notes || "-----"} </span>
                                                </div>
                                            </td>
                                            <td colSpan={5} className={`px-4 pb-4 pt-0 text-sm text-slate-300 ${isSelectedBooking ? "border-r-2 border-red-400" : "" }`}>
                                                {/* Display booking status and assigned chauffeur without editing controls. */}
                                                <div className="flex flex-wrap items-center justify-end gap-4">
                                                    <span className="text-sm text-cyan-300">
                                                        Status: <span className="font-semibold text-white">{booking.status}</span>
                                                    </span>

                                                    <span className="text-sm text-cyan-300">
                                                        Chauffeur: <span className="ml-1 font-semibold text-white"> {booking.chauffeurs?.name ?? "Unassigned"}</span>
                                                    </span>

                                                    <Link href={`/admin/bookings/${booking.id}`} className={formStyles.smallButton}>
                                                        View / Edit Booking
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr className={`border-b border-cyan-400/70 bg-cyan-950/10 ${isSelectedBooking ? "bg-red-400/10" : "" }`}>
                                            <td colSpan={10} className={`px-4 py-3 text-sm text-slate-300 ${isSelectedBooking ? "border-x-2 border-b-2 border-red-400" : "" }`}>
                                                <p className="mb-2 font-meduim text-white">Passenger support:</p>

                                                <div className="flex flex-wrap gap-x-6 gap-y-2">
                                                    <span><strong className="text-cyan-300">Infant seats:</strong> {booking.infant_seat_count_required}</span>
                                                    <span><strong className="text-cyan-300">Child seats:</strong> {booking.child_seat_count_required}</span>
                                                    <span><strong className="text-cyan-300">Booster seats:</strong> {booking.booster_seat_count_required}</span>
                                                    <span><strong className="text-cyan-300">ISOFIX:</strong> {booking.isofix_required ? "Yes" : "No"}</span>
                                                    <span><strong className="text-cyan-300">Wheelchair:</strong> {getWheelchairRequirementLabel(booking.wheelchair_requirement)}</span>

                                                    {booking.wheelchair_requirement === "remain_in_wheelchair" && (
                                                        <span><strong className="text-cyan-300">Wheelchair passengers:</strong> {booking.wheelchair_passenger_count}</span>
                                                    )}

                                                    <span><strong className="text-cyan-300">Mobility-aid storage:</strong> {booking.mobility_aid_storage_required ? "Yes" : "No"}</span>
                                                    <span><strong className="text-cyan-300">Large luggage:</strong> {booking.extra_large_luggage_required ? "Yes" : "No"}</span>
                                                    <span>
                                                        <strong className="text-cyan-300">Assigned vehicle:</strong>{" "}
                                                        {getAssignedVehicleLabel(booking.vehicles)}
                                                    </span>
                                                    <div>
                                                        {/* Copies the complete booking UUID to the clipboard. */}
                                                        <CopyBookingIdButton recordId={booking.id} label="Copy Booking ID" />
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                        </Fragment>
                                    );
                                }
                            )}
                            {bookingRows.length === 0 && (<tr><td className={tableStyles.cellEmpty} colSpan={11}> No bookings found yet. </td></tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}