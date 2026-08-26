
import Link from "next/link";

import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";

/**
 * TaxiOperatorRow
 *
 * Represents one taxi operator shown on the admin operator overview.
 * This first version is intentionally read-only.
 */
type TaxiOperatorRow = {
    id: string;
    company_name: string;
    kvk_number: string;
    vat_number: string | null;
    p_number: string | null;
    contact_email: string;
    contact_phone: string;
    city: string | null;
    country_code: string;
    verification_status: string;
    created_at: string;
};

/**
 * formatOperatorReference
 *
 * Shows a short operator reference in the overview.
 * The full UUID can later be shown on the operator detail page.
 */
function formatOperatorReference(operatorId: string) {
    if (!operatorId) { return "-"; }
    return operatorId.slice(0, 8);
}

/**
 * getOperatorStatusSortPriority
 *
 * Operators waiting for verification are shown first because
 * they require administrator attention.
 */
function getOperatorStatusSortPriority(verificationStatus: string) {
    if (verificationStatus === "pending_verification") { return 0; }
    if (verificationStatus === "verified") { return 1; }
    if (verificationStatus === "suspended") { return 2; }
    if (verificationStatus === "inactive") { return 3; }

    return 4;
}

/**
 * getOperatorStatusClass
 *
 * Gives each verification status a clear visual meaning.
 */
function getOperatorStatusClass(verificationStatus: string) {
    if (verificationStatus === "verified") { return "text-green-300"; }
    if (verificationStatus === "pending_verification") { return "text-yellow-300"; }
    if (verificationStatus === "suspended") { return "text-red-300"; }
    if (verificationStatus === "inactive") { return "text-slate-400"; }

    return "text-white";
}

/**
 * AdminOperatorsPage
 *
 * Loads and displays taxi operators.
 *
 * Important:
 * This page is read-only for now.
 * Operator verification and status changes will later use the
 * dedicated update_taxi_operator_verification_status RPC.
 */
export default async function AdminOperatorsPage() {
    await requireAdminUser();

    /* ===== Load taxi operators ===== */
    const { data: operatorData, error: operatorError } = await supabaseAdmin
        .from("taxi_operators")
        .select(`
            id,
            company_name,
            kvk_number,
            vat_number,
            p_number,
            contact_email,
            contact_phone,
            city,
            country_code,
            verification_status,
            created_at
        `)
        .order("created_at", { ascending: false });

    if (operatorError) {
        console.error("Could not load taxi operators:", {
            message: operatorError.message,
            details: operatorError.details,
            hint: operatorError.hint,
            code: operatorError.code,
            rawError: operatorError,
        });
    }

    const operatorRows = (operatorData ?? []) as TaxiOperatorRow[];

    /* ===== Sort operators by verification priority ===== */
    const sortedOperatorRows = [...operatorRows].sort((firstOperator, secondOperator) => {
        const firstPriority = getOperatorStatusSortPriority(firstOperator.verification_status);
        const secondPriority = getOperatorStatusSortPriority(secondOperator.verification_status);

        if (firstPriority !== secondPriority) { return firstPriority - secondPriority; }

        return firstOperator.company_name.localeCompare(secondOperator.company_name);
    });

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>

                {/* ===== Page navigation ===== */}
                <Link href="/admin" className={formStyles.link}>← Back to admin dashboard</Link>

                {/* ===== Page title ===== */}
                <p className={pageStyles.pageLabelUpper}>Admin</p>
                <h1 className={pageStyles.pageTitle}>Taxi operators</h1>
                <p className={pageStyles.pageDescription}>
                    View taxi businesses registered in the platform and their verification status.
                </p>

                {/* ===== Database error ===== */}
                {operatorError && (
                    <p className={pageStyles.errorMsgPage}>
                        Could not load taxi operators.
                    </p>
                )}

                {/* ===== Operator list ===== */}
                <h3 className={tableStyles.headerTableSmall}>List of taxi operators:</h3>

                {sortedOperatorRows.length === 0 && !operatorError && (
                    <p className={tableStyles.cellEmpty}>No taxi operators found.</p>
                )}

                {/* ===== Mobile operator cards ===== */}
                <div className="mt-6 grid gap-4 lg:hidden">
                    {sortedOperatorRows.map((operator) => (
                        <article key={operator.id} className="rounded-xl border border-cyan-400/40 bg-slate-900/70 p-4" >
                            <p className="font-semibold text-white">{operator.company_name}</p>
                            <div className="mt-3 grid gap-2 text-sm">
                                <p><span className="font-semibold text-cyan-300">Ref:</span> {formatOperatorReference(operator.id)}</p>
                                <p><span className="font-semibold text-cyan-300">KvK:</span> {operator.kvk_number}</p>
                                <p><span className="font-semibold text-cyan-300">P-number:</span> {operator.p_number || "Not provided"}</p>
                                <p><span className="font-semibold text-cyan-300">Email:</span> {operator.contact_email}</p>
                                <p><span className="font-semibold text-cyan-300">Phone:</span> {operator.contact_phone}</p>
                                <p>
                                    <span className="font-semibold text-cyan-300">Location:</span>{" "}
                                    {operator.city ? `${operator.city} / ${operator.country_code}` : operator.country_code}
                                </p>
                                <p>
                                    <span className="font-semibold text-cyan-300">Verification:</span>{" "}
                                    <span className={`font-semibold ${getOperatorStatusClass(operator.verification_status)}`}>
                                        {operator.verification_status}
                                    </span>
                                </p>
                                <div className="mt-4">
                                    <Link href={`/admin/operators/${operator.id}`} className={formStyles.smallButton}>
                                        Details
                                    </Link>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>

                {/* ===== Desktop operator table ===== */}
                <div className={`${tableStyles.tableDiv} hidden lg:block`}>
                    <table className={tableStyles.table1000}>
                        <thead className={tableStyles.tableHeaderCyan}>
                            <tr>
                                <th className={tableStyles.cellCaption}>Ref</th>
                                <th className={tableStyles.cellCaption}>Company</th>
                                <th className={tableStyles.cellCaption}>KvK</th>
                                <th className={tableStyles.cellCaption}>P-number</th>
                                <th className={tableStyles.cellCaption}>Email</th>
                                <th className={tableStyles.cellCaption}>Phone</th>
                                <th className={tableStyles.cellCaption}>Location</th>
                                <th className={tableStyles.cellCaption}>Verification</th>
                                <th className={tableStyles.cellCaption}>Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {sortedOperatorRows.map((operator) => (
                                <tr key={operator.id} className={tableStyles.rowCyan}>
                                    <td className={tableStyles.cell}>{formatOperatorReference(operator.id)} </td>
                                    <td className={tableStyles.cell}> <span className="font-semibold">{operator.company_name}</span> </td>
                                    <td className={tableStyles.cell}> {operator.kvk_number}</td>
                                    <td className={tableStyles.cell}> {operator.p_number || "Not provided"}</td>
                                    <td className={tableStyles.cell}> {operator.contact_email} </td>
                                    <td className={tableStyles.cell}> {operator.contact_phone} </td>
                                    <td className={tableStyles.cell}>
                                        {operator.city ? `${operator.city} / ${operator.country_code}` : operator.country_code}
                                    </td>
                                    <td className={tableStyles.cell}>
                                        <span className={`font-semibold ${getOperatorStatusClass(operator.verification_status)}`}>
                                            {operator.verification_status}
                                        </span>
                                    </td>
                                    <td className={tableStyles.cell}>
                                        <Link href={`/admin/operators/${operator.id}`} className={formStyles.smallButton}>
                                            Details
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

            </div>
        </main>
    );
}