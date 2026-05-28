import { NextResponse } from "next/server";
import { type BookingRequest } from "@/types/bookingType";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const bookingRequest = (await request.json()) as BookingRequest;

    console.log("Booking request received by API:", bookingRequest);

    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .insert({
        name: bookingRequest.name,
        email: bookingRequest.email,
        phone: bookingRequest.phone,
      })
      .select("id, name, email, phone")
      .single();

    if (clientError || !client) {
      console.error("Client insert error:", clientError);

      return NextResponse.json(
        {
          message: "Could not create client",
        },
        { status: 500 }
      );
    }

    const { data: savedBooking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .insert({
        client_id: client.id,
        chauffeur_id: null,
        pickup_location: bookingRequest.pickup,
        destination: bookingRequest.destination,
        pickup_date: bookingRequest.date,
        pickup_time: bookingRequest.time,
        passengers: Number(bookingRequest.passengers),
        luggage: Number(bookingRequest.luggage || 0),
        trip_type: bookingRequest.tripType,
        notes: bookingRequest.notes,
        status: "pending",
      })
      .select()
      .single();

    if (bookingError || !savedBooking) {
      console.error("Booking insert error:", bookingError);

      return NextResponse.json(
        {
          message: "Could not create booking",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Booking saved successfully",
        booking: bookingRequest,
        savedBooking,
        client,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Invalid booking request:", error);

    return NextResponse.json(
      {
        message: "Invalid booking request",
      },
      { status: 400 }
    );
  }
}