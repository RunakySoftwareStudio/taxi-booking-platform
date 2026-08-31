import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
    params: Promise<{
        chauffeurId: string;
        documentId: string;
    }>;
};

/**
 * Reviews one chauffeur compliance document.
 *
 * Only an administrator may verify or reject a document.
 * The protected review_chauffeur_document RPC performs
 * the actual database status change and audit update.
 */
export async function POST(request: Request, { params }: RouteContext) {
    const { chauffeurId, documentId } = await params;

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

    /* ===== Read requested document review ===== */
    const body = await request.json();

    /* ============================================================
    READ DOCUMENT REVIEW DETAILS

    Reads the Admin decision together with any structured
    compliance information required for the document type.

    Chauffeurskaart:
    - card number
    - valid-until date

    Driving licence:
    - valid-until date
    ============================================================ */
    const verificationStatus = String(body.verificationStatus || "").trim();
    const statusReason = String(body.statusReason || "").trim();
    const chauffeurCardNumber = String(body.chauffeurCardNumber || "").trim();
    const chauffeurCardValidUntil = String(body.chauffeurCardValidUntil || "").trim();

    const drivingLicenseNumber = String(body.drivingLicenseNumber || "").trim();
    const drivingLicenseValidUntil = String(body.drivingLicenseValidUntil || "").trim();

    if (
        verificationStatus !== "verified" &&
        verificationStatus !== "rejected"
    ) {
        return NextResponse.json(
            { message: "Document review status must be verified or rejected." },
            { status: 400 }
        );
    }

    if (verificationStatus === "rejected" && !statusReason) {
        return NextResponse.json(
            { message: "Please provide a reason for rejecting the document." },
            { status: 400 }
        );
    }

    /* ===== Review document through protected RPC ===== */
    const { error } = await supabaseAdmin.rpc(
        "review_chauffeur_document",
        {
            p_chauffeur_id: chauffeurId,
            p_document_id: documentId,
            p_verification_status: verificationStatus,
            p_status_reason: statusReason || null,
            p_changed_by_user_id: user.id,

            /* Structured Chauffeurskaart values are validated again inside the RPC. */
            p_chauffeur_card_number: chauffeurCardNumber || null,
            p_chauffeur_card_valid_until: chauffeurCardValidUntil || null,

            /* ============================================================
            STRUCTURED DRIVING LICENCE DETAILS

            Sends the licence number and expiry date to the database RPC.
            The RPC performs the final validation and stores them together
            with the verified document in one transaction.
            ============================================================ */
            p_driving_license_number: drivingLicenseNumber || null,
            p_driving_license_valid_until: drivingLicenseValidUntil || null,
        }
    );

    if (error) {
        console.error("Could not review chauffeur document:", {
            chauffeurId,
            documentId,
            verificationStatus,
            error,
        });

        if (error.code === "P0002") {
            return NextResponse.json(
                { message: error.message || "Chauffeur document was not found." },
                { status: 404 }
            );
        }

        if (error.code === "22023") {
            return NextResponse.json(
                { message: error.message || "Invalid document review." },
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
            { message: "Could not review chauffeur document." },
            { status: 500 }
        );
    }

    return NextResponse.json({
        message: verificationStatus === "verified"
            ? "Document verified successfully."
            : "Document rejected successfully.",
    });
}