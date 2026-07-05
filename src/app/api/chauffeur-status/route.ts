import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

/**
 * ChauffeurStatusRequest
 *
 * This type describes the data sent from the public status form.
 * The chauffeur must provide both registrationId and email.
 */
type ChauffeurStatusRequest = {
  registrationId: string;
  email: string;
};

/**
 * ChauffeurStatusRow
 *
 * This type describes the chauffeur fields we read from Supabase.
 */
type ChauffeurStatusRow = {
    id: string;
    name: string;
    email: string;
    phone: string;
    company_name: string | null;
    license_number: string | null;
    service_area: string | null;
    accepts_pets: boolean;
    account_status: string;
    created_at: string;
};

/**
 * normalizeText
 *
 * Removes spaces before and after a text value.
 * If the value is not text, it returns an empty string.
 */
function normalizeText(inputValue: unknown) {
  if (typeof inputValue !== "string") {return ""; }
  return inputValue.trim();
}

/**
 * normalizeEmail
 *
 * Cleans the email and converts it to lowercase.
 * This makes the email check safer.
 */
function normalizeEmail(inputValue: unknown) {  
    return normalizeText(inputValue).toLowerCase();
}

/**
 * POST /api/chauffeur-status
 *
 * This API checks the status of a chauffeur registration.
 *
 * It does these steps:
 * 1. Reads registrationId and email from the request
 * 2. Validates that both values are provided
 * 3. Looks up the chauffeur by registration ID
 * 4. Checks if the email matches
 * 5. Returns the chauffeur registration status
 */
export async function POST(request: Request) {
  try {
    const statusRequest = (await request.json()) as ChauffeurStatusRequest;
    const registrationId = normalizeText(statusRequest.registrationId);
    const email = normalizeEmail(statusRequest.email);

    if (!registrationId || !email) {
      return NextResponse.json(
        { message: "Registration ID and email are required." },
        { status: 400 }
      );
    }

    const { data: chauffeur, error: chauffeurError } = await supabaseAdmin
      .from("chauffeurs")
      .select( ` id, name, email,
        phone, company_name, license_number,
        service_area, accepts_pets,
        account_status, created_at ` )
      .eq("id", registrationId)
      .maybeSingle();

    if (chauffeurError || !chauffeur) {
      console.error("Chauffeur status lookup error:", chauffeurError);
      return NextResponse.json(
        { message: "Chauffeur registration not found." },
        { status: 404 }
      );
    }

    const chauffeurRow = chauffeur as ChauffeurStatusRow;

    if (chauffeurRow.email.trim().toLowerCase() !== email) {
      return NextResponse.json( { message: "Chauffeur registration not found." }, { status: 404 } );
    }

    return NextResponse.json(
      {
        message: "Chauffeur registration found.",
        registration: {
          id: chauffeurRow.id,
          name: chauffeurRow.name,
          email: chauffeurRow.email,
          phone: chauffeurRow.phone,
          companyName: chauffeurRow.company_name,
          licenseNumber: chauffeurRow.license_number,
          serviceArea: chauffeurRow.service_area,
          acceptsPets: chauffeurRow.accepts_pets,
          accountStatus: chauffeurRow.account_status,
          createdAt: chauffeurRow.created_at,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Invalid chauffeur status request:", error);
    return NextResponse.json( { message: "Invalid chauffeur status request." }, { status: 400 } );
  }
}