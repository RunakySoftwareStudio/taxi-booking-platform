
import Link from "next/link";

import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";

/**
 * Purpose:
 * Admin overview of all pricing markets stored in public.pricing_markets.
 *
 * This page is intentionally read-only for the first version.
 * Add Country and configuration-management actions will be added
 * after the database-driven market list has been verified.
 */
type AdminPricingMarketsPageProps = {
    searchParams: Promise<{ error?: string }>;
};

type PricingMarketRow = {
    id: string;
    country_code: string;
    country_name: string;
    currency_code: string;
    service_category: string;
    time_zone: string;
    configuration_status: string;
    pricing_enabled: boolean;
    planned_effective_from: string | null;
};

function formatDate(dateValue: string | null): string {
    if (!dateValue) { return "Not set"; }

    return new Intl.DateTimeFormat("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(dateValue));
}

export default async function AdminPricingMarketsPage({ searchParams }: AdminPricingMarketsPageProps) {
    await requireAdminUser();

    const pageSearchParams = await searchParams;

    const { data: pricingMarketData, error: pricingMarketError } = await supabaseAdmin
        .from("pricing_markets")
        .select(`
            id,
            country_code,
            country_name,
            currency_code,
            service_category,
            time_zone,
            configuration_status,
            pricing_enabled,
            planned_effective_from
        `)
        .order("country_code", { ascending: true });

    if (pricingMarketError) {
        console.error("Could not load pricing markets:", pricingMarketError);
    }

    const pricingMarkets = (pricingMarketData ?? []) as PricingMarketRow[];

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                {/* ===== Page title and description ===== */}
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                    <Link href="/admin" className={formStyles.link}>← Back to admin</Link>
                    <span className="text-slate-600">|</span>
                    <Link href="/admin/pricing" className={formStyles.link}>Pricing</Link>
                    <span className="text-slate-600">|</span>
                    <Link href="/admin/pricing/tax-rules" className={formStyles.link}>Tax rules</Link>
                    <span className="text-slate-600">|</span>
                    <Link href="/admin/pricing/rounding-rules" className={formStyles.link}>Rounding rules</Link>
                </div>

                <p className={pageStyles.pageLabelUpper}>Financial configuration</p>
                <h1 className={pageStyles.pageTitle}>Pricing markets</h1>

                <p className={pageStyles.pageDescription}>
                    View the countries and markets configured for journey pricing.
                </p>
                {/* ===== Add country action ===== */}
                <div className="mb-6">
                    <Link href="/admin/pricing/countries/new" className={formStyles.smallButton}>
                        Add country
                    </Link>
                </div>
                
                {/* ===== load-failed message ===== */}
                {pageSearchParams.error === "load-failed" && ( <p className={pageStyles.errorMsg}>Could not load the pricing markets.</p>  )}

                {pricingMarketError ? (
                    <p className={pageStyles.errorMsg}>Could not load the pricing markets.</p>
                ) : pricingMarkets.length === 0 ? (
                    <p className={tableStyles.cellEmpty}>No pricing markets were found.</p>
                ) : (
                    <>
                        {/* ===== Mobile pricing market list ===== */}
                        <div className="space-y-4 lg:hidden">
                            {pricingMarkets.map((pricingMarket) => (
                                <div key={pricingMarket.id} className={tableStyles.DivCyanList}>
                                    <p><span className="font-medium text-cyan-300">Country: </span> {pricingMarket.country_name} ({pricingMarket.country_code}) </p>

                                    {/* ===== Pricing market configuration status ===== */}
                                    <p>
                                        <span className="font-medium text-cyan-300">Configuration: </span>
                                        {pricingMarket.configuration_status === "ready" ? (
                                            <span className="font-semibold text-emerald-300">✓ Ready</span>
                                        ) : (
                                            <span className="font-semibold text-yellow-300">⚠ Review required</span>
                                        )}
                                    </p>
                                    <p><span className="font-medium text-cyan-300">Currency: </span> {pricingMarket.currency_code} </p>
                                    <p><span className="font-medium text-cyan-300">Service: </span> {pricingMarket.service_category} </p>
                                    <p><span className="font-medium text-cyan-300">Time zone: </span> {pricingMarket.time_zone} </p>
                                    <p> <span className="font-medium text-cyan-300">Pricing enabled: </span>{pricingMarket.pricing_enabled ? "Yes" : "No"} </p>
                                    <p>
                                        <span className="font-medium text-cyan-300">Planned effective date: </span>
                                        {formatDate(pricingMarket.planned_effective_from)}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* ===== Desktop pricing market table ===== */}
                        <div className="hidden lg:block">
                            <table className={tableStyles.table1000}>
                                <thead className={tableStyles.tableHeaderCyan}>
                                    <tr>
                                        <th className={tableStyles.cellCaption}>Country</th>
                                        <th className={tableStyles.cellCaption}>Configuration</th>
                                        <th className={tableStyles.cellCaption}>Currency</th>
                                        <th className={tableStyles.cellCaption}>Service</th>
                                        <th className={tableStyles.cellCaption}>Time zone</th>
                                        <th className={tableStyles.cellCaption}>Pricing enabled</th>
                                        <th className={tableStyles.cellCaption}>Planned effective</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {pricingMarkets.map((pricingMarket) => (
                                        <tr key={pricingMarket.id} className={tableStyles.rowCyan}>
                                            <td className={tableStyles.cell}>
                                                {pricingMarket.country_name} ({pricingMarket.country_code})
                                            </td>
                                            {/* ===== Pricing market configuration status ===== */}
                                            <td className={tableStyles.cell}>
                                                {pricingMarket.configuration_status === "ready" ? (
                                                    <span className="font-semibold text-emerald-300">✓ Ready</span>
                                                ) : (
                                                    <span className="font-semibold text-yellow-300">⚠ Review required</span>
                                                )}
                                            </td>
                                            <td className={tableStyles.cell}>{pricingMarket.currency_code}</td>
                                            <td className={tableStyles.cell}>{pricingMarket.service_category}</td>
                                            <td className={tableStyles.cell}>{pricingMarket.time_zone}</td>
                                            <td className={tableStyles.cell}>{pricingMarket.pricing_enabled ? "Yes" : "No"}</td>
                                            <td className={tableStyles.cell}>{formatDate(pricingMarket.planned_effective_from)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}