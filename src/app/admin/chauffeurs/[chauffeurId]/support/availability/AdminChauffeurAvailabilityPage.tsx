import Link from "next/link";
import {notFound} from "next/navigation";
import {requireAdminUser} from "@/lib/auth/requireAdminUser";
import {supabaseAdmin} from "@/lib/supabaseServer";
import {formatShortDate, formatShortTime} from "@/lib/formatDateTime";
import {formStyles, pageStyles, tableStyles} from "@/styles/classNames";
import AdminAddAvailabilityForm from "./AdminAddAvailabilityForm";
import AdminDeleteAvailabilityButton from "./AdminDeleteAvailabilityButton";

/* Defines the chauffeur selected from the Admin Support Dashboard. */
type PageProps = {params: Promise<{chauffeurId: string}>};

/* ============================================================
   ADMIN CHAUFFEUR AVAILABILITY
   Displays availability for one chauffeur.
   Booking-generated periods are identified as protected.
   All modifications will use separately authorized operations.
============================================================ */
export default async function AdminChauffeurAvailabilityPage({params}: PageProps) {
    await requireAdminUser();
    const {chauffeurId} = await params;

    /* Load the selected chauffeur. */
    const {data: chauffeur, error: chauffeurError} = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name")
        .eq("id", chauffeurId)
        .maybeSingle();

    if (chauffeurError) {throw new Error("Could not load chauffeur.");}
    if (!chauffeur) {notFound();}

    /* Retrieve both manual and booking-generated availability periods. */
    const {data: records, error: availabilityError} = await supabaseAdmin
        .from("chauffeur_availability")
        .select("id, available_date, start_time, end_time, status, notes, booking_id")
        .eq("chauffeur_id", chauffeurId)
        .order("available_date", {ascending: true})
        .order("start_time", {ascending: true});

    if (availabilityError) {
        console.error("Could not load chauffeur availability:", availabilityError);
        throw new Error("Could not load availability.");
    }

    /* Load allowed availability statuses from the database enum. */
    const {data: availabilityStatuses, error: statusError} = await supabaseAdmin.rpc(
        "get_enum_values",
        {p_enum_type_name: "availability_status"}
    );

    if (statusError) {
        console.error("Could not load availability statuses:", statusError);
        throw new Error("Could not load availability statuses.");
    }

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href={`/admin/chauffeurs/${chauffeurId}/support`} className={formStyles.link}>
                    {"\u2190"} Back to Support Dashboard
                </Link>

                <h1 className={`${pageStyles.pageTitle} mt-5`}>Chauffeur Availability</h1>
                <p className={pageStyles.pageDescription}>
                    Manage availability for {chauffeur.name}. Booking-generated periods are protected.
                </p>

                {/* Read-only overview. Editing controls will be added after authorization checks. */}
                <section className="mt-6 rounded-xl border border-cyan-700/60 bg-slate-900/70 p-5">
                    <h2 className="mb-4 font-semibold text-cyan-300">
                        Availability records ({records?.length ?? 0})
                    </h2>

                    <div className={tableStyles.tableDiv}>
                        <table className="w-full min-width: 650px text-sm">
                            <thead className={tableStyles.tableHeaderCyan}>
                                <tr>
                                    <th className={tableStyles.cellCaption}>Date</th>
                                    <th className={tableStyles.cellCaption}>Start</th>
                                    <th className={tableStyles.cellCaption}>End</th>
                                    <th className={tableStyles.cellCaption}>Status</th>
                                    <th className={tableStyles.cellCaption}>Source</th>
                                    {/* Actions are available only for manually entered periods. */}
                                    <th className={tableStyles.cellCaption}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(records ?? []).map((record) => (
                                    <tr key={record.id} className="border-b border-white/10">
                                        <td className={tableStyles.cell}>{formatShortDate(record.available_date)}</td>
                                        <td className={tableStyles.cell}>{formatShortTime(record.start_time)}</td>
                                        <td className={tableStyles.cell}>{formatShortTime(record.end_time)}</td>
                                        <td className={tableStyles.cell}>{record.status}</td>
                                        <td className={tableStyles.cell}>
                                            {record.booking_id ? "Booking (protected)" : "Manual"}
                                        </td>
                                        {/* Manual records can be edited or deleted; booking periods remain protected. */}
                                        <td className={tableStyles.cell}>
                                            {!record.booking_id ? (
                                                <div className="flex flex-wrap items-start gap-3">
                                                    <Link href={`/admin/chauffeurs/${chauffeurId}/support/availability/${record.id}`} className={formStyles.link}>
                                                        Edit
                                                    </Link>
                                                    <AdminDeleteAvailabilityButton chauffeurId={chauffeurId} availabilityId={record.id}/>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400">Protected</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {(!records || records.length === 0) && (
                        <p className="mt-4 text-sm text-slate-300">No availability records found.</p>
                    )}
                </section>

                {/* Admin-only form for creating manually managed availability. */}
                <AdminAddAvailabilityForm
                    chauffeurId={chauffeurId}
                    statusOptions={(availabilityStatuses ?? []) as string[]}
                />
            </div>
        </main>
    );
}
