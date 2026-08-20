import Link from "next/link";

import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supportedPricingMarkets } from "@/data/supportedPricingMarketData";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";
import PricingCountrySelector from "../PricingCountrySelector";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

type AdminRoundingRulesPageProps = {
    searchParams: Promise<{ country?: string; error?: string }>;
};

type RoundingRuleRow = {
    id: string;
    country_code: string;
    currency_code: string;
    rounding_increment: string;
    rounding_mode: string;
    status: string;
    effective_from: string;
    effective_until: string | null;
    activated_at: string | null;
};

function formatDate(dateValue: string | null): string {
    if (!dateValue) { return "Open"; }
    return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dateValue));
}

/**
 * Purpose:
 * Activates one approved currency-rounding-rule draft.
 *
 * The database closes the previous active rule exactly when the
 * new rule becomes effective, creating a continuous financial timeline.
 *
 * After activation, the administrator returns to this overview page.
 */
async function activateRoundingRuleDraft(formData: FormData) {
    "use server";

    const adminUser = await requireAdminUser();
    const roundingRuleId = String(formData.get("roundingRuleId") || "").trim();
    const countryCode = String(formData.get("countryCode") || "").trim().toUpperCase();

    const { error } = await supabaseAdmin.rpc("activate_currency_rounding_rule_draft", {
        p_rounding_rule_id: roundingRuleId,
        p_activated_by_user_id: adminUser.id,
    });

    if (error) {
        console.error("Could not activate currency rounding-rule draft:", error);
        redirect(`/admin/pricing/rounding-rules?country=${countryCode}&error=activate-draft-failed`);
    }

    redirect(`/admin/pricing/rounding-rules?country=${countryCode}`);
}

/**
 * Purpose:
 * Admin page for managing currency-rounding rules.
 *
 * Rounding rules are financial configuration and are maintained
 * independently from pricing profiles and tax rules.
 */
export default async function AdminRoundingRulesPage({ searchParams }: AdminRoundingRulesPageProps) {
    await requireAdminUser();

    const pageSearchParams = await searchParams;
    const enabledPricingMarkets = supportedPricingMarkets.filter((supportedMarket) => supportedMarket.pricingEnabled);
    const requestedCountryCode = String(pageSearchParams.country || "").trim().toUpperCase();
    const selectedPricingMarket = enabledPricingMarkets.find((supportedMarket) => supportedMarket.countryCode === requestedCountryCode) ?? enabledPricingMarkets[0];
    const selectedCountryCode = selectedPricingMarket.countryCode;
    const { data: roundingRuleData, error: roundingRuleError } = await supabaseAdmin
        .from("currency_rounding_rules")
        .select(`
            id,
            country_code,
            currency_code,
            rounding_increment,
            rounding_mode,
            status,
            effective_from,
            effective_until,
            activated_at
        `)
        .eq("country_code", selectedCountryCode)
        .eq("currency_code", selectedPricingMarket.currencyCode)
        .order("effective_from", { ascending: false });

    if (roundingRuleError) { console.error("Could not load currency rounding rules:", roundingRuleError); }

    const roundingRules = (roundingRuleData ?? []) as RoundingRuleRow[];

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                    <Link href="/admin" className={formStyles.link}>← Back to admin</Link>
                    <span className="text-slate-600">|</span>
                    <Link href={`/admin/pricing?country=${selectedCountryCode}`} className={formStyles.link}>Pricing</Link>
                    <span className="text-slate-600">|</span>
                    <Link href={`/admin/pricing/tax-rules?country=${selectedCountryCode}`} className={formStyles.link}>Tax rules</Link>
                </div>

                <p className={pageStyles.pageLabelUpper}>Financial configuration</p>
                <h1 className={pageStyles.pageTitle}>Currency rounding rules management</h1>

                <p className={pageStyles.pageDescription}>
                    Manage currency-rounding rules and their effective periods for each supported pricing market.
                </p>

                {/* =========Select a country============ */}
                <div className="mb-6 max-w-sm">
                    <PricingCountrySelector selectedCountryCode={selectedCountryCode} pricingMarkets={enabledPricingMarkets}
                        basePath="/admin/pricing/rounding-rules"
                    />
                </div>

                {/**
                 * Show activation error message when:
                 * - effective_from <= NOW()
                 * - effective_until is not empty
                 * - status is not draft
                 * - latest active rule is not open-ended
                 */}
                {pageSearchParams.error === "activate-draft-failed" && (
                    <p className={pageStyles.errorMsg}>
                        Could not activate the draft. Check that the effective-from date is in the future and effective-until is empty.
                    </p>
                )}

                {/* =========Show the rounding rules in a table ============ */}
                {roundingRules.length === 0 ? (
                    <p className={tableStyles.cellEmpty}>No currency rounding rules were found for this country.</p>
                ) : (
                    <>
                        {/* =========desktop table============ */}
                        <div className="hidden lg:block">
                            <table className={tableStyles.table1000}>
                                <thead className={tableStyles.tableHeaderCyan}>
                                    <tr>
                                        <th className={tableStyles.cellCaption}>Currency</th>
                                        <th className={tableStyles.cellCaption}>Increment</th>
                                        <th className={tableStyles.cellCaption}>Mode</th>
                                        <th className={tableStyles.cellCaption}>Status</th>
                                        <th className={tableStyles.cellCaption}>Effective from</th>
                                        <th className={tableStyles.cellCaption}>Effective until</th>
                                        <th className={tableStyles.cellCaption}>Activated</th>
                                        <th className={tableStyles.cellCaption}>Actions</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {roundingRules.map((roundingRule) => (
                                        <tr key={roundingRule.id} className={tableStyles.rowCyan}>
                                            <td className={tableStyles.cell}>{roundingRule.currency_code}</td>
                                            <td className={tableStyles.cell}>{Number(roundingRule.rounding_increment)}</td>
                                            <td className={tableStyles.cell}>{roundingRule.rounding_mode}</td>
                                            <td className={tableStyles.cell}>{roundingRule.status}</td>
                                            <td className={tableStyles.cell}>{formatDate(roundingRule.effective_from)}</td>
                                            <td className={tableStyles.cell}>{formatDate(roundingRule.effective_until)}</td>
                                            <td className={tableStyles.cell}>{formatDate(roundingRule.activated_at)}</td>
                                            <td className={tableStyles.cell}>
                                                <div className="flex flex-wrap gap-2">
                                                    <Link href={`/admin/pricing/rounding-rules/${roundingRule.id}?country=${selectedCountryCode}`} 
                                                    className={formStyles.smallButton}>Edit rounding rule</Link>

                                                    {roundingRule.status === "draft" && (
                                                        <form action={activateRoundingRuleDraft}>
                                                            <input type="hidden" name="roundingRuleId" value={roundingRule.id}/>
                                                            <input type="hidden" name="countryCode" value={selectedCountryCode}/>
                                                            <button type="submit" className={formStyles.smallButton}>Activate draft</button>
                                                        </form>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* =========mobile list============= */}
                        <div className="space-y-4 lg:hidden">
                            {roundingRules.map((roundingRule) => (
                                <div key={roundingRule.id} className={tableStyles.DivCyanList}>
                                    <p><span className="font-medium text-cyan-300">Currency: </span>{roundingRule.currency_code}</p>
                                    <p><span className="font-medium text-cyan-300">Increment: </span>{Number(roundingRule.rounding_increment)}</p>
                                    <p><span className="font-medium text-cyan-300">Mode: </span>{roundingRule.rounding_mode}</p>
                                    <p><span className="font-medium text-cyan-300">Status: </span>{roundingRule.status}</p>
                                    <p><span className="font-medium text-cyan-300">Effective from: </span>{formatDate(roundingRule.effective_from)}</p>
                                    <p><span className="font-medium text-cyan-300">Effective until: </span>{formatDate(roundingRule.effective_until)}</p>
                                    <p><span className="font-medium text-cyan-300">Activated: </span>{formatDate(roundingRule.activated_at)}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Link href={`/admin/pricing/rounding-rules/${roundingRule.id}?country=${selectedCountryCode}`} className={formStyles.smallButton}>
                                            Edit rounding rule
                                        </Link>

                                        {roundingRule.status === "draft" && (
                                            <form action={activateRoundingRuleDraft}>
                                                <input type="hidden" name="roundingRuleId" value={roundingRule.id}/>
                                                <input type="hidden" name="countryCode" value={selectedCountryCode}/>
                                                <button type="submit" className={formStyles.smallButton}>Activate draft</button>
                                            </form>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}