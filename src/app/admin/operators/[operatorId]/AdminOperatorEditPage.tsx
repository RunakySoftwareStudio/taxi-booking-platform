import Link from "next/link";
import { notFound } from "next/navigation";

import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";
import AdminOperatorEditForm from "@/components/AdminOperatorEditForm";
import AdminOperatorVerificationControls from "@/components/AdminOperatorVerificationControls";

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
 * AdminOperatorEditPage
 *
 * Loads and displays one taxi operator for administrator review.
 *
 * Normal operator details are edited separately from verification
 * actions so verification status can only change through the
 * protected verification RPC.
 */
export default async function AdminOperatorEditPage({ params }: AdminOperatorEditPageProps) {

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

                {/* ===== Verification controls ===== */}
                <AdminOperatorVerificationControls
                    operatorId={operator.id}
                    verificationStatus={operator.verification_status}
                    verificationStatusReason={operator.verification_status_reason}
                />

                {/* ===== Editable operator details ===== */}
                <AdminOperatorEditForm operator={operator} />

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
