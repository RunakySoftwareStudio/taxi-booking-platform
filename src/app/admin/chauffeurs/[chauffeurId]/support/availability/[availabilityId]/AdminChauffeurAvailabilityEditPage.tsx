import Link from "next/link";
import {notFound} from "next/navigation";
import {requireAdminUser} from "@/lib/auth/requireAdminUser";
import {supabaseAdmin} from "@/lib/supabaseServer";
import {formStyles, pageStyles} from "@/styles/classNames";
import AdminAvailabilityEditForm from "./AdminAvailabilityEditForm";

/* Identifies the chauffeur and availability record being edited. */
type PageProps = {params: Promise<{chauffeurId: string; availabilityId: string}>};

/* ============================================================
   ADMIN CHAUFFEUR AVAILABILITY EDIT PAGE
   Loads one manually entered availability record.
   Booking-generated periods cannot be edited.
============================================================ */
export default async function AdminChauffeurAvailabilityEditPage({params}: PageProps) {
    await requireAdminUser();
    const {chauffeurId, availabilityId} = await params;

    /* Load the selected chauffeur. */
    const {data: chauffeur, error: chauffeurError} = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name")
        .eq("id", chauffeurId)
        .maybeSingle();

    if (chauffeurError) {throw new Error("Could not load chauffeur.");}
    if (!chauffeur) {notFound();}

    /* Retrieve only manual availability records belonging to this chauffeur. */
    const {data: availability, error: availabilityError} = await supabaseAdmin
        .from("chauffeur_availability")
        .select("id, chauffeur_id, available_date, start_time, end_time, status, notes, booking_id")
        .eq("id", availabilityId)
        .eq("chauffeur_id", chauffeurId)
        .is("booking_id", null)
        .maybeSingle();

    if (availabilityError) {throw new Error("Could not load availability.");}
    if (!availability) {notFound();}

    /* Load valid availability statuses from the database enum. */
    const {data: statuses, error: statusError} = await supabaseAdmin.rpc(
        "get_enum_values", {p_enum_type_name: "availability_status"}
    );

    if (statusError) {throw new Error("Could not load availability statuses.");}

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.containerMedium}>
                <Link href={`/admin/chauffeurs/${chauffeurId}/support/availability`} className={formStyles.link}>
                    {"\u2190"} Back to Availability
                </Link>

                <h1 className={`${pageStyles.pageTitle} mt-5`}>Edit Chauffeur Availability</h1>
                <p className={pageStyles.pageDescription}>
                    Update manual availability for {chauffeur.name}. An administrative reason is required.
                </p>

                {/* Form submits through the protected, audited Admin Update action. */}
                <AdminAvailabilityEditForm chauffeurId={chauffeurId} availability={availability} statusOptions={(statuses ?? []) as string[]}/>
            </div>
        </main>
    );
}
