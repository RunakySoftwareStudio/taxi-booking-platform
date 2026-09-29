import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseServer";

/* ============================================================
   ADMIN CHAUFFEUR COMPLIANCE MONITORING

   Loads the live chauffeur_compliance_monitoring view and gives
   Admin one place to see:

   - critical compliance problems;
   - documents expiring within 30 days;
   - healthy compliant chauffeurs;
   - pending required documents waiting for review.

   Booking eligibility remains enforced separately by the
   database eligibility RPC.
============================================================ */

type ComplianceMonitoringRow = {
    chauffeur_id: string;
    chauffeur_name: string;
    account_status: string;
    operational_status: string;
    verification_status: string | null;

    driving_license_valid_until: string | null;
    driving_license_days_remaining: number | null;
    driving_license_monitoring_status: string;

    chauffeur_card_valid_until: string | null;
    chauffeur_card_days_remaining: number | null;
    chauffeur_card_monitoring_status: string;

    next_expiry_date: string | null;
    days_until_next_expiry: number | null;

    required_documents_pending_review_count: number;
    monitoring_status: "critical" | "warning" | "ok";
};

/* ============================================================
   MONITORING SORT PRIORITY

   Problems requiring Admin attention appear first:

   1. critical
   2. warning
   3. ok
============================================================ */

function getMonitoringPriority(status: ComplianceMonitoringRow["monitoring_status"]) {
    if (status === "critical") { return 0; }
    if (status === "warning") { return 1; }
    return 2;
}

/* ============================================================
   STATUS CARD STYLE

   Keeps the visual meaning consistent across desktop and mobile.
============================================================ */

function getMonitoringCardClass(status: ComplianceMonitoringRow["monitoring_status"]) {
    if (status === "critical") {
        return "border-red-400/30 bg-red-950/20";
    }

    if (status === "warning") {
        return "border-yellow-400/30 bg-yellow-950/20";
    }

    return "border-emerald-400/20 bg-slate-900";
}

/* ============================================================
   STATUS TEXT STYLE
============================================================ */

function getMonitoringTextClass(status: ComplianceMonitoringRow["monitoring_status"]) {
    if (status === "critical") { return "text-red-200"; }
    if (status === "warning") { return "text-yellow-200"; }
    return "text-emerald-200";
}

/* ============================================================
   FORMAT MONITORING STATUS

   Converts database values such as expires_soon into labels that
   are easier for Admin to read.
============================================================ */

function formatMonitoringStatus(status: string) {
    if (status === "expires_soon") { return "Expires soon"; }
    if (status === "expired") { return "Expired"; }
    if (status === "missing") { return "Missing"; }
    if (status === "valid") { return "Valid"; }

    return status;
}

/* ============================================================
   FORMAT EXPIRY DATE

   Keeps missing dates explicit rather than hiding the problem.
============================================================ */

function formatExpiryDate(value: string | null) {
    if (!value) { return "Not available"; }

    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
}

/* ============================================================
   FORMAT DAYS REMAINING
============================================================ */

function formatDaysRemaining(days: number | null) {
    if (days === null) { return "—"; }
    if (days < 0) { return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} expired`; }
    if (days === 0) { return "Expires today"; }

    return `${days} day${days === 1 ? "" : "s"} remaining`;
}

/* ============================================================
   ADMIN COMPLIANCE PAGE
============================================================ */

export default async function AdminChauffeurCompliancePage() {
    /* Loads only the non-sensitive monitoring information exposed by the view. */
    const { data, error } = await supabaseAdmin
        .from("chauffeur_compliance_monitoring")
        .select(`
            chauffeur_id,
            chauffeur_name,
            account_status,
            operational_status,
            verification_status,
            driving_license_valid_until,
            driving_license_days_remaining,
            driving_license_monitoring_status,
            chauffeur_card_valid_until,
            chauffeur_card_days_remaining,
            chauffeur_card_monitoring_status,
            next_expiry_date,
            days_until_next_expiry,
            required_documents_pending_review_count,
            monitoring_status
        `);

    if (error) {
        console.error("Could not load chauffeur compliance monitoring:", error);
    }

    /* Sorts urgent compliance problems before healthy chauffeurs. */
    const monitoringRows = ((data ?? []) as ComplianceMonitoringRow[]).sort(
        (firstRow, secondRow) => {
            const priorityDifference =
                getMonitoringPriority(firstRow.monitoring_status)
                - getMonitoringPriority(secondRow.monitoring_status);

            if (priorityDifference !== 0) { return priorityDifference; }

            /*
             * Within the same status, the nearest expiry appears first.
             * Missing expiry dates are treated as the highest urgency.
             */
            if (firstRow.days_until_next_expiry === null
                && secondRow.days_until_next_expiry !== null) {
                return -1;
            }

            if (firstRow.days_until_next_expiry !== null
                && secondRow.days_until_next_expiry === null) {
                return 1;
            }

            if (firstRow.days_until_next_expiry !== null
                && secondRow.days_until_next_expiry !== null
                && firstRow.days_until_next_expiry !== secondRow.days_until_next_expiry) {
                return firstRow.days_until_next_expiry - secondRow.days_until_next_expiry;
            }

            return firstRow.chauffeur_name.localeCompare(secondRow.chauffeur_name);
        }
    );

    /* Summary counters help Admin immediately see the workload. */
    const criticalCount = monitoringRows.filter(
        (row) => row.monitoring_status === "critical"
    ).length;

    const warningCount = monitoringRows.filter(
        (row) => row.monitoring_status === "warning"
    ).length;

    const okCount = monitoringRows.filter(
        (row) => row.monitoring_status === "ok"
    ).length;

    const pendingReviewCount = monitoringRows.reduce(
        (total, row) => total + row.required_documents_pending_review_count,
        0
    );

    return (
        <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
            <div className="mx-auto max-w-7xl">

                {/* Navigation back to chauffeur administration. */}
                <Link href="/admin/chauffeurs" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200" >
                    <span aria-hidden="true">{"\u2190"}</span>
                    Back to chauffeurs
                </Link>

                {/* Page title and explanation. */}
                <header className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                        Admin
                    </p>

                    <h1 className="mt-1 text-2xl font-bold text-slate-100">
                        Chauffeur compliance monitoring
                    </h1>

                    <p className="mt-2 max-w-3xl text-sm text-slate-400">
                        Monitor required chauffeur documents, expiry dates and compliance problems before they affect future bookings.
                    </p>
                </header>

                {/* Monitoring summary. */}
                <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-red-400/30 bg-red-950/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-red-300">Critical</p>
                        <p className="mt-1 text-2xl font-bold text-red-200">{criticalCount}</p>
                    </div>

                    <div className="rounded-lg border border-yellow-400/30 bg-yellow-950/20 p-4">
                        <p className="text-xs uppercase tracking-wide text-yellow-300">Warning</p>
                        <p className="mt-1 text-2xl font-bold text-yellow-200">{warningCount}</p>
                    </div>

                    <div className="rounded-lg border border-emerald-400/20 bg-slate-900 p-4">
                        <p className="text-xs uppercase tracking-wide text-emerald-300">OK</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-200">{okCount}</p>
                    </div>

                    <div className="rounded-lg border border-cyan-400/20 bg-slate-900 p-4">
                        <p className="text-xs uppercase tracking-wide text-cyan-300">
                            Pending reviews
                        </p>
                        <p className="mt-1 text-2xl font-bold text-cyan-200">
                            {pendingReviewCount}
                        </p>
                    </div>
                </div>

                {/* Database error remains visible without crashing the complete Admin page. */}
                {error && (
                    <p className="mb-6 rounded-lg border border-red-400/30 bg-red-950/20 p-4 text-sm text-red-200">
                        Could not load chauffeur compliance monitoring.
                    </p>
                )}

                {/* Compliance monitoring cards. */}
                <div className="space-y-4">
                    {monitoringRows.map((row) => (
                        <article key={row.chauffeur_id} className={`rounded-lg border p-4 ${getMonitoringCardClass(row.monitoring_status)}`}>
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">

                                <div className="min-w-0 flex-1">
                                    {/* Chauffeur and overall monitoring state. */}
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h2 className="font-semibold text-slate-100">
                                            {row.chauffeur_name}
                                        </h2>

                                        <span className={`text-sm font-semibold ${getMonitoringTextClass(row.monitoring_status)}`}>
                                            {row.monitoring_status.toUpperCase()}
                                        </span>
                                    </div>

                                    <p className="mt-1 text-xs text-slate-500">
                                        Account: {row.account_status}
                                        {" · "}
                                        Operational: {row.operational_status}
                                        {" · "}
                                        Compliance: {row.verification_status ?? "missing"}
                                    </p>

                                    {/* Required document monitoring details. */}
                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                        <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
                                            <p className="font-medium text-slate-200">
                                                Driving licence
                                            </p>

                                            <p className="mt-1 text-sm text-slate-400">
                                                Status:{" "}
                                                {formatMonitoringStatus(row.driving_license_monitoring_status)}
                                            </p>

                                            <p className="text-sm text-slate-400">
                                                Expires:{" "}
                                                {formatExpiryDate(row.driving_license_valid_until)}
                                            </p>

                                            <p className="text-xs text-slate-500">
                                                {formatDaysRemaining(row.driving_license_days_remaining)}
                                            </p>
                                        </div>

                                        <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
                                            <p className="font-medium text-slate-200">
                                                Chauffeurskaart
                                            </p>

                                            <p className="mt-1 text-sm text-slate-400">
                                                Status:{" "}
                                                {formatMonitoringStatus(row.chauffeur_card_monitoring_status)}
                                            </p>

                                            <p className="text-sm text-slate-400">
                                                Expires:{" "}
                                                {formatExpiryDate(row.chauffeur_card_valid_until)}
                                            </p>

                                            <p className="text-xs text-slate-500">
                                                {formatDaysRemaining(row.chauffeur_card_days_remaining)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Overall expiry and pending-review information. */}
                                    <div className="mt-4 text-sm text-slate-400">
                                        <p>
                                            Next expiry:{" "}
                                            <span className="text-slate-300">
                                                {formatExpiryDate(row.next_expiry_date)}
                                            </span>
                                            {" · "}
                                            {formatDaysRemaining(row.days_until_next_expiry)}
                                        </p>

                                        {row.required_documents_pending_review_count > 0 && (
                                            <p className="mt-1 font-medium text-cyan-200">
                                                Required documents waiting for review:{" "}
                                                {row.required_documents_pending_review_count}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Opens the existing chauffeur administration screen. */}
                                <Link href={`/admin/chauffeurs/${row.chauffeur_id}`}
                                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-yellow-400 px-4 text-sm font-semibold text-slate-950 hover:bg-yellow-300" >
                                    Review chauffeur
                                </Link>
                            </div>
                        </article>
                    ))}

                    {!error && monitoringRows.length === 0 && (
                        <div className="rounded-lg border border-white/10 bg-slate-900 p-6 text-sm text-slate-400">
                            No chauffeur compliance records found.
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}