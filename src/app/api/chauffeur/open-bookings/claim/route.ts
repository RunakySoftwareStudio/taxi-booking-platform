import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/*
  ClaimBookingRequest describes the only value accepted
  from the browser.

  The browser does not send chauffeur_id, vehicle_id or status.
*/
type ClaimBookingRequest = {
  bookingId?: unknown;
};

/*
  ClaimBookingRow describes the technical result returned by
  public.claim_open_booking(...).
*/
type ClaimBookingRow = {
  claimed_booking_id: string;
  claimed_chauffeur_id: string;
  claimed_vehicle_id: string;
  claimed_status: string;
};

/*
  UUID_PATTERN performs a basic booking-ID format check before
  calling PostgreSQL.
*/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/*
  getClaimErrorStatus converts PostgreSQL error codes into
  suitable HTTP response statuses.
*/
function getClaimErrorStatus(errorCode: string | undefined) {
  if (errorCode === "42501") {return 403; }
  if (errorCode === "P0002") {return 404;}
  if (errorCode === "P0001") {return 409;}
  if (errorCode === "22023") {return 400;}

  return 500;
}

/*
  POST securely claims one open booking for the currently
  authenticated chauffeur.

  The database determines:
  - the chauffeur;
  - the chauffeur's default vehicle;
  - whether the chauffeur is eligible;
  - whether the vehicle matches;
  - whether the booking is still available.
*/
export async function POST(request: Request) {
  try {
    const authSupabase = await createClient();

    /*
      getUser verifies the session with Supabase Auth instead
      of trusting browser-provided user information.
    */
    const {
      data: { user },
      error: userError,
    } = await authSupabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { message: "You must be logged in to claim a booking." },
        { status: 401 }
      );
    }

    /*
      Read and validate the only browser-provided value.
    */
    const requestBody = (await request.json()) as ClaimBookingRequest;

    const bookingId =
      typeof requestBody.bookingId === "string"
        ? requestBody.bookingId.trim()
        : "";

    if (!UUID_PATTERN.test(bookingId)) {
      return NextResponse.json(
        { message: "A valid booking ID is required." },
        { status: 400 }
      );
    }

    /*
      This RPC runs with the logged-in user's Supabase session.

      Do not replace authSupabase with supabaseAdmin here,
      because the SQL function uses auth.uid().
    */
    const { data: claimRows, error: claimError } =
      await authSupabase.rpc("claim_open_booking", {
        p_booking_id: bookingId,
      });

    if (claimError) {
      const responseStatus = getClaimErrorStatus(claimError.code);

      console.error("Could not claim open booking:", {
        bookingId,
        code: claimError.code,
        message: claimError.message,
      });

      return NextResponse.json(
        {
          message:
            responseStatus === 500
              ? "Could not claim the booking."
              : claimError.message,
        },
        { status: responseStatus }
      );
    }

    /*
      A PostgreSQL function returning TABLE is returned by
      Supabase as an array. A successful claim contains one row.
    */
    const claimResult = Array.isArray(claimRows)
      ? (claimRows[0] as ClaimBookingRow | undefined)
      : undefined;

    if (!claimResult) {
      return NextResponse.json(
        { message: "The claim completed without returning a result." },
        { status: 500 }
      );
    }

    /*
      Return only technical assignment information.
      No client contact information or booking notes are returned.
    */
    return NextResponse.json(
      {
        message: "Booking claimed successfully.",
        claim: {
          bookingId: claimResult.claimed_booking_id,
          chauffeurId: claimResult.claimed_chauffeur_id,
          vehicleId: claimResult.claimed_vehicle_id,
          status: claimResult.claimed_status,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Invalid open-booking claim request:", error);

    return NextResponse.json(
      { message: "Invalid claim request." },
      { status: 400 }
    );
  }
}