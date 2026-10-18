import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";

/* ============================================================
   ADMIN CHAUFFEUR CHANGE REQUESTS

   Shows chauffeur profile-change requests waiting for Admin
   review. Approval/rejection actions will be added separately.
============================================================ */

type ChangeRequestRow = {
    id: string;
    chauffeur_id: string;
    field_name: string;
    current_value: string | null;
    requested_value: string;
    reason: string | null;
    status: string;
    created_at: string;
};

type ChauffeurRow = {
    id: string;
    name: string;
    email: string;
};

type AdminChauffeurChangeRequestsPageProps = {
    pageMessage?: {
        success?: string;
        error?: string;
    };
};

/* ============================================================
   REVIEW CHAUFFEUR CHANGE REQUEST

   Verifies the administrator and sends the final review decision
   to the atomic database review function.
============================================================ */
async function reviewChangeRequest(formData: FormData) {
    "use server";

    /* Verify the current user before using the service-role client. */
    const adminUser = await requireAdminUser();

    const requestId = String(formData.get("requestId") ?? "").trim();
    const reviewStatus = String(formData.get("reviewStatus") ?? "").trim();
    const adminNote = String(formData.get("adminNote") ?? "").trim();

    /* Only supported review decisions may reach the database RPC. */
    if (!requestId || !["approved", "rejected"].includes(reviewStatus)) {
        redirect("/admin/chauffeurs/change-requests?error=invalid-review");
    }

    /* Rejected requests must explain the Admin decision to the chauffeur. */
    if (reviewStatus === "rejected" && !adminNote) {
        redirect("/admin/chauffeurs/change-requests?error=rejection-note-required");
    }

    /* Review and profile update happen atomically inside PostgreSQL. */
    const { error } = await supabaseAdmin.rpc("review_chauffeur_change_request", {
        p_request_id: requestId,
        p_review_status: reviewStatus,
        p_admin_note: adminNote || null,
        p_changed_by_user_id: adminUser.id,
    });

    if (error) {
        console.error("Could not review chauffeur change request:", error);
        redirect("/admin/chauffeurs/change-requests?error=review-failed");
    }

    const success = reviewStatus === "approved" ? "request-approved" : "request-rejected";
    redirect(`/admin/chauffeurs/change-requests?success=${success}`);
}

/* Converts stored field names into readable Admin labels. */
function formatFieldName(fieldName: string) {
    if (fieldName === "name") { return "Name"; }
    if (fieldName === "email") { return "Email"; }
    if (fieldName === "address") { return "Address"; }
    return fieldName;
}

/* Formats the request date for Admin. */
function formatRequestDate(value: string) {
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

/* Loads and displays pending chauffeur change requests. */
export default async function AdminChauffeurChangeRequestsPage({pageMessage = {},}: AdminChauffeurChangeRequestsPageProps) {

    /* Load pending requests oldest first so long-waiting requests stay visible. */
    const { data: requests, error } = await supabaseAdmin
        .from("chauffeur_change_requests")
        .select("id, chauffeur_id, field_name, current_value, requested_value, reason, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Could not load chauffeur change requests:", error);
    }

    const requestRows = (requests ?? []) as ChangeRequestRow[];
    const chauffeurIds = [...new Set(requestRows.map((request) => request.chauffeur_id))];

    /* Load the chauffeurs belonging to the pending requests. */
    const { data: chauffeurs, error: chauffeursError } = chauffeurIds.length > 0
        ? await supabaseAdmin.from("chauffeurs").select("id, name, email").in("id", chauffeurIds)
        : { data: [], error: null };

    if (chauffeursError) {
        console.error("Could not load chauffeurs for change requests:", chauffeursError);
    }

    const chauffeurById = new Map<string, ChauffeurRow>();
    ((chauffeurs ?? []) as ChauffeurRow[]).forEach((chauffeur) => {
        chauffeurById.set(chauffeur.id, chauffeur);
    });

    return (
        <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
            <div className="mx-auto max-w-6xl">
                {/* Navigation and page introduction. */}
                <Link href="/admin/chauffeurs" className="mb-4 inline-flex text-sm font-semibold text-cyan-300 hover:text-cyan-200">
                    &larr; Back to chauffeurs
                </Link>

                <p className="text-sm font-semibold uppercase tracking-wider text-cyan-300">Admin</p>
                <h1 className="mt-2 text-3xl font-bold">Chauffeur change requests</h1>
                <p className="mt-2 text-slate-400">Review protected profile changes requested by chauffeurs.</p>
                {/* Shows the result of the latest Admin review action. */}
                {pageMessage.success === "request-approved" && (
                    <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-emerald-200">
                        Change request approved successfully.
                    </p>
                )}

                {pageMessage.success === "request-rejected" && (
                    <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-emerald-200">
                        Change request rejected successfully.
                    </p>
                )}

                {pageMessage.error === "rejection-note-required" && (
                    <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-red-200">
                        Please provide an Admin explanation before rejecting a request.
                    </p>
                )}

                {pageMessage.error === "invalid-review" && (
                    <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-red-200">
                        Invalid change-request review.
                    </p>
                )}

                {pageMessage.error === "review-failed" && (
                    <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-red-200">
                        The change request could not be reviewed.
                    </p>
                )}
                {/* Shows an empty state when no requests require attention. */}
                {requestRows.length === 0 && (
                    <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-300">
                        No pending change requests.
                    </div>
                )}

                {/* Shows each pending request as a separate review card. */}
                <div className="mt-8 grid gap-5">
                    {requestRows.map((request) => {
                        const chauffeur = chauffeurById.get(request.chauffeur_id);

                        return (
                            <section key={request.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div><span className="text-cyan-300">Chauffeur: </span>{chauffeur?.name ?? "Unknown chauffeur"}</div>
                                    <div><span className="text-cyan-300">Email: </span>{chauffeur?.email ?? "---"}</div>
                                    <div><span className="text-cyan-300">Field: </span>{formatFieldName(request.field_name)}</div>
                                    <div><span className="text-cyan-300">Requested: </span>{formatRequestDate(request.created_at)}</div>
                                    <div><span className="text-cyan-300">Current value: </span>{request.current_value || "---"}</div>
                                    <div><span className="text-cyan-300">Requested value: </span>{request.requested_value}</div>
                                </div>

                                <div className="mt-4">
                                    <span className="text-cyan-300">Reason: </span>
                                    <span>{request.reason || "No reason provided."}</span>
                                </div>
                                {/* Allows Admin to approve or reject the protected profile change. */}
                                <form action={reviewChangeRequest} className="mt-5 border-t border-slate-800 pt-5">
                                    <input type="hidden" name="requestId" value={request.id} />

                                    {/* Optional for approval, required when rejecting the request. */}
                                    <label className="block text-sm font-medium text-slate-300">
                                        Admin note
                                        <textarea
                                            name="adminNote"
                                            rows={3}
                                            maxLength={1000}
                                            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                                            placeholder="Add an explanation, especially when rejecting..."
                                        />
                                    </label>

                                    {/* Both buttons submit the same form with a different review decision. */}
                                    <div className="mt-4 flex flex-wrap gap-3">
                                        <button
                                            type="submit"
                                            name="reviewStatus"
                                            value="approved"
                                            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500"
                                        >
                                            Approve
                                        </button>

                                        <button
                                            type="submit"
                                            name="reviewStatus"
                                            value="rejected"
                                            className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-600"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </form>
                            </section>
                        );
                    })}
                </div>
            </div>
        </main>
    );
}
