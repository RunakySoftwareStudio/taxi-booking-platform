/* ============================================================
   ADMIN ASSIGNMENT ALERTS PAGE

   Loads all open booking-assignment alerts from Supabase.

   Shows:
   - assignment problem;
   - booking date, time and route;
   - currently assigned chauffeur;
   - currently assigned vehicle;
   - when the problem was first detected;
   - button to review the booking.

   This page does not change or resolve alerts.
============================================================ */

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseServer";

/* Returns one related record whether Supabase provides an object or an array. */
function getRelatedRecord<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] : relation;
}

/* Loads and returns the admin assignment-alert page. */
export default async function AdminAssignmentAlertsPage() {
  /* Loads all open alerts and their related booking information. */
  const { data: alerts, error } = await supabaseAdmin
    .from("assignment_alerts")
    .select(`
      id,
      booking_id,
      issue_summary,
      issue_details,
      first_detected_at,
      bookings (
        status, pickup_date,  pickup_time, pickup_location,  destination,
        chauffeurs (name),
        vehicles (license_plate, brand, model) )
    `)
    .eq("alert_status", "open")
    .order("first_detected_at", { ascending: true });

  /* Logs a database error without crashing the complete admin page. */
  if (error) { console.error("Could not load assignment alerts:", error);  }

  /* Returns an empty array when Supabase does not return alert data. */
  const openAlerts = alerts ?? [];

  /* Returns the complete assignment-alert page. */
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">

      <div className="mx-auto max-w-7xl">
        {/* Returns the administrator to the main admin dashboard. */}
        <Link href="/admin" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200" >
          <span aria-hidden="true">{"\u2190"}</span>  Back to Admin
        </Link>
        {/* Returns the page title and explanation. */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-red-200">  Assignment alerts </h1>
          <p className="mt-2 text-sm text-slate-400"> These bookings require a new chauffeur or vehicle assignment. </p>
        </header>

        {/* Returns the list of open assignment alerts. */}
        <div className="space-y-4">
            {openAlerts.map((alert) => {
                /* Stores the related booking, chauffeur and vehicle records. */
                const booking = getRelatedRecord(alert.bookings);
                const chauffeur = getRelatedRecord(booking?.chauffeurs ?? null);
                const vehicle = getRelatedRecord(booking?.vehicles ?? null);

                /* Returns one assignment-alert card. */
                return (
                    <article key={alert.id}  className="rounded-lg border border-red-400/30 bg-slate-900 p-4"  >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            {/* Returns the assignment and booking information. */}
                            <div>
                                <p className="font-semibold text-red-200"> {alert.issue_summary} </p>
                                <p className="mt-2 text-sm text-slate-300"> Date:{" "} {booking?.pickup_date} at {booking?.pickup_time} </p>
                                <p className="mt-1 text-sm text-slate-400"> Destination:{" "} {booking?.destination} {" \u2192 "}  {booking?.destination} </p>
                                <p className="mt-1 text-sm text-slate-400"> Pickup:{" "} {booking?.pickup_location} {" \u2192 "}  {booking?.pickup_location} </p>
                                <p className="mt-2 text-sm text-slate-400"> Chauffeur:{" "} {chauffeur?.name ?? "\u2014"}  </p>
                                <p className="text-sm text-slate-400"> Vehicle:{" "} {vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.license_plate})` : "\u2014"} </p>
                                <p className="mt-2 text-xs text-slate-500"> First detected:{" "} {new Date(alert.first_detected_at).toLocaleString()} </p>
                            </div>

                            {/* Returns a link to the exact affected booking. 
                            The two parts have separate purposes:
                                ?bookingId=...
                                    tells React which booking to highlight.
                                #booking-...
                                    tells the browser which HTML element to scroll to.
                            */}
                            <Link  href={`/admin/bookings?bookingId=${alert.booking_id}#booking-${alert.booking_id}`}
                                className="inline-flex h-10 items-center justify-center rounded-md bg-yellow-400 px-4 text-sm font-semibold text-slate-950 hover:bg-yellow-300" >
                                Review booking
                            </Link>
                        </div>
                    </article> );
                })
            }
        </div>
      </div>
    </main>
  );
}