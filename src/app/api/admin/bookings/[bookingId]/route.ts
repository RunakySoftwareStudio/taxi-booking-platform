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
    const pickupLocation = String(body.pickupLocation || "").trim();
    const destination = String(body.destination || "").trim();
    const pickupDate = String(body.pickupDate || "").trim();
    const pickupTime = String(body.pickupTime || "").trim();
    const tripType = String(body.tripType || "").trim();
    const notes = String(body.notes || "").trim();
    const status = String(body.status || "").trim();
    const chauffeurId = String(body.chauffeurId || "").trim();

    const passengerCount = Number(body.passengers);
    const luggageCount = Number(body.luggage);

    if (!pickupLocation ||!destination ||!pickupDate ||!pickupTime ||!tripType ||!status) {return NextResponse.json( { message: "Please fill in all required fields." }, { status: 400 }); }
    if (!Number.isInteger(passengerCount) || passengerCount < 1) { return NextResponse.json(  { message: "Passengers must be at least 1." },  { status: 400 });    }
    if (!Number.isInteger(luggageCount) || luggageCount < 0) { return NextResponse.json(  { message: "Luggage cannot be negative." },  { status: 400 });  }

    const { data: allowedStatuses } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "booking_status"  });
    const bookingStatusOptions = (allowedStatuses ?? []) as string[];

    if (!bookingStatusOptions.includes(status)) {
        return NextResponse.json({ message: "Invalid booking status." }, { status: 400 });  }

    const { data: allowedTripTypes } = await supabaseAdmin.rpc("get_enum_values", { p_enum_type_name: "trip_type"});
    const tripTypeOptions = (allowedTripTypes ?? []) as string[];

    if (!tripTypeOptions.includes(tripType)) {
        return NextResponse.json( { message: "Invalid trip type." }, { status: 400 } );}

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
                chauffeur_id: chauffeurId || null})
        .eq("id", bookingId);

    if (error) {console.error("Could not update booking:", error);
    return NextResponse.json( { message: "Could not update booking." }, { status: 500 } );  }

    revalidatePath("/admin/bookings");
    revalidatePath(`/admin/bookings/${bookingId}`);

    return NextResponse.json({message: "Booking updated successfully."});
}