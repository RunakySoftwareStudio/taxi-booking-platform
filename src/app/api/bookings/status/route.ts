import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

type BookingStatusRequest = {
  bookingId: string;
  email: string;
};

type BookingRow = {
  id: string;
  client_id: string;
  chauffeur_id: string | null;
  pickup_location: string;
  destination: string;
  pickup_date: string;
  pickup_time: string;
  passengers: number;
  luggage: number | null;
  trip_type: string;
  notes: string | null;
  status: string;
  has_pets:boolean;
};

export async function POST(request: Request) {
  try {
    const statusRequest = (await request.json()) as BookingStatusRequest;

    const bookingId = statusRequest.bookingId.trim();
    const clientEmail = statusRequest.email.trim().toLowerCase();

    if (!bookingId || !clientEmail) {
      return NextResponse.json(
        { message: "Booking id and email are required." },
        { status: 400 }
      );
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        client_id,
        chauffeur_id,
        pickup_location,
        destination,
        pickup_date,
        pickup_time,
        passengers,
        luggage,
        trip_type,
        notes,
        status,
        has_pets
      `
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
        console.error("Booking lookup error:", bookingError);

        return NextResponse.json(
          { message: "Booking not found." },
          { status: 404 }
        );
    }

    const bookingRow = booking as BookingRow;

    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("name, email, phone")
      .eq("id", bookingRow.client_id)
      .maybeSingle();

    if (clientError || !client) {
      console.error("Client lookup error:", clientError);

      return NextResponse.json(
        { message: "Booking not found." },
        { status: 404 }
      );
    }

    if (client.email.trim().toLowerCase() !== clientEmail) {
      return NextResponse.json(
        { message: "Booking not found." },
        { status: 404 }
      );
    }

    let chauffeur = null;

if (bookingRow.chauffeur_id) {
      console.log("Booking chauffeur_id:", bookingRow.chauffeur_id);

      const { data: chauffeurRows, error: chauffeurError } = await supabaseAdmin
        .from("chauffeurs")
        .select("id, name, email, phone")
        .eq("id", bookingRow.chauffeur_id)
        .limit(1);

      console.log("Chauffeur lookup rows:", chauffeurRows); // this error you can see in Visual Code Code terminal output
      console.log("Chauffeur lookup error:", chauffeurError);

      if (chauffeurError) {
        console.error("Chauffeur lookup error:", chauffeurError);
      }

      chauffeur = chauffeurRows?.[0] ?? null;
  }

    return NextResponse.json(
      {
        message: "Booking found.",
        booking: {
          ...bookingRow,
          clients: client,
          chauffeurs: chauffeur,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Invalid booking status request:", error);

    return NextResponse.json(
      { message: "Invalid booking status request." },
      { status: 400 }
    );
  }
}