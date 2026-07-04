import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

/**
 * ChauffeurRegistrationRequest
 *
 * This type describes the data that comes from the public
 * chauffeur registration form.
 *
 * These names match the frontend form field names.
 */
type ChauffeurRegistrationRequest = {
  name: string;
  email: string;
  phone: string;
  companyName?: string;
  licenseNumber?: string;
  serviceArea?: string;
  acceptsPets: boolean;
};

/**
 * normalizeText
 *
 * This helper removes empty spaces at the beginning and end of a text value.
 * If the value is missing, it returns an empty string.
 */
function normalizeText(inputValue: unknown) {
  if (typeof inputValue !== "string") {
    return "";
  }

  return inputValue.trim();
}

/**
 * normalizeEmail
 *
 * This helper trims the email and converts it to lowercase.
 * This helps prevent duplicate emails like:
 * Driver@Test.com
 * driver@test.com
 */
function normalizeEmail(inputValue: unknown) {
  return normalizeText(inputValue).toLowerCase();
}

/**
 * POST /api/chauffeur-registrations
 *
 * This API route receives a chauffeur registration request from the public form.
 *
 * It does these steps:
 * 1. Reads the request body
 * 2. Validates required fields
 * 3. Normalizes the email
 * 4. Checks if the email already exists
 * 5. Inserts a new chauffeur with pending_approval status
 * 6. Returns the new registration ID
 */
export async function POST(request: Request) {
  try {
    const registrationRequest =
      (await request.json()) as ChauffeurRegistrationRequest;

    const name = normalizeText(registrationRequest.name);
    const email = normalizeEmail(registrationRequest.email);
    const phone = normalizeText(registrationRequest.phone);
    const companyName = normalizeText(registrationRequest.companyName);
    const licenseNumber = normalizeText(registrationRequest.licenseNumber);
    const serviceArea = normalizeText(registrationRequest.serviceArea);

    const acceptsPets = Boolean(registrationRequest.acceptsPets);

    if (!name || !email || !phone) {
      return NextResponse.json(
        { message: "Name, email, and phone are required.", },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json(
        {  message: "Please provide a valid email address.", },
        { status: 400 }
      );
    }

    const { data: existingChauffeur, error: existingChauffeurError } =
      await supabaseAdmin
        .from("chauffeurs")
        .select("id, email, account_status")
        .eq("email", email)
        .maybeSingle();

    if (existingChauffeurError) {
      return NextResponse.json(
        { message: "Could not check existing chauffeur registration.", },
        { status: 500 }
      );
    }

    if (existingChauffeur) {
      return NextResponse.json(
        { message: "A chauffeur registration with this email already exists.", },
        { status: 409 }
      );
    }

    const { data: savedChauffeur, error: saveChauffeurError } =
      await supabaseAdmin
        .from("chauffeurs")
        .insert({
          name,
          email,
          phone,
          company_name: companyName || null,
          license_number: licenseNumber || null,
          service_area: serviceArea || null,
          accepts_pets: acceptsPets,
          account_status: "pending_approval",
        })
        .select("id, name, email, account_status")
        .single();

    if (saveChauffeurError) {
      return NextResponse.json(
        { message: "Could not save chauffeur registration.", },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Chauffeur registration submitted successfully.",
        registration: {
          id: savedChauffeur.id,
          name: savedChauffeur.name,
          email: savedChauffeur.email,
          accountStatus: savedChauffeur.account_status,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { message: "Invalid chauffeur registration request.", },
      { status: 400 }
    );
  }
}