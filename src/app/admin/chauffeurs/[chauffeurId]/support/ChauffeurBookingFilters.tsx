
import Link from "next/link";
import { formStyles } from "@/styles/classNames";

/* Defines the active booking filters for the selected chauffeur. */
type ChauffeurBookingFiltersProps = {
    chauffeurId: string;
    bookingRefFilter: string;
    bookingStatusFilter: string;
    dateFromFilter: string;
    dateToFilter: string;
};

/* ============================================================
   ADMIN SUPPORT — BOOKING FILTERS
   Filters by booking reference, status and pickup date range.
   Uses GET navigation; never modifies booking records.
============================================================ */
export default function ChauffeurBookingFilters({chauffeurId, bookingRefFilter, bookingStatusFilter, dateFromFilter, dateToFilter}: ChauffeurBookingFiltersProps) {
    const supportUrl = `/admin/chauffeurs/${chauffeurId}/support`;

    return (
        <form key={`${bookingRefFilter}-${bookingStatusFilter}-${dateFromFilter}-${dateToFilter}`} action={supportUrl} method="GET" className="mt-4 flex flex-wrap items-end gap-4">
            {/* Find a booking using its full or partial reference. */}
            <label className="block w-full sm:max-w-48">
                {/* Search assigned bookings by full or partial UUID. */}
                <span className={formStyles.span}>Booking UUID</span>
                <input name="bookingRef" type="text" defaultValue={bookingRefFilter} placeholder="Search reference..." className={formStyles.inputWFullCyan} />
            </label>

            {/* Filter by the booking statuses currently used in the dashboard. */}
            <label className="block w-full sm:max-w-48">
                <span className={formStyles.span}>Booking status</span>
                {/* All six booking statuses, matching the Supabase booking_status enum. */}
                <select name="bookingStatus" defaultValue={bookingStatusFilter} className={formStyles.selectWFull}>
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
            </label>
            
            {/* Inclusive date range: pickup_date >= dateFrom and <= dateTo. */}
            <label className="block w-full sm:max-w-48">
                <span className={formStyles.span}>Pickup date from</span>
                <input name="dateFrom" type="date" defaultValue={dateFromFilter} className={formStyles.inputWFullCyan} />
            </label>
            <label className="block w-full sm:max-w-48">
                <span className={formStyles.span}>Pickup date to</span>
                <input name="dateTo" type="date" defaultValue={dateToFilter} className={formStyles.inputWFullCyan} />
            </label>

            {/* Search applies URL filters; Clear resets the selected chauffeur's view. */}
            <div className="flex items-center gap-3">
                <button type="submit" className={formStyles.smallButton}>Search</button>
                <Link href={supportUrl} className={formStyles.link}>Clear</Link>
            </div>
        </form>
    );
}
