import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/*
  OpenBookingDatabaseRow describes only the privacy-safe booking
  columns selected by this API route.

  It deliberately does not contain:

  - client_id;
  - client name;
  - client email;
  - client phone;
  - notes;
  - exact pickup address;
  - exact destination address.
*/
type OpenBookingDatabaseRow = {
  id: string;
  pickup_city: string | null;
  destination_city: string | null;
  pickup_date: string;
  pickup_time: string;
  estimated_duration_minutes: number | null;
  passengers: number;
  luggage: number;
  trip_type: string;
  has_pets: boolean;
  infant_seat_count_required: number;
  child_seat_count_required: number;
  booster_seat_count_required: number;
  isofix_required: boolean;
  wheelchair_requirement: string;
  wheelchair_passenger_count: number;
  mobility_aid_storage_required: boolean;
  extra_large_luggage_required: boolean;
};

/*
  DefaultVehicleRow contains the small amount of vehicle
  information that may be shown to its own chauffeur.
*/
type DefaultVehicleRow = {
  id: string;
  brand: string;
  model: string;
  license_plate: string;
};

/*
  GET returns privacy-safe open bookings only to a chauffeur who:

  - is authenticated;
  - has role chauffeur;
  - is linked to a chauffeur record;
  - has an approved account;
  - is operationally available;
  - has an available default vehicle.

  The claim PostgreSQL function repeats all important checks
  when the chauffeur actually claims a booking.
*/
export async function GET() {
  try {
    const authSupabase = await createClient();

    /*
      Verify the current Supabase Auth session.
    */
    const {
      data: { user },
      error: userError,
    } = await authSupabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { message: "You must be logged in to view open bookings." },
        { status: 401 }
      );
    }

    /*
      Find the chauffeur linked to the authenticated user.

      We do not accept chauffeurId through the URL or browser.
    */
    const { data: profile, error: profileError } = await authSupabase
      .from("user_profiles")
      .select("role, chauffeur_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      profile.role !== "chauffeur" ||
      !profile.chauffeur_id
    ) {
      return NextResponse.json(
        { message: "Your account is not connected to a chauffeur profile." },
        { status: 403 }
      );
    }

    const chauffeurId = profile.chauffeur_id;

    /*
      Confirm that the chauffeur is currently eligible.

      This is an early page-access check. The claim function
      performs the same authoritative check again later.
    */
    const { data: chauffeur, error: chauffeurError } = await supabaseAdmin
      .from("chauffeurs")
      .select("id, account_status, operational_status")
      .eq("id", chauffeurId)
      .maybeSingle();

    if (chauffeurError || !chauffeur) {
      console.error(
        "Could not load chauffeur eligibility:",
        chauffeurError
      );

      return NextResponse.json(
        { message: "Could not verify your chauffeur account." },
        { status: 500 }
      );
    }

    if (chauffeur.account_status !== "approved") {
      return NextResponse.json(
        { message: "Only an approved chauffeur may view open bookings." },
        { status: 403 }
      );
    }

    if (chauffeur.operational_status !== "available") {
      return NextResponse.json(
        { message:"You must be operationally available to view open bookings.", },
        { status: 403 }
      );
    }

    /*
      Find the chauffeur's available default vehicle.
      A chauffeur without an available default vehicle cannot
      receive open-booking data.
    */
    const { data: defaultVehicle, error: vehicleError } =
      await supabaseAdmin
        .from("vehicles")
        .select("id, brand, model, license_plate")
        .eq("chauffeur_id", chauffeurId)
        .eq("is_default_vehicle", true)
        .eq("vehicle_status", "available")
        .maybeSingle();

    if (vehicleError) {
      console.error(
        "Could not load chauffeur default vehicle:",
        vehicleError
      );

      return NextResponse.json(
        { message: "Could not verify your default vehicle." },
        { status: 500 }
      );
    }

    if (!defaultVehicle) {
      return NextResponse.json(
        {message: "You need an available default vehicle before you can view open bookings.",},
        { status: 409 }
      );
    }

    /*
      Load only pending and completely unassigned bookings.
      Privacy rule:
      This query does not select client_id, notes, clients,
      pickup_location or destination.
    */
    const { data: openBookings, error: bookingsError } =
      await supabaseAdmin
        .from("bookings")
        .select(`
          id,
          pickup_city,
          destination_city,
          pickup_date,
          pickup_time,
          estimated_duration_minutes,
          passengers,
          luggage,
          trip_type,
          has_pets,
          infant_seat_count_required,
          child_seat_count_required,
          booster_seat_count_required,
          isofix_required,
          wheelchair_requirement,
          wheelchair_passenger_count,
          mobility_aid_storage_required,
          extra_large_luggage_required
        `)
        .eq("status", "pending")
        .is("chauffeur_id", null)
        .is("vehicle_id", null)
        .order("pickup_date", { ascending: true })
        .order("pickup_time", { ascending: true });

    if (bookingsError) {
      console.error("Could not load open bookings:", bookingsError);

      return NextResponse.json(
        { message: "Could not load open bookings." },
        { status: 500 }
      );
    }

    const bookingRows = (openBookings ?? []) as OpenBookingDatabaseRow[];
    const vehicleRow = defaultVehicle as DefaultVehicleRow;

    /*
      Convert database snake_case names into frontend-friendly
      camelCase property names.
    */
    return NextResponse.json(
      {
        defaultVehicle: {
          id: vehicleRow.id,
          brand: vehicleRow.brand,
          model: vehicleRow.model,
          licensePlate: vehicleRow.license_plate,
        },

        bookings: bookingRows.map((booking) => ({
          id: booking.id,
          pickupCity: booking.pickup_city,
          destinationCity: booking.destination_city,
          pickupDate: booking.pickup_date,
          pickupTime: booking.pickup_time,
          estimatedDurationMinutes:
            booking.estimated_duration_minutes === null
              ? null
              : Number(booking.estimated_duration_minutes),
          passengers: booking.passengers,
          luggage: booking.luggage,
          tripType: booking.trip_type,
          hasPets: booking.has_pets,
          infantSeatCountRequired: booking.infant_seat_count_required,
          childSeatCountRequired: booking.child_seat_count_required,
          boosterSeatCountRequired: booking.booster_seat_count_required,
          isofixRequired:  booking.isofix_required,
          wheelchairRequirement: booking.wheelchair_requirement,
          wheelchairPassengerCount: booking.wheelchair_passenger_count,
          mobilityAidStorageRequired: booking.mobility_aid_storage_required,
          extraLargeLuggageRequired: booking.extra_large_luggage_required,
        })),
      },
      {
        status: 200,
        headers: {"Cache-Control": "no-store", },
      }
    );
  } catch (error) {
    console.error("Invalid open-bookings request:", error);

    return NextResponse.json(
      { message: "Invalid open-bookings request." },
      { status: 400 }
    );
  }
}