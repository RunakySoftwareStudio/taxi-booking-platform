import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";

type AdminOperatorEditPageProps = {
    params: Promise<{ operatorId: string }>;
};

type TaxiOperatorRow = {
    id: string;
    company_name: string;
    kvk_number: string;
    vat_number: string | null;
    p_number: string | null;
    contact_email: string;
    contact_phone: string;
    street: string | null;
    house_number: string | null;
    postal_code: string | null;
    city: string | null;
    country_code: string;
    verification_status: string;
    verification_status_reason: string | null;
    verification_status_changed_at: string | null;
    verified_at: string | null;
    created_at: string;
    updated_at: string;
};

/**
 * formatDateTime
 *
 * Formats a database timestamp for display on the admin page.
 */
function formatDateTime(dateValue: string | null) {
    if (!dateValue) { return "-"; }

    return new Intl.DateTimeFormat("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date(dateValue));
}

/**
 * getOperatorStatusClass
 *
 * Gives the verification status a clear visual meaning.
 */
function getOperatorStatusClass(verificationStatus: string) {
    if (verificationStatus === "verified") { return "text-green-300"; }
    if (verificationStatus === "pending_verification") { return "text-yellow-300"; }
    if (verificationStatus === "suspended") { return "text-red-300"; }
    if (verificationStatus === "inactive") { return "text-slate-400"; }

    return "text-white";
}

/**
 * AdminOperatorEditPage
 *
 * Displays one taxi operator.
 *
 * This first version is intentionally read-only.
 * Editing and verification actions will be added after the
 * operator detail data has been verified.
 */
export default async function AdminOperatorEditPage({ params }: AdminOperatorEditPageProps) {
    await requireAdminUser();

    const { operatorId } = await params;

    /* ===== Load taxi operator ===== */
    const { data, error } = await supabaseAdmin
        .from("taxi_operators")
        .select(`
            id,
            company_name,
            kvk_number,
            vat_number,
            p_number,
            contact_email,
            contact_phone,
            street,
            house_number,
            postal_code,
            city,
            country_code,
            verification_status,
            verification_status_reason,
            verification_status_changed_at,
            verified_at,
            created_at,
            updated_at
        `)
        .eq("id", operatorId)
        .maybeSingle();

    /* ===== Handle operator lookup result ===== */
    if (error) {
        console.error("Could not load taxi operator:", {
            operatorId,
            error,
        });

        throw new Error("Could not load taxi operator.");
    }

    if (!data) { notFound(); }

    const operator = data as TaxiOperatorRow;

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>

                {/* ===== Page navigation ===== */}
                <Link href="/admin/operators" className={formStyles.link}>
                    ← Back to taxi operators
                </Link>

                {/* ===== Page title ===== */}
                <p className={pageStyles.pageLabelUpper}>Admin</p>
                <h1 className={pageStyles.pageTitle}>{operator.company_name}</h1>
                <p className={pageStyles.pageDescription}>
                    Review the taxi operator business details and verification information.
                </p>

                {/* ===== Verification status ===== */}
                <section className="mt-8 rounded-xl border border-cyan-400/40 bg-slate-900/70 p-5">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                        Verification status
                    </p>

                    <p className={`mt-2 text-lg font-semibold ${getOperatorStatusClass(operator.verification_status)}`}>
                        {operator.verification_status}
                    </p>

                    {operator.verification_status_reason && (
                        <p className="mt-2 text-sm text-slate-300">
                            {operator.verification_status_reason}
                        </p>
                    )}
                </section>

                {/* ===== Business details ===== */}
                <section className="mt-6 rounded-xl border border-white/10 bg-slate-900/70 p-5">
                    <h2 className="text-lg font-semibold text-cyan-300">Business details</h2>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Operator ID</p>
                            <p className="mt-1 break-all text-sm text-white">{operator.id}</p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Company</p>
                            <p className="mt-1 text-sm text-white">{operator.company_name}</p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">KvK</p>
                            <p className="mt-1 text-sm text-white">{operator.kvk_number}</p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">VAT number</p>
                            <p className="mt-1 text-sm text-white">{operator.vat_number || "-"}</p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">P-number</p>
                            <p className="mt-1 text-sm text-white">{operator.p_number || "Not provided"}</p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Country</p>
                            <p className="mt-1 text-sm text-white">{operator.country_code}</p>
                        </div>
                    </div>
                </section>

                {/* ===== Contact and address ===== */}
                <section className="mt-6 rounded-xl border border-white/10 bg-slate-900/70 p-5">
                    <h2 className="text-lg font-semibold text-cyan-300">Contact and address</h2>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Email</p>
                            <p className="mt-1 break-all text-sm text-white">{operator.contact_email}</p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Phone</p>
                            <p className="mt-1 text-sm text-white">{operator.contact_phone}</p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Street</p>
                            <p className="mt-1 text-sm text-white">
                                {[operator.street, operator.house_number].filter(Boolean).join(" ") || "-"}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Postal code</p>
                            <p className="mt-1 text-sm text-white">{operator.postal_code || "-"}</p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">City</p>
                            <p className="mt-1 text-sm text-white">{operator.city || "-"}</p>
                        </div>
                    </div>
                </section>

                {/* ===== Verification history ===== */}
                <section className="mt-6 rounded-xl border border-white/10 bg-slate-900/70 p-5">
                    <h2 className="text-lg font-semibold text-cyan-300">Verification history</h2>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Status changed</p>
                            <p className="mt-1 text-sm text-white">
                                {formatDateTime(operator.verification_status_changed_at)}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Verified at</p>
                            <p className="mt-1 text-sm text-white">
                                {formatDateTime(operator.verified_at)}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Created</p>
                            <p className="mt-1 text-sm text-white">
                                {formatDateTime(operator.created_at)}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Updated</p>
                            <p className="mt-1 text-sm text-white">
                                {formatDateTime(operator.updated_at)}
                            </p>
                        </div>
                    </div>
                </section>

            </div>
        </main>
    );
}
