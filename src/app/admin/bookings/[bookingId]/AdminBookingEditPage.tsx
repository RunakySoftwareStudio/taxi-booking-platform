import Link from "next/link";
import { notFound } from "next/navigation";
import AdminBookingEditForm from "@/components/AdminBookingEditForm";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";
import { getVehicleMatchResult, type VehicleWheelchairAccess,} from "@/lib/vehicleMatching";
import type { WheelchairRequirement } from "@/types/wheelchairRequirementType";

export const dynamic = "force-dynamic";

type AdminBookingEditPageProps = { params: Promise<{ bookingId: string; }>;};

export default async function AdminBookingEditPage({ params}: AdminBookingEditPageProps) {  
    const { bookingId } = await params;
    const { data: bookingRow, error } = await supabaseAdmin
        .from("bookings")
        .select(`
                id, pickup_date, pickup_location, destination, pickup_time,
                passengers, luggage, trip_type, notes, status, chauffeur_id, has_pets,
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
            id, brand, model, license_plate,
            seats, luggage_capacity,
            infant_seat_count, child_seat_count, booster_seat_count,
            isofix_available, wheelchair_access, wheelchair_capacity,
            mobility_aid_storage, extra_large_luggage) `)
    .eq("account_status", "approved") //Only return chauffeurs whose account_status is approved.
    .order("name", { ascending: true });
    if (chauffeursError) { console.error("Could not load chauffeurs:", chauffeursError); }

    // Converts the selected booking into the structure required by the matching helper.
    const bookingForMatching = {
        passengers: bookingRow.passengers,
        luggage: bookingRow.luggage ?? 0,
        infantSeatCountRequired: bookingRow.infant_seat_count_required,
        childSeatCountRequired: bookingRow.child_seat_count_required,
        boosterSeatCountRequired: bookingRow.booster_seat_count_required,
        isofixRequired: bookingRow.isofix_required,
        wheelchairRequirement: bookingRow.wheelchair_requirement as WheelchairRequirement,
        wheelchairPassengerCount: bookingRow.wheelchair_passenger_count,
        mobilityAidStorageRequired: bookingRow.mobility_aid_storage_required,
        extraLargeLuggageRequired: bookingRow.extra_large_luggage_required,
    };

    /* =========================================================================================
        FILTER CHAUFFEURS BY PET ACCEPTANCE AND VEHICLE MATCHING

        (chauffeurs ?? [])
        Uses the chauffeur list when it exists.
        When chauffeurs is null or undefined, it uses an empty array instead.

        .filter((chauffeur) => { ... })
        Checks every chauffeur separately.
        The chauffeur remains in matchingChauffeurs only when this function returns TRUE.
        example:
            const values = [1, 2, 3, 4];
            const largerValues = values.filter((value) => value > 2);

        PET CHECK:
        bookingRow.has_pets && !chauffeur.accepts_pets
        This means:
        - the booking includes a pet;
        - the chauffeur does not accept pets.
        When both conditions are true, return FALSE removes that chauffeur.
        
        VEHICLE CHECK:
        (chauffeur.vehicles ?? []).some((vehicle) => ...)
        This checks the chauffeur's vehicles.
        .some() returns TRUE as soon as at least one vehicle matches the booking by getVehicleMatchResult()

        Therefore, a chauffeur remains in the list only when:
        - the chauffeur accepts pets when the booking has pets;
        - at least one of the chauffeur's vehicles satisfies all booking requirements.
    ========================================================================================= */
    const matchingChauffeurs = (chauffeurs ?? []).filter((chauffeur) => {
        if (bookingRow.has_pets && !chauffeur.accepts_pets) { return false; }

        return (chauffeur.vehicles ?? []).some((vehicle) =>
            getVehicleMatchResult(
                {
                    seats: vehicle.seats,
                    luggageCapacity: vehicle.luggage_capacity,
                    infantSeatCount: vehicle.infant_seat_count,
                    childSeatCount: vehicle.child_seat_count,
                    boosterSeatCount: vehicle.booster_seat_count,
                    isofixAvailable: vehicle.isofix_available,
                    wheelchairAccess: vehicle.wheelchair_access as VehicleWheelchairAccess,
                    wheelchairCapacity: vehicle.wheelchair_capacity,
                    mobilityAidStorage: vehicle.mobility_aid_storage,
                    extraLargeLuggage: vehicle.extra_large_luggage,
                },
                bookingForMatching
            ).matches
        );
    });

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

                <AdminBookingEditForm  booking={bookingForEdit} chauffeurs={matchingChauffeurs} bookingStatusOptions={(bookingStatuses ?? []) as string[]} tripTypeOptions={(tripTypes ?? []) as string[]} />            </div>
        </main>
    );
}