import { NextResponse } from "next/server";
import { type BookingConfirmationRequest } from "@/types/bookingType";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { validateBookingRequest } from "@/lib/bookings/validateBooking";
import type { BookingSummary } from "@/types/bookingSummaryType";
import { sendBookingCreatedEmails } from "@/lib/email/bookingEmailNotifications";
import { calculateRouteEstimate } from "@/lib/mapbox/mapboxRouteService";
import type { MapboxCoordinate } from "@/types/mapboxType";
import { createBookingDataFingerprint } from "@/lib/pricing/createBookingDataFingerprint";

// Validates coordinates received from the browser before sending them to Mapbox.
function isValidMapboxCoordinate(value: unknown): value is MapboxCoordinate {
    if (!value || typeof value !== "object") { return false; }

    const coordinate = value as Partial<MapboxCoordinate>;

    return (
        typeof coordinate.longitude === "number" &&
        typeof coordinate.latitude === "number" &&
        Number.isFinite(coordinate.longitude) &&
        Number.isFinite(coordinate.latitude) &&
        coordinate.longitude >= -180 &&
        coordinate.longitude <= 180 &&
        coordinate.latitude >= -90 &&
        coordinate.latitude <= 90
    );
}

/*
  Validates a privacy-safe city value received from the booking form.

  The browser must send a non-empty city name derived from the
  selected Mapbox location.
  .replace(/\s+/g, " ")
        Changes repeated spaces into one space.

  /[\u0000-\u001F\u007F]/.test(cleanedCity)
        This part checks whether the city contains invisible control characters:
        true  if an invalid control character was found
        false if none was found
*/
function getValidatedCity(value: unknown): string | null {
    if (typeof value !== "string") {return null;}

    const cleanedCity = value.trim().replace(/\s+/g, " ");
    if (
        cleanedCity.length < 1 ||
        cleanedCity.length > 120 ||
        /[\u0000-\u001F\u007F]/.test(cleanedCity)
    ) {
        return null;
    }

    return cleanedCity;
}

export async function POST(request: Request) {
  try 
   {
        const bookingRequest = (await request.json()) as BookingConfirmationRequest;
        const validationResult = validateBookingRequest(bookingRequest);
        /*============================================================
            PURPOSE: REQUIRE A TEMPORARY JOURNEY QUOTE

            A booking can only be confirmed after a temporary quote
            has already been created.

            The browser sends only the quote ID.
            The server will later load and verify the real financial
            quote directly from Supabase.
        */
        if (typeof bookingRequest.journeyQuoteId !== "string" || bookingRequest.journeyQuoteId.trim() === "" )
        {
            return NextResponse.json(
                { message: "A valid journey quote is required." },
                { status: 400 }
            );
        }

        /*=============================================================
            Receive booking request
            Check if booking data is valid using from "@/lib/bookings/validateBooking";
            If invalid → return 400 error
            If valid → continue saving to Supabase
        */
        if (!validationResult.isValid) 
            { return NextResponse.json( { message: validationResult.message}, { status: 400 } ); }

        const clientEmail = bookingRequest.email.trim().toLowerCase();
        const clientName = bookingRequest.name.trim();
        const clientPhone = bookingRequest.phone.trim();
        /*
        Validate the structured city values received from the selected
        Mapbox pickup and destination locations.
        */
        const pickupCity = getValidatedCity(bookingRequest.pickupCity);
        const destinationCity = getValidatedCity(bookingRequest.destinationCity);
        if (!pickupCity || !destinationCity) {
            return NextResponse.json(
                { message:"A valid pickup city and destination city are required.",},
                { status: 400 }
            );
        }

        // Validates the selected Mapbox coordinates received from the booking form.
        if ( !isValidMapboxCoordinate(bookingRequest.pickupCoordinate) || !isValidMapboxCoordinate(bookingRequest.destinationCoordinate)) 
            {return NextResponse.json({ message: "The selected route coordinates are invalid." }, { status: 400 } );}

        /*
            PURPOSE: VERIFY THAT THE QUOTE BELONGS TO THIS JOURNEY
            The browser sends only journeyQuoteId.

            We:
            1. calculate the fingerprint again from the booking coordinates;
            2. load the real quote from Supabase;
            3. compare the stored quote fingerprint with the booking fingerprint.

            The browser cannot decide whether the quote matches.
        */
        const bookingDataFingerprint = createBookingDataFingerprint(
            bookingRequest.pickupCoordinate,
            bookingRequest.destinationCoordinate,
            bookingRequest.date,
            bookingRequest.time
        );
        const { data: journeyQuote, error: journeyQuoteError } = await supabaseAdmin
            .from("journey_quotes")
            .select(`
                quote_id,
                booking_data_fingerprint,
                status,
                expires_at,
                used_at,
                accepted_at
            `)
            .eq("quote_id", bookingRequest.journeyQuoteId)
            .maybeSingle();

        if (journeyQuoteError) {
            console.error("Journey quote lookup error:", journeyQuoteError);

            return NextResponse.json(
                { message: "Could not verify the journey quote." },
                { status: 500 }
            );
        }

        if (!journeyQuote) {
            return NextResponse.json(
                { message: "The journey quote does not exist." },
                { status: 400 }
            );
        }

        if (journeyQuote.booking_data_fingerprint !== bookingDataFingerprint) {
            return NextResponse.json(
                { message: "The journey quote does not match this booking." },
                { status: 400 }
            );
        }

        /*
            PURPOSE: CHECK WHETHER THE QUOTE CAN STILL BE USED

            A quote is usable only when:
            - status is active;
            - it has not expired;
            - it has not already been used;
            - it has not already been accepted.
        */

        if (journeyQuote.status !== "active") {
            return NextResponse.json(
                { message: "The journey quote is no longer active." },
                { status: 400 }
            );
        }

        // Convert the database expiry time and the current server time to comparable numbers.
        // If expiry time is already at or before “now”, reject the quote.
        if (new Date(journeyQuote.expires_at).getTime() <= Date.now()) {
            return NextResponse.json(
                { message: "The journey quote has expired. Please calculate a new price." },
                { status: 400 }
            );
        }

        if (journeyQuote.used_at !== null || journeyQuote.accepted_at !== null) {
            return NextResponse.json(
                { message: "The journey quote has already been used." },
                { status: 400 }
            );
        }

        // Recalculates the route on the server instead of trusting the browser duration.
        let verifiedRouteEstimate;
        try 
        {
            verifiedRouteEstimate = await calculateRouteEstimate( bookingRequest.pickupCoordinate, bookingRequest.destinationCoordinate );
        } 
        catch (routeError) 
        {
            console.error("Server route calculation error:", routeError);
            return NextResponse.json( { message: "Could not verify the selected route." }, { status: 502 } );
        }

        const estimatedDurationMinutes = verifiedRouteEstimate.durationMinutes;
        if (!Number.isInteger(estimatedDurationMinutes) || estimatedDurationMinutes < 15 || estimatedDurationMinutes > 1440 ) {
            return NextResponse.json( { message: "The calculated trip duration is invalid." }, { status: 400 } ); }

        // Converts passenger-support requirements from form text to numbers.
        const infantSeatCountRequired = Number(bookingRequest.infantSeatCountRequired || 0);
        const childSeatCountRequired = Number(bookingRequest.childSeatCountRequired || 0);
        const boosterSeatCountRequired = Number(bookingRequest.boosterSeatCountRequired || 0);
        const wheelchairPassengerCount = Number(bookingRequest.wheelchairPassengerCount || 0);
        const wheelchairRequirement = bookingRequest.wheelchairRequirement;
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

        const allowedWheelchairRequirements = ["none", "foldable", "remain_in_wheelchair"];
        if (!allowedWheelchairRequirements.includes(wheelchairRequirement)) {
            return NextResponse.json({ message: "Invalid wheelchair requirement." }, { status: 400 });
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

        /*
            PURPOSE: CREATE THE BOOKING AND ACCEPT THE QUOTE ATOMICALLY

            PostgreSQL now performs the financially sensitive work.

            Inside one database transaction it:
            - locks the quote;
            - verifies the quote again;
            - creates the booking;
            - links the exact journey quote;
            - marks the quote as accepted.

            If any step fails, PostgreSQL rolls everything back.
        */
        const { data: bookingId, error: bookingTransactionError } = await supabaseAdmin
            .rpc("create_booking_with_accepted_journey_quote", {
                p_client_id: client.id,
                p_journey_quote_id: bookingRequest.journeyQuoteId,
                p_booking_data_fingerprint: bookingDataFingerprint,

                p_pickup_location: bookingRequest.pickup,
                p_pickup_city: pickupCity,
                p_destination: bookingRequest.destination,
                p_destination_city: destinationCity,
                p_pickup_date: bookingRequest.date,
                p_pickup_time: bookingRequest.time,
                p_estimated_duration_minutes: estimatedDurationMinutes,

                p_passengers: Number(bookingRequest.passengers),
                p_luggage: Number(bookingRequest.luggage || 0),
                p_trip_type: bookingRequest.tripType,
                p_notes: bookingRequest.notes,
                p_has_pets: bookingRequest.hasPets,

                p_infant_seat_count_required: infantSeatCountRequired,
                p_child_seat_count_required: childSeatCountRequired,
                p_booster_seat_count_required: boosterSeatCountRequired,
                p_isofix_required: bookingRequest.isofixRequired === true,

                p_wheelchair_requirement: wheelchairRequirement,
                p_wheelchair_passenger_count: wheelchairPassengerCount,
                p_mobility_aid_storage_required: bookingRequest.mobilityAidStorageRequired === true,
                p_extra_large_luggage_required: bookingRequest.extraLargeLuggageRequired === true,
            });

        if (bookingTransactionError || !bookingId) {
            console.error(
                "Atomic booking/quote transaction error:",
                bookingTransactionError
            );

            return NextResponse.json(
                { message: bookingTransactionError?.message || "Could not create booking." },
                { status: 400 }
            );
        }
        /*
            PURPOSE: LOAD THE BOOKING THAT WAS JUST CREATED

            The PostgreSQL transaction returns only the new booking ID.

            The existing API response below needs the complete booking row,
            so we load that booking using the returned UUID.
        */
        const { data: savedBooking, error: bookingLookupError } = await supabaseAdmin
            .from("bookings")
            .select("*")
            .eq("id", bookingId)
            .single();

        if (bookingLookupError || !savedBooking) {
            console.error("Created booking lookup error:", bookingLookupError);

            return NextResponse.json(
                { message: "Booking was created, but its details could not be loaded." },
                { status: 500 }
            );
        }

        console.log("Booking created:", savedBooking.id);

        // Create an object that matches the frontend field names
        const bookingForFrontend: BookingSummary = {
            id: savedBooking.id,

            pickup: savedBooking.pickup_location,
            destination: savedBooking.destination,
            date: savedBooking.pickup_date,
            time: savedBooking.pickup_time,
            estimatedDurationMinutes: Number(savedBooking.estimated_duration_minutes),

            passengers: savedBooking.passengers,
            luggage: savedBooking.luggage,
            hasPets: savedBooking.has_pets,
            
            infantSeatCountRequired: savedBooking.infant_seat_count_required,
            childSeatCountRequired: savedBooking.child_seat_count_required,
            boosterSeatCountRequired: savedBooking.booster_seat_count_required,
            isofixRequired: savedBooking.isofix_required,
            wheelchairRequirement: savedBooking.wheelchair_requirement,
            wheelchairPassengerCount: savedBooking.wheelchair_passenger_count,
            mobilityAidStorageRequired: savedBooking.mobility_aid_storage_required,
            extraLargeLuggageRequired: savedBooking.extra_large_luggage_required,   

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