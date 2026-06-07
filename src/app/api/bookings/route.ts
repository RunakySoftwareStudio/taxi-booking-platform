import { NextResponse } from "next/server";
import { type BookingRequest } from "@/types/bookingType";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { validateBookingRequest } from "@/lib/bookings/validateBooking";
import type { BookingSummary } from "@/types/bookingSummaryType";

export async function POST(request: Request) {
  try 
   {
        const bookingRequest = (await request.json()) as BookingRequest;
        const validationResult = validateBookingRequest(bookingRequest);
        /*=============================================================
            Receive booking request
            Check if booking data is valid using from "@/lib/bookings/validateBooking";
            If invalid → return 400 error
            If valid → continue saving to Supabase
        */
        if (!validationResult.isValid) { return NextResponse.json( { message: validationResult.message}, { status: 400 } ); }

        console.log("Booking request received by API:", bookingRequest);

        const clientEmail = bookingRequest.email.trim().toLowerCase();
        const clientName = bookingRequest.name.trim();
        const clientPhone = bookingRequest.phone.trim();

        const { data: existingClients, error: findClientError } = await supabaseAdmin
            .from("clients")
            .select("id, name, email, phone")
            .eq("email", clientEmail)
            .limit(1);

        if (findClientError) 
        {
            console.error("Client search error:", findClientError);
            return NextResponse.json( { message: "Could not search client", }, { status: 500 });
        }

        let client = existingClients?.[0];  // If existingClients exists, get the first item.
                                            // If existingClients is null or undefined, do not crash.

        if (!client) 
        {
            const { data: newClient, error: clientError } = await supabaseAdmin
                .from("clients")
                .insert({ name: clientName, email: clientEmail, phone: clientPhone, })
                .select("id, name, email, phone")
                .single();

                if (clientError || !newClient) { 
                    console.error("Client insert error:", clientError);
                    return NextResponse.json( { message: "Could not create client"}, { status: 500 } ); 
                }

            client = newClient;
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
            return NextResponse.json( { message: "Could not create booking", }, { status: 500 } );
        }

        // Create an object that matches the frontend field names
        const bookingForFrontend: BookingSummary = {
            id: savedBooking.id,

            pickup: savedBooking.pickup_location,
            destination: savedBooking.destination,
            date: savedBooking.pickup_date,
            time: savedBooking.pickup_time,

            passengers: savedBooking.passengers,
            luggage: savedBooking.luggage,

            name: client.name,
            phone: client.phone,
            email: client.email,

            tripType: savedBooking.trip_type,
            notes: savedBooking.notes,
            status: savedBooking.status,
        };

        return NextResponse.json    //// This sends JSON back to the frontend.
        (
            {
                message: "Booking saved successfully",
                booking: bookingForFrontend,
                client
            },
            { status: 201 }
        );
    } 
    catch (error) 
    { 
        console.error("Invalid booking request:", error);
        return NextResponse.json( { message: "Invalid booking request", }, { status: 400 } );
    }
}