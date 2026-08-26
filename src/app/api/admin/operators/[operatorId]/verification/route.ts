import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
    params: Promise<{ operatorId: string }>;
};

/**
 * Changes one taxi operator's verification status.
 *
 * This route will call update_taxi_operator_verification_status.
 * It must never update verification_status directly.
 */
export async function POST(_request: Request, { params }: RouteContext) {
    const { operatorId } = await params;

    /* ===== Confirm logged-in administrator ===== */
    const authSupabase = await createClient();
    const { data: { user } } = await authSupabase.auth.getUser();

    if (!user) {
        return NextResponse.json(
            { message: "Not logged in." },
            { status: 401 }
        );
    }

    const { data: profile, error: profileError } = await authSupabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError) {
        console.error("Could not verify administrator access:", profileError);

        return NextResponse.json(
            { message: "Could not verify administrator access." },
            { status: 500 }
        );
    }

    if (profile?.role !== "admin") {
        return NextResponse.json(
            { message: "Not allowed." },
            { status: 403 }
        );
    }

    /* ===== Read requested verification change ===== */
    const body = await _request.json();

    const verificationStatus = String(body.verificationStatus || "").trim();
    const statusReason = String(body.statusReason || "").trim();

    const allowedVerificationStatuses = [
        "verified",
        "suspended",
        "inactive",
    ];

    if (!allowedVerificationStatuses.includes(verificationStatus)) {
        return NextResponse.json(
            { message: "Invalid taxi operator verification status." },
            { status: 400 }
        );
    }

    /* A reason gives suspended/inactive changes a useful audit explanation. */
    if (
        (verificationStatus === "suspended" || verificationStatus === "inactive") &&
        !statusReason
    ) {
        return NextResponse.json(
            { message: "Please provide a reason for suspending or deactivating the operator." },
            { status: 400 }
        );
    }

    /* ===== Change verification status through the protected RPC ===== */
    const { error } = await supabaseAdmin.rpc(
        "update_taxi_operator_verification_status",
        {
            p_operator_id: operatorId,
            p_verification_status: verificationStatus,
            p_status_reason: statusReason || null,
            p_changed_by_user_id: user.id,
        }
    );

    if (error) {
        console.error("Could not update taxi operator verification status:", {
            operatorId,
            verificationStatus,
            error,
        });

        if (error.code === "P0002") {
            return NextResponse.json(
                { message: error.message || "Taxi operator was not found." },
                { status: 404 }
            );
        }

        if (error.code === "22023") {
            return NextResponse.json(
                { message: error.message || "Invalid verification status change." },
                { status: 400 }
            );
        }

        if (error.code === "42501") {
            return NextResponse.json(
                { message: error.message || "Not allowed." },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { message: "Could not update taxi operator verification status." },
            { status: 500 }
        );
    }

    return NextResponse.json({
        message: "Taxi operator verification status updated successfully.",
    });
}