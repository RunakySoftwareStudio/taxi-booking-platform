
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { createClient } from "@/lib/supabase/server";

/* ============================================================
   ADMIN CHAUFFEUR COMPLIANCE VERIFICATION

   Purpose:
   Allows an authenticated administrator to verify, suspend
   or deactivate a chauffeur's overall compliance approval.

   The protected database RPC performs the final validation
   and records the status change and audit information.

   Document verification remains independent.
   Account and operational statuses are not modified.
============================================================ */

type RouteContext = {params: Promise<{ chauffeurId: string;}>;};

/**
 * Changes the overall compliance verification status of one chauffeur.
 *
 * POST /api/admin/chauffeurs/[chauffeurId]/verification
 */
export async function POST(request: Request, { params }: RouteContext) {
    const { chauffeurId } = await params;

    /* ============================================================
       ADMIN AUTHENTICATION

       Confirm that the request belongs to a logged-in user.
       Verify the user's Admin role before using service_role.
    ============================================================ */

    const authSupabase = await createClient();
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();

    if (authError || !user) {
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

    /* ============================================================
       READ REQUESTED COMPLIANCE ACTION

       Read the requested verification status and optional reason.
       Reject malformed JSON instead of causing a server error.
    ============================================================ */

    let body: Record<string, unknown>;

    try {
        const input: unknown = await request.json();

        if (!input || typeof input !== "object" || Array.isArray(input)) {
            throw new Error("Invalid request body.");
        }

        body = input as Record<string, unknown>;
    } catch {
        return NextResponse.json(
            { message: "Invalid request body." },
            { status: 400 }
        );
    }

    const verificationStatus =
        typeof body.verificationStatus === "string"
            ? body.verificationStatus.trim()
            : "";

    const statusReason =
        typeof body.statusReason === "string"
            ? body.statusReason.trim()
            : "";

    /* ============================================================
       STATUS VALIDATION

       Admin can verify, suspend or deactivate compliance.
       Pending verification is not an Admin action.
    ============================================================ */

    if (verificationStatus !== "verified" && verificationStatus !== "suspended" && verificationStatus !== "inactive") {
        return NextResponse.json(
            { message: "Invalid chauffeur verification status." },
            { status: 400 }
        );
    }

    /* Suspension and deactivation require an audit explanation. */
    if ((verificationStatus === "suspended" || verificationStatus === "inactive") && !statusReason ) {
        return NextResponse.json(
            { message: "Please provide a reason for suspension or deactivation." },
            { status: 400 }
        );
    }

    /* ============================================================
       PROTECTED DATABASE OPERATION

       Calls the existing whole-chauffeur verification RPC.

       The RPC checks the required documents before verification
       and records the responsible Admin and status-change time.

       The Admin identity comes from the authenticated session,
       never from the submitted request body.
    ============================================================ */

    const { error } = await supabaseAdmin.rpc(
        "update_chauffeur_compliance_verification",
        {
            p_chauffeur_id: chauffeurId,
            p_verification_status: verificationStatus,
            p_status_reason: statusReason || null,
            p_changed_by_user_id: user.id,
        }
    );

    /* ============================================================
       DATABASE ERROR HANDLING

       Convert database validation and authorization errors
       into appropriate HTTP responses for the Admin interface.
    ============================================================ */

    if (error) {
        console.error("Could not update chauffeur compliance:", {
            chauffeurId,
            verificationStatus,
            error,
        });

        if (error.code === "P0002") {
            return NextResponse.json(
                { message: error.message || "Chauffeur compliance record was not found." },
                { status: 404 }
            );
        }

        if (error.code === "22023") {
            return NextResponse.json(
                { message: error.message || "Invalid chauffeur compliance action." },
                { status: 400 }
            );
        }

        if (error.code === "42501") {
            return NextResponse.json(
                { message: "Not allowed." },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { message: "Could not update chauffeur compliance." },
            { status: 500 }
        );
    }

    /* ============================================================
       SUCCESS RESPONSE

       Return a confirmation only after the database operation
       has completed successfully.
    ============================================================ */

    const successMessages = {
        verified: "Chauffeur compliance verified successfully.",
        suspended: "Chauffeur compliance suspended successfully.",
        inactive: "Chauffeur compliance deactivated successfully.",
    };

    return NextResponse.json({
        message: successMessages[verificationStatus],
    });
}