import Link from "next/link";

import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";
import { supportedPricingMarkets } from "@/data/supportedPricingMarketData";
import PricingCountrySelector from "../PricingCountrySelector";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

/**
 * Purpose:
 * Admin page for managing country tax rules.
 *
 * Tax rules are maintained separately from pricing profiles because
 * VAT is a financial/legal configuration that can change independently
 * from journey pricing.
 */
type AdminTaxRulesPageProps = {searchParams: Promise<{ country?: string; error?: string }>;};
type TaxRuleRow = {
    id: string;
    country_code: string;
    tax_name: string;
    service_category: string;
    tax_rate_percentage: string;
    status: string;
    effective_from: string;
    effective_until: string | null;
    activated_at: string | null;
};

function formatDate(dateValue: string | null): string {
    if (!dateValue) { return "Open"; }
    return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dateValue));
}

async function activateTaxRuleDraft(formData: FormData) {
    "use server";

    const adminUser = await requireAdminUser();
    const taxRuleId = String(formData.get("taxRuleId") || "").trim();
    const countryCode = String(formData.get("countryCode") || "").trim().toUpperCase();

    if (!taxRuleId) { redirect(`/admin/pricing/tax-rules?country=${countryCode}`); }

    const { error } = await supabaseAdmin.rpc("activate_tax_rule_draft", {
        p_tax_rule_id: taxRuleId,
        p_activated_by_user_id: adminUser.id,
    });

    if (error) {
        console.error("Could not activate tax-rule draft:", error);
        redirect(`/admin/pricing/tax-rules?country=${countryCode}&error=activate-draft-failed`);
    }

    redirect(`/admin/pricing/tax-rules?country=${countryCode}`);
}

export default async function AdminTaxRulesPage({ searchParams }: AdminTaxRulesPageProps) {
    await requireAdminUser();

    const pageSearchParams = await searchParams;
    
    const enabledPricingMarkets = supportedPricingMarkets.filter((supportedMarket) => supportedMarket.pricingEnabled);

    const requestedCountryCode = String(pageSearchParams.country || "").trim().toUpperCase();
    const selectedPricingMarket = enabledPricingMarkets.find((supportedMarket) => supportedMarket.countryCode === requestedCountryCode) ?? enabledPricingMarkets[0];
    const selectedCountryCode = selectedPricingMarket.countryCode;
    const { data: taxRuleData, error: taxRuleError } = await supabaseAdmin
        .from("tax_rules")
        .select(`
            id,
            country_code,
            tax_name,
            service_category,
            tax_rate_percentage,
            status,
            effective_from,
            effective_until,
            activated_at
        `)
        .eq("country_code", selectedCountryCode)
        .eq("service_category", "passenger_transport")
        .order("effective_from", { ascending: false });

    if (taxRuleError) { console.error("Could not load tax rules:", taxRuleError); }

    const taxRules = (taxRuleData ?? []) as TaxRuleRow[];

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                    <Link href="/admin" className={formStyles.link}>← Back to admin</Link>
                    <span className="text-slate-600">|</span>
                    <Link href={`/admin/pricing?country=${selectedCountryCode}`} className={formStyles.link}>Pricing</Link>
                    <span className="text-slate-600">|</span>
                    <Link href={`/admin/pricing/rounding-rules?country=${selectedCountryCode}`} className={formStyles.link}>Rounding rules</Link>
                </div>
                <p className={pageStyles.pageLabelUpper}>Financial configuration</p>
                <h1 className={pageStyles.pageTitle}>Tax rules management</h1>

                <p className={pageStyles.pageDescription}>
                    Manage VAT and tax-rule versions for each supported pricing market.
                </p>

                {/* =========Select a country============ */}
                <div className="mb-6 max-w-sm">
                    <PricingCountrySelector selectedCountryCode={selectedCountryCode} pricingMarkets={enabledPricingMarkets} basePath="/admin/pricing/tax-rules"/>
                </div>

                {/** Show error message 
                     * effective_from <= NOW()
                     * effective_until is not empty
                     * status is not draft
                     * latest active rule is not open-ended
                */}
                {pageSearchParams.error === "activate-draft-failed" && (
                    <p className={pageStyles.errorMsg}>Could not activate the draft. Check that the effective-from date is in the future and effective-until is empty.</p>
                )}

                {/** Show all tax rules in a table  */}
                {taxRules.length === 0 ? (
                    <p className={tableStyles.cellEmpty}>No tax rules were found for this country.</p>
                ) : (
                    <>
                        {/* mobile list */}
                        <div className="space-y-4 lg:hidden">
                            {taxRules.map((taxRule) => (
                                <div key={taxRule.id} className={tableStyles.DivCyanList}>
                                    <p><span className="font-medium text-cyan-300">Tax rule: </span>{taxRule.tax_name}</p>
                                    <p><span className="font-medium text-cyan-300">Rate: </span>{Number(taxRule.tax_rate_percentage)}%</p>
                                    <p><span className="font-medium text-cyan-300">Status: </span>{taxRule.status}</p>
                                    <p><span className="font-medium text-cyan-300">Effective from: </span>{formatDate(taxRule.effective_from)}</p>
                                    <p><span className="font-medium text-cyan-300">Effective until: </span>{formatDate(taxRule.effective_until)}</p>
                                    <p className="mb-3"><span className="font-medium text-cyan-300">Activated: </span>{formatDate(taxRule.activated_at)}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Link href={`/admin/pricing/tax-rules/${taxRule.id}?country=${selectedCountryCode}`} className={formStyles.smallButton}>Edit tax rule</Link>

                                        {taxRule.status === "draft" && (
                                            <form action={activateTaxRuleDraft}>
                                                <input type="hidden" name="taxRuleId" value={taxRule.id}/>
                                                <input type="hidden" name="countryCode" value={selectedCountryCode}/>
                                                <button type="submit" className={formStyles.smallButton}>Activate draft</button>
                                            </form>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* desktop table */}
                        <div className="hidden lg:block">
                            <table className={tableStyles.table1000}>
                                <thead className={tableStyles.tableHeaderCyan}>
                                    <tr>
                                        <th className={tableStyles.cellCaption}>Tax rule</th>
                                        <th className={tableStyles.cellCaption}>Rate</th>
                                        <th className={tableStyles.cellCaption}>Status</th>
                                        <th className={tableStyles.cellCaption}>Effective from</th>
                                        <th className={tableStyles.cellCaption}>Effective until</th>
                                        <th className={tableStyles.cellCaption}>Activated</th>
                                        <th className={tableStyles.cellCaption}>Actions</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {taxRules.map((taxRule) => (
                                        <tr key={taxRule.id} className={tableStyles.rowCyan}>
                                            <td className={tableStyles.cell}>{taxRule.tax_name}</td>
                                            <td className={tableStyles.cell}>{Number(taxRule.tax_rate_percentage)}%</td>
                                            <td className={tableStyles.cell}>{taxRule.status}</td>
                                            <td className={tableStyles.cell}>{formatDate(taxRule.effective_from)}</td>
                                            <td className={tableStyles.cell}>{formatDate(taxRule.effective_until)}</td>
                                            <td className={tableStyles.cell}>{formatDate(taxRule.activated_at)}</td>
                                            <td className={tableStyles.cell}>
                                                <div className="flex gap-2">
                                                    <Link href={`/admin/pricing/tax-rules/${taxRule.id}?country=${selectedCountryCode}`} className={formStyles.smallButton}>Edit tax rule</Link>
                                                    {taxRule.status === "draft" && (
                                                        <form action={activateTaxRuleDraft}>
                                                            <input type="hidden" name="taxRuleId" value={taxRule.id}/>
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
                    </>
                )}
            </div>
        </main>
    );
}