import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";

/*
    VOYA TAXI — DEFAULT SERVICE FEE API
    Allows authorized administrators to schedule historical default chauffeur service-fee rates.
    PostgreSQL RPC:
    public.set_default_service_fee_rate(NUMERIC, DATE)
*/

/**
 * Schedules a default chauffeur service-fee rate.
 *
 * Verifies Admin authorization, validates the request,
 * and calls the protected PostgreSQL scheduling RPC.
 */
export async function POST(request: Request) {

    // Only authorized administrators may submit financial changes.
    await requireAdminUser();

    // Read JSON request data safely.
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { message: "Invalid JSON request." },
            { status: 400 }
        );
    }

    // Validate the request structure.
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
            { message: "Invalid request data." },
            { status: 400 }
        );
    }

    const input = body as Record<string, unknown>;
    const { percentage, effectiveFrom } = input;

    // Percentage must be a finite number between 0 and 100.
    if (
        typeof percentage !== "number" ||
        !Number.isFinite(percentage) ||
        percentage < 0 ||
        percentage > 100
    ) {
        return NextResponse.json(
            { message: "Percentage must be between 0 and 100." },
            { status: 400 }
        );
    }

    // Require an ISO calendar date in YYYY-MM-DD format.
    if (
        typeof effectiveFrom !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ||
        !Number.isFinite(Date.parse(`${effectiveFrom}T00:00:00Z`)) ||
        new Date(`${effectiveFrom}T00:00:00Z`).toISOString().slice(0, 10) !== effectiveFrom
    ) {
        return NextResponse.json(
            { message: "Effective date must be a valid YYYY-MM-DD date." },
            { status: 400 }
        );
    }

    // PostgreSQL validates future dates and prevents overlapping rate periods.
    const { data: rateId, error } = await supabaseAdmin.rpc("set_default_service_fee_rate", {p_percentage: percentage, p_effective_from: effectiveFrom,});

    // Report validation or scheduling conflicts without exposing database details.
    if (error) {
        console.error("Could not schedule default service fee:", error);

        const isValidationError =
            error.message.includes("Service-fee percentage must be") ||
            error.message.includes("Effective date must be") ||
            error.message.includes("New effective date must be") ||
            error.message.includes("Latest default service-fee rate is already closed");

        return NextResponse.json(
            {
                message: isValidationError
                    ? error.message
                    : "Could not save the default service-fee rate.",
            },
            { status: isValidationError ? 400 : 500 }
        );
    }

    // Return the new rate identifier after successful scheduling.
    return NextResponse.json(
        { message: "Default service-fee rate scheduled successfully.", rateId, },
        { status: 201 }
    );
}