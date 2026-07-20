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

    const passengerCount = Number(body.passengers);
    const luggageCount = Number(body.luggage);

    if (!clientName ||!clientEmail || !clientPhone ||!pickupLocation ||!destination ||!pickupDate ||!pickupTime ||!tripType ||!status) {return NextResponse.json( { message: "Please fill in all required fields." }, { status: 400 }); }
    if (!Number.isInteger(passengerCount) || passengerCount < 1) { return NextResponse.json(  { message: "Passengers must be at least 1." },  { status: 400 });    }
    if (!Number.isInteger(luggageCount) || luggageCount < 0) { return NextResponse.json(  { message: "Luggage cannot be negative." },  { status: 400 });  }

    const { data: allowedStatuses } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "booking_status"  });
    const bookingStatusOptions = (allowedStatuses ?? []) as string[];

    if (!bookingStatusOptions.includes(status)) {
        return NextResponse.json({ message: "Invalid booking status." }, { status: 400 });  }

    const { data: allowedTripTypes } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "trip_type"});
    const tripTypeOptions = (allowedTripTypes ?? []) as string[];

    if (!tripTypeOptions.includes(tripType)) { return NextResponse.json( { message: "Invalid trip type." }, { status: 400 } );}

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
    const { error } = await supabaseAdmin.rpc(
        "update_booking_admin_details",
        {
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

            p_chauffeur_id: chauffeurId || null,
            p_status: status,
        }
    );

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