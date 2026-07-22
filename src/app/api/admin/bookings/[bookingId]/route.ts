/*==========================================
    1. Check admin user
    2. Read form body
    3. Validate fields
    4. Check allowed booking status
    5. Check allowed trip type
    6. Load existing booking to get client_id
    7. Update clients table
    8. Update bookings table
    9. Revalidate pages
    10. Return success
=================================================*/
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getVehicleMatchResult, type VehicleWheelchairAccess } from "@/lib/vehicleMatching";
import type { WheelchairRequirement } from "@/types/wheelchairRequirementType";

type RouteContext = {params: Promise<{ bookingId: string; }>;};

export async function PATCH(request: Request, { params }: RouteContext) {
    const {bookingId} = await params;
    const authSupabase = await createClient();
    const {data: {user}} = await authSupabase.auth.getUser();

    if (!user) { return NextResponse.json({ message: "Not logged in." }, { status: 401 });  }

    const { data: profile } = await authSupabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profile?.role !== "admin") {  return NextResponse.json({ message: "Not allowed." }, { status: 403 });  }

    const body = await request.json();
    const clientName = String(body.clientName || "").trim();
    const clientEmail = String(body.clientEmail || "").trim();
    const clientPhone = String(body.clientPhone || "").trim();
    const pickupLocation = String(body.pickupLocation || "").trim();
    const destination = String(body.destination || "").trim();
    const pickupDate = String(body.pickupDate || "").trim();
    const pickupTime = String(body.pickupTime || "").trim();
    const tripType = String(body.tripType || "").trim();
    const notes = String(body.notes || "").trim();
    const status = String(body.status || "").trim();
    const hasPets  =  Boolean(body.hasPets )
    const chauffeurId = String(body.chauffeurId || "").trim();
    const wheelchairRequirement = String(body.wheelchairRequirement || "none").trim();
    const isofixRequired = body.isofixRequired === true;
    const mobilityAidStorageRequired = body.mobilityAidStorageRequired === true;
    const extraLargeLuggageRequired = body.extraLargeLuggageRequired === true;

    const infantSeatCountRequired = Number(body.infantSeatCountRequired || 0);
    const childSeatCountRequired = Number(body.childSeatCountRequired || 0);
    const boosterSeatCountRequired = Number(body.boosterSeatCountRequired || 0);
    const wheelchairPassengerCount = Number(body.wheelchairPassengerCount || 0);

    const passengerCount = Number(body.passengers);
    const luggageCount = Number(body.luggage);
    if (!clientName ||!clientEmail || !clientPhone ||!pickupLocation ||!destination ||!pickupDate ||!pickupTime ||!tripType ||!status) {return NextResponse.json( { message: "Please fill in all required fields." }, { status: 400 }); }
    if (!Number.isInteger(passengerCount) || passengerCount < 1) { return NextResponse.json(  { message: "Passengers must be at least 1." },  { status: 400 });    }
    if (!Number.isInteger(luggageCount) || luggageCount < 0) { return NextResponse.json(  { message: "Luggage cannot be negative." },  { status: 400 });  }

    const requirementCounts = [
        infantSeatCountRequired,
        childSeatCountRequired,
        boosterSeatCountRequired,
        wheelchairPassengerCount,
    ];
    if (requirementCounts.some((countValue) => !Number.isInteger(countValue) || countValue < 0)) {
        return NextResponse.json(
            { message: "Passenger-support quantities must be whole numbers of zero or higher." },
            { status: 400 }
        );
    }

    const { data: allowedStatuses } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "booking_status"  });
    const bookingStatusOptions = (allowedStatuses ?? []) as string[];
    if (!bookingStatusOptions.includes(status)) { return NextResponse.json({ message: "Invalid booking status." }, { status: 400 });  }

    const { data: allowedTripTypes } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "trip_type"});
    const tripTypeOptions = (allowedTripTypes ?? []) as string[];
    if (!tripTypeOptions.includes(tripType)) { return NextResponse.json( { message: "Invalid trip type." }, { status: 400 } );}

    const { data: allowedWheelchairRequirements, error: wheelchairRequirementError } = await supabaseAdmin.rpc("get_enum_values", {p_enum_type_name: "wheelchair_requirement_type", });
    if (wheelchairRequirementError) {
        console.error("Could not load wheelchair requirements:", wheelchairRequirementError);
        return NextResponse.json(
            { message: "Could not validate wheelchair requirement." },
            { status: 500 }
        );
    }

    const wheelchairRequirementOptions = (allowedWheelchairRequirements ?? []) as string[];
        if (!wheelchairRequirementOptions.includes(wheelchairRequirement)) {
            return NextResponse.json(
                { message: "Invalid wheelchair requirement." },
                { status: 400 }
            );
        }

    const wheelchairRequirementInvalid =
        ((wheelchairRequirement === "none" || wheelchairRequirement === "foldable") && wheelchairPassengerCount !== 0) ||
        (wheelchairRequirement === "remain_in_wheelchair" && wheelchairPassengerCount < 1);
    if (wheelchairRequirementInvalid) {
        return NextResponse.json(
            { message: "Remaining in a wheelchair requires at least one wheelchair passenger." },
            { status: 400 }
        );
    }

    /* =========================================================================================
        VALIDATE CHAUFFEUR AND VEHICLE MATCHING

        The selected chauffeur must:
        - exist;
        - have approved status;
        - accept pets when required;
        - have at least one vehicle matching all booking requirements.
    ========================================================================================= */
    if (chauffeurId) {
        const { data: chauffeurRow, error: chauffeurError } = await supabaseAdmin
            .from("chauffeurs")
            .select(`
                id, account_status, accepts_pets,
                vehicles(
                    seats, luggage_capacity,
                    infant_seat_count, child_seat_count, booster_seat_count,
                    isofix_available, wheelchair_access, wheelchair_capacity,
                    mobility_aid_storage, extra_large_luggage ) `)
            .eq("id", chauffeurId)
            .maybeSingle();

        if (chauffeurError) {
            console.error("Could not validate chauffeur:", chauffeurError);
            return NextResponse.json(
                { message: "Could not validate the selected chauffeur." },
                { status: 500 }
            );
        }

        if (!chauffeurRow || chauffeurRow.account_status !== "approved") {
            return NextResponse.json(
                { message: "Only approved chauffeurs can be assigned." },
                { status: 400 }
            );
        }

        if (hasPets && !chauffeurRow.accepts_pets) {
            return NextResponse.json(
                { message: "The selected chauffeur does not accept pets." },
                { status: 400 }
            );
        }

        const hasMatchingVehicle = (chauffeurRow.vehicles ?? []).some((vehicle) =>
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
                {
                    passengers: passengerCount,
                    luggage: luggageCount,
                    infantSeatCountRequired,
                    childSeatCountRequired,
                    boosterSeatCountRequired,
                    isofixRequired,
                    wheelchairRequirement: wheelchairRequirement as WheelchairRequirement,
                    wheelchairPassengerCount,
                    mobilityAidStorageRequired,
                    extraLargeLuggageRequired,
                }
            ).matches
        );

        if (!hasMatchingVehicle) {
            return NextResponse.json(
                { message: "The selected chauffeur has no vehicle matching this booking." },
                { status: 400 }
            );
        }
    }
    /* ============================================================
    UPDATE CLIENT, BOOKING AND BUSY PERIOD
    rpc() calls the PostgreSQL function:  update_booking_admin_details
    The database function updates all related information inside one transaction:

    - client information;
    - booking trip information;
    - chauffeur assignment;
    - booking status;
    - linked chauffeur busy period.

    When one operation fails, PostgreSQL reverses all changes.
    ============================================================ */
    const { error } = await supabaseAdmin.rpc("update_booking_admin_details", {
        p_booking_id: bookingId,

        p_client_name: clientName,
        p_client_email: clientEmail,
        p_client_phone: clientPhone,

        p_pickup_location: pickupLocation,
        p_destination: destination,
        p_pickup_date: pickupDate,
        p_pickup_time: pickupTime,

        p_passengers: passengerCount,
        p_luggage: luggageCount,
        p_trip_type: tripType,
        p_notes: notes || null,
        p_has_pets: hasPets,

        p_infant_seat_count_required: infantSeatCountRequired,
        p_child_seat_count_required: childSeatCountRequired,
        p_booster_seat_count_required: boosterSeatCountRequired,
        p_isofix_required: isofixRequired,
        p_wheelchair_requirement: wheelchairRequirement,
        p_wheelchair_passenger_count: wheelchairPassengerCount,
        p_mobility_aid_storage_required: mobilityAidStorageRequired,
        p_extra_large_luggage_required: extraLargeLuggageRequired,

        p_chauffeur_id: chauffeurId || null,
        p_status: status,
    });

    if (error) {
        console.error("Could not update booking details:", error);

        /* ========================================================
        P0002 means that the supplied booking ID was not found.
        ======================================================== */
        if (error.code === "P0002") {return NextResponse.json(
                { message: "Booking was not found." },
                { status: 404 }
            );
        }

        /* ========================================================
        23505 means that a unique database value already exists.

        In this workflow, this normally means another client is
        already using the submitted email address.
        ======================================================== */
        if (error.code === "23505") { return NextResponse.json(
                { message: "A client with this email already exists." },
                { status: 409 }
            );
        }

        /* ========================================================
        23P01 means that an exclusion constraint was violated.

        Here, the selected chauffeur already has an overlapping
        busy period.
        ======================================================== */
        if (error.code === "23P01") { return NextResponse.json(
                { message: "This chauffeur already has another booking during this time." },
                { status: 409 }
            );
        }

        /* ========================================================
        22023 means that our database function rejected invalid
        assignment information.
        ======================================================== */
        if (error.code === "22023") {
            if (error.message.includes("crosses midnight")) {
                return NextResponse.json(
                    { message: "This journey crosses midnight and cannot yet create a busy period." },
                    { status: 400 }
                );
            }

            return NextResponse.json(
                { message: "Please assign a chauffeur for this booking status." },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { message: "Could not update booking." },
            { status: 500 }
        );
    }

    revalidatePath("/admin/bookings");
    revalidatePath(`/admin/bookings/${bookingId}`);

    return NextResponse.json({message: "Booking updated successfully."});
}