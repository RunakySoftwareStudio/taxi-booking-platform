import Link from "next/link";
import { pageStyles, formStyles } from "@/styles/classNames";
import { supabaseAdmin } from "@/lib/supabaseServer";
import GenerateCommissionButton from "./GenerateCommissionButton";
/*
    AdminCommissionsPage

    Displays the chauffeur commission management overview.
    Financial records and actions will be added in later steps.

    Access is protected by the existing Admin layout.
*/
export default async function AdminCommissionsPage() {
    /*
        Load completed, financially included bookings.
        This is a read-only overview. Commission generation will be handled separately through a protected action.
    */
    const { data: bookings, error: bookingsError } = await supabaseAdmin
        .from("bookings")
        .select(`
            id,
            completed_at,
            chauffeur_id,
            journey_quote_id,
            journey_quotes!bookings_journey_quote_fk (basic_fare_excluding_vat, currency_code),
            chauffeur_booking_commissions (id, commission_amount, applied_percentage, currency_code)
        `)
        .eq("status", "completed")
        .eq("is_financially_excluded", false)
        .order("completed_at", { ascending: false });

    if (bookingsError) {
        console.error("Could not load chauffeur commissions:", bookingsError);
    }
    /*
        Load read-only commission previews.
        Existing generated commissions are excluded because their stored historical financial values must be used.

        The .filter() method keeps only elements for which the callback returns true. Therefore:
        - Booking without a commission → included
        - Booking with an existing commission → excluded
    */
    const commissionPreviews = await Promise.all(
        (bookings ?? [])
            .filter((booking) => !booking.chauffeur_booking_commissions?.length) //Calculate previews only for bookings that do not already have frozen commission records.
            .map(async (booking) => {
                const { data, error } = await supabaseAdmin.rpc("calculate_chauffeur_booking_commission", { p_booking_id: booking.id });

                if (error) {console.error("Could not calculate commission preview:", booking.id, error); }

                return {
                    bookingId: booking.id,
                    preview: error ? null : data?.[0] ?? null,
                };
            })
    );

    /* Testing: Temporarily inspect the actual Supabase relationship response testing. */
    /*============================================================
        console.log(
            "Commission overview quote data:",
            JSON.stringify(bookings?.[0]?.journey_quotes, null, 2)
        );
     ====================================================== */
    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                {/* Navigation back to financial settings. */}
                <Link href="/admin/financial-settings" className={formStyles.link}>
                    ← Back to Financial Settings
                </Link>

                {/* Commission overview heading. */}
                <h1 className="mt-6 text-2xl font-bold text-white">
                    Chauffeur Commissions
                </h1>

                <p className="mt-2 text-slate-300">
                    Review completed journeys, track chauffeur service fees, and manage commission generation.
                </p>

                {/* Placeholder for the upcoming commission records. */}
                <section className="mt-8 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">
                        Commission Overview
                    </h2>

                    {/* Display completed bookings and their commission status. */}
                    <div className="mt-4 overflow-x-auto">
                        {bookingsError
                            ? ( <p className="text-sm text-red-300"> Unable to load chauffeur commissions.</p>)
                            : !bookings || bookings.length === 0
                                ? ( <p className="text-sm text-slate-400">No financially eligible completed bookings found. </p>)
                                : (
                                    <table className="w-full text-left text-sm">
                                        <thead className="border-b border-slate-700 text-slate-300">
                                            <tr>
                                                <th className="px-3 py-3">Booking</th>
                                                <th className="px-3 py-3">Completed</th>
                                                <th className="px-3 py-3">Journey Excl. VAT</th>
                                                <th className="px-3 py-3">Applied Rate</th>
                                                <th className="px-3 py-3">Commission</th>
                                                <th className="px-3 py-3">Status</th>
                                                <th className="px-3 py-3">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bookings.map((booking) => {
                                                const commission = booking.chauffeur_booking_commissions?.[0];

                                                /* Find the read-only commission preview for this booking. */
                                                const preview = commissionPreviews.find((item) => item.bookingId === booking.id)?.preview;

                                                /* Normalize the quote relationship to a single object. */
                                                const quote = Array.isArray(booking.journey_quotes)
                                                    ? booking.journey_quotes[0]
                                                    : booking.journey_quotes;
                                                return (
                                                    <tr key={booking.id} className="border-b border-slate-800 text-slate-200">
                                                        <td className="px-3 py-3">
                                                            <Link href={`/admin/bookings/${booking.id}`} className="text-cyan-400 hover:underline">
                                                                {booking.id.slice(0, 8)}
                                                            </Link>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            {booking.completed_at
                                                                ? new Date(booking.completed_at).toLocaleString("nl-NL", {timeZone: "Europe/Amsterdam",})
                                                                : "—"
                                                            }
                                                        </td>
                                                        {/* Journey amount excluding passenger VAT. */}
                                                        <td className="px-3 py-3">
                                                            {quote
                                                                ? `${quote.currency_code} ${Number(quote.basic_fare_excluding_vat).toFixed(2)}`
                                                                : "—"
                                                            }
                                                        </td>
                                                        {/* Display the frozen rate or the estimated historical rate. */}
                                                        <td className="px-3 py-3">
                                                            {commission
                                                                ? (<span className="text-green-400"> {Number(commission.applied_percentage).toFixed(2)}% </span>)
                                                                : preview
                                                                    ? (
                                                                        <span className="text-amber-400">
                                                                            {Number(preview.applied_percentage).toFixed(2)}%
                                                                            <span className="ml-2 text-xs text-slate-400">(Estimated)</span>
                                                                        </span>
                                                                        )
                                                                    : (<span className="text-slate-400">—</span>)
                                                            }
                                                        </td>
                                                        {/* Display frozen commission or estimated commission. */}
                                                        <td className="px-3 py-3">
                                                            {commission
                                                                ? (
                                                                        <span className="text-green-400">
                                                                            {commission.currency_code} {Number(commission.commission_amount).toFixed(2)}
                                                                        </span>
                                                                    )
                                                                : preview
                                                                    ? (
                                                                            <span className="text-amber-400">
                                                                                {preview.currency_code} {Number(preview.commission_amount).toFixed(2)}
                                                                                <span className="ml-2 text-xs text-slate-400">(Estimated)</span>
                                                                            </span>
                                                                        )
                                                                    : (<span className="text-slate-400">—</span>)
                                                            }
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <span className={commission ? "text-green-400" : "text-amber-400"}>
                                                                {commission ? "Generated" : "Not generated"}
                                                            </span>
                                                        </td>
                                                        {/* Commission generation remains disabled until final workflow testing. */}
                                                        <td className="px-3 py-3">
                                                            {!commission && preview
                                                                ? (<GenerateCommissionButton bookingId={booking.id}/>)
                                                                : (<span className="text-slate-500">—</span>)
                                                            }
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )
                        }
                    </div>
                </section>
            </div>
        </main>
    );
}