import { NextResponse } from "next/server";
import { type BookingRequest } from "@/types/bookingType";

/*
    -- That /api/bookings is our API endpoint.
    -- Make this function available to Next.js.
    -- Next.js looks inside route.ts and searches for exported functions like: GET, POST, PUT, DELETE
    -- async This function can wait for something. This function is allowed to use await inside it.
    -- const bookingRequest = await request.json(); = Reading JSON from the request takes a moment, so we wait for it. This line receives the booking data:
    -- function POST = Run this function when the frontend sends a POST request to this API route.
    -- So this file: src/app/api/bookings/route.ts, creates this API URL: /api/bookings  And this function handles: POST /api/bookings
    -- request.json(): This reads data from the frontend: Client says something
    -- NextResponse.json() : This sends data back to the frontend: API answers back  
*/
export async function POST(request: Request) {
  try 
    {
        const bookingRequest = (await request.json()) as BookingRequest; // 

        console.log("Booking request received by API:", bookingRequest); //This line prints it in the VS Code terminal, not the browser console:

        // This part sends an answer back to the frontend.
        // return = Stop the function here and send something back.
        return NextResponse.json // This creates a JSON response for the frontend. JSON is the common format used between frontend and backend.
        ( 
            {
                message: "Booking request received successfully",
                booking: bookingRequest,
            },
            { status: 201 }
        );
    } 
    catch
    {
        return NextResponse.json( { message: "Invalid booking request", }, { status: 400 });
    }
}