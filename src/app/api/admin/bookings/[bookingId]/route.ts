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

    const { data: existingBooking, error: existingBookingError } =
        await supabaseAdmin
            .from("bookings")
            .select("client_id")
            .eq("id", bookingId)
            .single();

    if (existingBookingError || !existingBooking) { 
        console.error("Could not load booking before update:", existingBookingError);       
        return NextResponse.json( { message: "Booking was not found." }, { status: 404 });
    }

    const { error: clientUpdateError } = await supabaseAdmin
        .from("clients")
        .update({name: clientName, email: clientEmail, phone: clientPhone,})
        .eq("id", existingBooking.client_id);

    if (clientUpdateError) { 
        console.error("Could not update client:", clientUpdateError);
        if (clientUpdateError.code === "23505") {return NextResponse.json({ message: "A client with this email already exists." }, { status: 409 } ); }
        return NextResponse.json( { message: "Could not update client information." }, { status: 500 });
    }

    const { error } = await supabaseAdmin
        .from("bookings")
        .update({
                pickup_location: pickupLocation,
                destination,
                pickup_date: pickupDate,
                pickup_time: pickupTime,
                passengers: passengerCount,
                luggage: luggageCount,
                trip_type: tripType,
                notes: notes || null,
                status,
                has_pets:hasPets,
                chauffeur_id: chauffeurId || null})
        .eq("id", bookingId);

    if (error) {console.error("Could not update booking:", error);
    return NextResponse.json( { message: "Could not update booking." }, { status: 500 } );  }

    revalidatePath("/admin/bookings");
    revalidatePath(`/admin/bookings/${bookingId}`);

    return NextResponse.json({message: "Booking updated successfully."});
}