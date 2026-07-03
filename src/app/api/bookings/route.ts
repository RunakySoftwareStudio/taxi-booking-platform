import { NextResponse } from "next/server";
import { type BookingRequest } from "@/types/bookingType";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { validateBookingRequest } from "@/lib/bookings/validateBooking";
import type { BookingSummary } from "@/types/bookingSummaryType";
import { sendBookingCreatedEmails } from "@/lib/email/bookingEmailNotifications";

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
        /*========================================
        Normal case:
        No client exists → create new client → continue booking

        Rare double-submit case: Two bookings with same new email arrive at almost the same time.
        Client insert fails because email already exists → search client again → continue booking
        =========================================*/
        if (!client) 
        {
            const { data: newClient, error: clientError } = await supabaseAdmin
                .from("clients")
                .insert({ name: clientName, email: clientEmail, phone: clientPhone })
                .select("id, name, email, phone")
                .single();

            if (clientError) 
            {
                // 23505 means duplicate value error.
                // This can happen if two booking requests with the same new email arrive at almost the same time.
                if (clientError.code === "23505") 
                {
                    const { data: retryClients, error: retryClientError } = await supabaseAdmin
                        .from("clients")
                        .select("id, name, email, phone")
                        .eq("email", clientEmail)
                        .limit(1);
            if (retryClientError || !retryClients?.[0]) 
                {
                    console.error("Client retry search error:", retryClientError);
                    return NextResponse.json(
                        { message: "Could not find existing client after duplicate email check" },
                        { status: 500 }
                    );
                }
                client = retryClients[0];
            } 
            else 
            {
                console.error("Client insert error:", clientError);
                return NextResponse.json(
                    { message: "Could not create client" },
                    { status: 500 }
                );
            }
        } 
        else if (!newClient) 
            {return NextResponse.json( { message: "Could not create client" },  { status: 500 } );  } 
            else  { client = newClient; }
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
                has_pets: bookingRequest.hasPets,
            })
            .select()
            .single();

        if (bookingError || !savedBooking) {
            console.error("Booking insert error:", bookingError);
            return NextResponse.json( { message: "Could not create booking", }, { status: 500 } );
        }
        console.log("Booking created:", savedBooking.id);

        // Create an object that matches the frontend field names
        const bookingForFrontend: BookingSummary = {
            id: savedBooking.id,

            pickup: savedBooking.pickup_location,
            destination: savedBooking.destination,
            date: savedBooking.pickup_date,
            time: savedBooking.pickup_time,

            passengers: savedBooking.passengers,
            luggage: savedBooking.luggage,
            hasPets: savedBooking.has_pets,
                
            name: client.name,
            phone: client.phone,
            email: client.email,

            tripType: savedBooking.trip_type,
            notes: savedBooking.notes,
            status: savedBooking.status,
        };
        
        /*====================================
            Booking saved successfully
            Email failed
            Booking still works
            Error is only logged
        ========================================*/
        try {
            const emailResults = await sendBookingCreatedEmails({
                id: savedBooking.id,
                name: client.name,
                email: client.email,
                phone: client.phone,
                pickup: savedBooking.pickup_location,
                destination: savedBooking.destination,
                date: savedBooking.pickup_date,
                time: savedBooking.pickup_time,
                passengers: String(savedBooking.passengers),
                luggage: String(savedBooking.luggage),
                tripType: savedBooking.trip_type,
                status: savedBooking.status,
                hasPets: savedBooking.has_pets,
                notes: savedBooking.notes || "",
            });
            
            /*This still tells us whether email worked, but it does not log client name, phone, email, pickup, or destination. */
            console.log("Booking email notifications processed:", {
                bookingId: savedBooking.id,
                clientEmailSuccess: emailResults.clientEmail.success,
                clientEmailSkipped: emailResults.clientEmail.skipped,
                adminEmailSuccess: emailResults.adminEmail.success,
                adminEmailSkipped: emailResults.adminEmail.skipped,
            });
        } 
        catch (emailError) 
        { console.error("Booking email notification error:", emailError);  }

        //// This sends JSON back to the frontend.
        return NextResponse.json    
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