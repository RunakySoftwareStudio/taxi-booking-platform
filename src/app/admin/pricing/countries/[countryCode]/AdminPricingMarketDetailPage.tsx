
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";

/**
 * Purpose:
 * Admin review page for one pricing market.
 *
 * This page will show the complete generated financial configuration
 * for a country before it can be marked ready and enabled for pricing.
 */
type AdminPricingMarketDetailPageProps = {
    params: Promise<{ countryCode: string }>;
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

/* ===== Pricing profile data ===== */
type PricingProfileRow = {
    id: string;
    pricing_profile_code: string;
    pricing_profile_name: string;
    pricing_profile_version: number;
    country_code: string;
    currency_code: string;
    quote_validity_minutes: number;
    status: string;
    effective_from: string;
    effective_until: string | null;
};

/* ===== Pricing rate data ===== */
type PricingRateRow = {
    pricing_profile_id: string;
    base_fare_excluding_vat: string;
    distance_rate_per_km_excluding_vat: string;
    duration_rate_per_minute_excluding_vat: string;
    minimum_fare_excluding_vat: string;
};

/* ===== Weekly schedule data ===== */
type PricingScheduleRow = {
    id: string;
    day_of_week: number;
    start_local_time: string;
    end_local_time: string;
    pricing_profile_code: string;
};

/* ===== Tax rule data ===== */
type TaxRuleRow = {
    id: string;
    tax_name: string;
    tax_rate_percentage: string;
    status: string;
    effective_from: string;
    effective_until: string | null;
};

/* ===== Currency rounding rule data ===== */
type CurrencyRoundingRuleRow = {
    id: string;
    currency_code: string;
    rounding_increment: string;
    rounding_mode: string;
    status: string;
    effective_from: string;
    effective_until: string | null;
};

/* ===== Weekly schedule formatting ===== */
function formatDayOfWeek(dayOfWeek: number): string {
    const dayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return dayNames[dayOfWeek] ?? `Day ${dayOfWeek}`;
}

function formatTime(timeValue: string): string {
    return timeValue.slice(0, 5);
}

/* ===== Financial date formatting ===== */
function formatDate(dateValue: string | null): string {
    if (!dateValue) { return "Open"; }
    return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dateValue));
}

/* ===== Mark pricing market ready server action ===== */
async function markPricingMarketReady(formData: FormData) {
    "use server";

    await requireAdminUser();

    /* ===== Read pricing market identity ===== */
    const countryCode = String(formData.get("countryCode") || "").trim().toUpperCase();

    if (!countryCode) { redirect("/admin/pricing/countries"); }

    /* ===== Mark reviewed market ready ===== */
    const { error } = await supabaseAdmin.rpc("mark_pricing_market_ready", {
        p_country_code: countryCode,
    });

    if (error) {
        console.error("Could not mark pricing market ready:", error);
        redirect(`/admin/pricing/countries/${countryCode}?error=mark-ready-failed`);
    }

    /* ===== Readiness completed ===== */
    redirect(`/admin/pricing/countries/${countryCode}`);
}

export default async function AdminPricingMarketDetailPage({ params, searchParams }: AdminPricingMarketDetailPageProps) {
    await requireAdminUser();

    /* ===== Read route and search parameters ===== */
    const { countryCode } = await params;
    const pageSearchParams = await searchParams;
    const selectedCountryCode = countryCode.trim().toUpperCase();

    /* ===== Load pricing market ===== */
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
        .eq("country_code", selectedCountryCode)
        .maybeSingle();

    if (pricingMarketError) { console.error("Could not load pricing market:", pricingMarketError); }
    if (!pricingMarketData) { notFound(); }

    const pricingMarket = pricingMarketData as PricingMarketRow;

    /* ===== Load pricing profiles ===== */
    const pricingProfileResult = await supabaseAdmin
        .from("pricing_profiles")
        .select(`
            id,
            pricing_profile_code,
            pricing_profile_name,
            pricing_profile_version,
            country_code,
            currency_code,
            quote_validity_minutes,
            status,
            effective_from,
            effective_until
        `)
        .eq("country_code", selectedCountryCode)
        .order("pricing_profile_code", { ascending: true })
        .order("pricing_profile_version", { ascending: false });

    if (pricingProfileResult.error) { console.error("Could not load pricing profiles:", pricingProfileResult.error); }

    const pricingProfiles = (pricingProfileResult.data ?? []) as PricingProfileRow[];
    const pricingProfileIds = pricingProfiles.map((pricingProfile) => pricingProfile.id);

    /* ===== Load pricing rates ===== */
    let pricingRates: PricingRateRow[] = [];

    if (pricingProfileIds.length > 0) {
        const pricingRateResult = await supabaseAdmin
            .from("pricing_rates")
            .select(`
                pricing_profile_id,
                base_fare_excluding_vat,
                distance_rate_per_km_excluding_vat,
                duration_rate_per_minute_excluding_vat,
                minimum_fare_excluding_vat
            `)
            .in("pricing_profile_id", pricingProfileIds);

        if (pricingRateResult.error) { console.error("Could not load pricing rates:", pricingRateResult.error); }

        pricingRates = (pricingRateResult.data ?? []) as PricingRateRow[];
    }

    /* ===== Match each pricing profile with its rates ===== */
    const rateByProfileId = new Map(pricingRates.map((pricingRate) => [pricingRate.pricing_profile_id, pricingRate]));

    /* ===== Load weekly schedule ===== */
    const { data: pricingScheduleData, error: pricingScheduleError } = await supabaseAdmin
        .from("pricing_schedules")
        .select("id, day_of_week, start_local_time, end_local_time, pricing_profile_code")
        .eq("country_code", selectedCountryCode)
        .eq("service_category", pricingMarket.service_category)
        .order("day_of_week", { ascending: true })
        .order("start_local_time", { ascending: true });

    if (pricingScheduleError) { console.error("Could not load pricing schedule:", pricingScheduleError); }
    const pricingSchedules = (pricingScheduleData ?? []) as PricingScheduleRow[];

    /* ===== Load tax rules ===== */
    const { data: taxRuleData, error: taxRuleError } = await supabaseAdmin
        .from("tax_rules")
        .select("id, tax_name, tax_rate_percentage, status, effective_from, effective_until")
        .eq("country_code", selectedCountryCode)
        .eq("service_category", pricingMarket.service_category)
        .order("effective_from", { ascending: false });

    if (taxRuleError) { console.error("Could not load tax rules:", taxRuleError); }
    const taxRules = (taxRuleData ?? []) as TaxRuleRow[];

    /* ===== Load currency rounding rules ===== */
    const { data: roundingRuleData, error: roundingRuleError } = await supabaseAdmin
        .from("currency_rounding_rules")
        .select("id, currency_code, rounding_increment, rounding_mode, status, effective_from, effective_until")
        .eq("country_code", selectedCountryCode)
        .eq("currency_code", pricingMarket.currency_code)
        .order("effective_from", { ascending: false });

    if (roundingRuleError) { console.error("Could not load currency rounding rules:", roundingRuleError); }
    const roundingRules = (roundingRuleData ?? []) as CurrencyRoundingRuleRow[];

    /* ===== Pricing market readiness summary ===== */
    const activePricingProfileCount = pricingProfiles.filter((pricingProfile) => pricingProfile.status === "active").length;
    const draftPricingProfileCount = pricingProfiles.filter((pricingProfile) => pricingProfile.status === "draft").length;
    const hasApprovedTaxRule = taxRules.some((taxRule) => taxRule.status === "active");
    const hasApprovedRoundingRule = roundingRules.some((roundingRule) => roundingRule.status === "active");

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>

                {/* ===== Page navigation ===== */}
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                    <Link href="/admin" className={formStyles.link}>← Back to admin</Link>
                    <span className="text-slate-600">|</span>
                    <Link href="/admin/pricing/countries" className={formStyles.link}>Pricing markets</Link>
                </div>

                {/* ===== Page title and description ===== */}
                <p className={pageStyles.pageLabelUpper}>Financial configuration</p>
                <h1 className={pageStyles.pageTitle}>{pricingMarket.country_name} ({pricingMarket.country_code})</h1>

                <p className={pageStyles.pageDescription}>
                    Review the generated financial configuration before this pricing market is marked ready.
                </p>

                {/* ===== Market information ===== */}
                <section className="mt-6">
                    <h2 className="mb-3 text-lg font-semibold text-cyan-300">Market information</h2>
                    <p>Currency: {pricingMarket.currency_code}</p>
                    <p>Service: {pricingMarket.service_category}</p>
                    <p>Time zone: {pricingMarket.time_zone}</p>
                    <p>Configuration: {pricingMarket.configuration_status}</p>
                    <p>Pricing enabled: {pricingMarket.pricing_enabled ? "Yes" : "No"}</p>
                </section>

                {/* ===== Pricing profiles ===== */}
                <section className="mt-8">
                    <h2 className="mb-3 text-lg font-semibold text-cyan-300">Pricing profiles</h2>

                    <p className="mb-4 text-sm text-slate-400">
                        Review the generated pricing profiles and starter rates for this market.
                    </p>

                    {pricingProfiles.length === 0 ? (
                        <p className={tableStyles.cellEmpty}>No pricing profiles were found for this market.</p>
                    ) : (
                        <>
                            {/* ===== Mobile pricing profile list ===== */}
                            <div className="space-y-4 lg:hidden">
                                {pricingProfiles.map((pricingProfile) => {
                                    const pricingRate = rateByProfileId.get(pricingProfile.id);

                                    return (
                                        <div key={pricingProfile.id} className={tableStyles.DivCyanList}>
                                            <p><span className="font-medium text-cyan-300">Profile: </span>{pricingProfile.pricing_profile_name}</p>
                                            <p><span className="font-medium text-cyan-300">Code: </span>{pricingProfile.pricing_profile_code}</p>
                                            <p><span className="font-medium text-cyan-300">Status: </span>{pricingProfile.status}</p>
                                            <p><span className="font-medium text-cyan-300">Base fare: </span>{pricingMarket.currency_code} {Number(pricingRate?.base_fare_excluding_vat ?? 0).toFixed(2)}</p>
                                            <p><span className="font-medium text-cyan-300">Per km: </span>{pricingMarket.currency_code} {Number(pricingRate?.distance_rate_per_km_excluding_vat ?? 0).toFixed(2)}</p>
                                            <p><span className="font-medium text-cyan-300">Per minute: </span>{pricingMarket.currency_code} {Number(pricingRate?.duration_rate_per_minute_excluding_vat ?? 0).toFixed(2)}</p>
                                            <p><span className="font-medium text-cyan-300">Minimum fare: </span>{pricingMarket.currency_code} {Number(pricingRate?.minimum_fare_excluding_vat ?? 0).toFixed(2)}</p>
                                            
                                            {/* ===== Pricing profile review action ===== */}
                                            <div className="mt-3">
                                                <Link href={`/admin/pricing/${pricingProfile.id}?country=${selectedCountryCode}`} className={formStyles.smallButton}>Review profile</Link>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ===== Desktop pricing profile table ===== */}
                            <div className="hidden lg:block">
                                <table className={tableStyles.table1000}>
                                    <thead className={tableStyles.tableHeaderCyan}>
                                        <tr>
                                            <th className={tableStyles.cellCaption}>Profile</th>
                                            <th className={tableStyles.cellCaption}>Status</th>
                                            <th className={tableStyles.cellCaption}>Base fare</th>
                                            <th className={tableStyles.cellCaption}>Per km</th>
                                            <th className={tableStyles.cellCaption}>Per minute</th>
                                            <th className={tableStyles.cellCaption}>Minimum fare</th>
                                            <th className={tableStyles.cellCaption}>Action</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {pricingProfiles.map((pricingProfile) => {
                                            const pricingRate = rateByProfileId.get(pricingProfile.id);

                                            return (
                                                <tr key={pricingProfile.id} className={tableStyles.rowCyan}>
                                                    <td className={tableStyles.cell}>{pricingProfile.pricing_profile_name}</td>
                                                    <td className={tableStyles.cell}>{pricingProfile.status}</td>
                                                    <td className={tableStyles.cell}>{pricingMarket.currency_code} {Number(pricingRate?.base_fare_excluding_vat ?? 0).toFixed(2)}</td>
                                                    <td className={tableStyles.cell}>{pricingMarket.currency_code} {Number(pricingRate?.distance_rate_per_km_excluding_vat ?? 0).toFixed(2)}</td>
                                                    <td className={tableStyles.cell}>{pricingMarket.currency_code} {Number(pricingRate?.duration_rate_per_minute_excluding_vat ?? 0).toFixed(2)}</td>
                                                    <td className={tableStyles.cell}>{pricingMarket.currency_code} {Number(pricingRate?.minimum_fare_excluding_vat ?? 0).toFixed(2)}</td>
                                                    {/* ===== Pricing profile review action ===== */}
                                                    <td className={tableStyles.cell}>
                                                        <Link href={`/admin/pricing/${pricingProfile.id}?country=${selectedCountryCode}`} className={formStyles.smallButton}>Review profile</Link>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </section>

                {/* ===== Weekly schedule ===== */}
                <section className="mt-8">
                    <h2 className="mb-3 text-lg font-semibold text-cyan-300">Weekly schedule</h2>

                    <p className="mb-4 text-sm text-slate-400">
                        Review which pricing profile is selected for each recurring day and time period.
                    </p>

                    {pricingSchedules.length === 0 ? (
                        <p className={tableStyles.cellEmpty}>No weekly pricing schedule was found for this market.</p>
                    ) : (
                        <>
                            {/* ===== Mobile weekly schedule list ===== */}
                            <div className="space-y-3 lg:hidden">
                                {pricingSchedules.map((pricingSchedule) => (
                                    <div key={pricingSchedule.id} className={tableStyles.DivCyanList}>
                                        <p><span className="font-medium text-cyan-300">Day: </span>{formatDayOfWeek(pricingSchedule.day_of_week)}</p>
                                        <p><span className="font-medium text-cyan-300">Time: </span>{formatTime(pricingSchedule.start_local_time)} - {formatTime(pricingSchedule.end_local_time)}</p>
                                        <p><span className="font-medium text-cyan-300">Profile: </span>{pricingSchedule.pricing_profile_code}</p>
                                    </div>
                                ))}
                            </div>

                            {/* ===== Desktop weekly schedule table ===== */}
                            <div className="hidden lg:block">
                                <table className={tableStyles.table1000}>
                                    <thead className={tableStyles.tableHeaderCyan}>
                                        <tr>
                                            <th className={tableStyles.cellCaption}>Day</th>
                                            <th className={tableStyles.cellCaption}>From</th>
                                            <th className={tableStyles.cellCaption}>Until</th>
                                            <th className={tableStyles.cellCaption}>Pricing profile</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {pricingSchedules.map((pricingSchedule) => (
                                            <tr key={pricingSchedule.id} className={tableStyles.rowCyan}>
                                                <td className={tableStyles.cell}>{formatDayOfWeek(pricingSchedule.day_of_week)}</td>
                                                <td className={tableStyles.cell}>{formatTime(pricingSchedule.start_local_time)}</td>
                                                <td className={tableStyles.cell}>{formatTime(pricingSchedule.end_local_time)}</td>
                                                <td className={tableStyles.cell}>{pricingSchedule.pricing_profile_code}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </section>

                {/* ===== Tax rule ===== */}
                <section className="mt-8">
                    <h2 className="mb-3 text-lg font-semibold text-cyan-300">Tax rule</h2>

                    <p className="mb-4 text-sm text-slate-400">
                        Review the tax configuration generated for this pricing market.
                    </p>

                    {taxRules.length === 0 ? (
                        <p className={tableStyles.cellEmpty}>No tax rules were found for this market.</p>
                    ) : (
                        <>
                            {/* ===== Mobile tax rule list ===== */}
                            <div className="space-y-4 lg:hidden">
                                {taxRules.map((taxRule) => (
                                    <div key={taxRule.id} className={tableStyles.DivCyanList}>
                                        <p><span className="font-medium text-cyan-300">Tax rule: </span>{taxRule.tax_name}</p>
                                        <p><span className="font-medium text-cyan-300">Rate: </span>{Number(taxRule.tax_rate_percentage)}%</p>

                                        {/* ===== Tax rule status ===== */}
                                        <p>
                                            <span className="font-medium text-cyan-300">Status: </span>
                                            {taxRule.status === "draft" ? (
                                                <span className="font-semibold text-yellow-300">⚠ Draft</span>
                                            ) : (
                                                <span className="font-semibold text-emerald-300">✓ Approved</span>
                                            )}
                                        </p>

                                        <p><span className="font-medium text-cyan-300">Effective from: </span>{formatDate(taxRule.effective_from)}</p>
                                        <p><span className="font-medium text-cyan-300">Effective until: </span>{formatDate(taxRule.effective_until)}</p>

                                        {/* ===== Tax rule review action ===== */}
                                        <div className="mt-3">
                                            <Link href={`/admin/pricing/tax-rules/${taxRule.id}?country=${selectedCountryCode}&returnTo=country-review`} 
                                                className={formStyles.smallButton}> Review tax rule
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* ===== Desktop tax rule table ===== */}
                            <div className="hidden lg:block">
                                <table className={tableStyles.table1000}>
                                    <thead className={tableStyles.tableHeaderCyan}>
                                        <tr>
                                            <th className={tableStyles.cellCaption}>Tax rule</th>
                                            <th className={tableStyles.cellCaption}>Rate</th>
                                            <th className={tableStyles.cellCaption}>Status</th>
                                            <th className={tableStyles.cellCaption}>Effective from</th>
                                            <th className={tableStyles.cellCaption}>Effective until</th>
                                            <th className={tableStyles.cellCaption}>Action</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {taxRules.map((taxRule) => (
                                            <tr key={taxRule.id} className={tableStyles.rowCyan}>
                                                <td className={tableStyles.cell}>{taxRule.tax_name}</td>
                                                <td className={tableStyles.cell}>{Number(taxRule.tax_rate_percentage)}%</td>

                                                {/* ===== Tax rule status ===== */}
                                                <td className={tableStyles.cell}>
                                                    {taxRule.status === "draft" ? (
                                                        <span className="font-semibold text-yellow-300">⚠ Draft</span>
                                                    ) : (
                                                        <span className="font-semibold text-emerald-300">✓ Approved</span>
                                                    )}
                                                </td>

                                                <td className={tableStyles.cell}>{formatDate(taxRule.effective_from)}</td>
                                                <td className={tableStyles.cell}>{formatDate(taxRule.effective_until)}</td>
                                                <td className={tableStyles.cell}>
                                                    <Link href={`/admin/pricing/tax-rules/${taxRule.id}?country=${selectedCountryCode}&returnTo=country-review`} 
                                                        className={formStyles.smallButton}> Review tax rule
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </section>

                {/* ===== Currency rounding rule ===== */}
                <section className="mt-8">
                    <h2 className="mb-3 text-lg font-semibold text-cyan-300">Currency rounding rule</h2>

                    <p className="mb-4 text-sm text-slate-400">
                        Review the currency rounding configuration generated for this pricing market.
                    </p>

                    {roundingRules.length === 0 ? (
                        <p className={tableStyles.cellEmpty}>No currency rounding rules were found for this market.</p>
                    ) : (
                        <>
                            {/* ===== Mobile currency rounding rule list ===== */}
                            <div className="space-y-4 lg:hidden">
                                {roundingRules.map((roundingRule) => (
                                    <div key={roundingRule.id} className={tableStyles.DivCyanList}>
                                        <p><span className="font-medium text-cyan-300">Currency: </span>{roundingRule.currency_code}</p>
                                        <p><span className="font-medium text-cyan-300">Increment: </span>{Number(roundingRule.rounding_increment).toFixed(2)}</p>
                                        <p><span className="font-medium text-cyan-300">Mode: </span>{roundingRule.rounding_mode}</p>

                                        {/* ===== Currency rounding rule status ===== */}
                                        <p>
                                            <span className="font-medium text-cyan-300">Status: </span>
                                            {roundingRule.status === "draft" ? (
                                                <span className="font-semibold text-yellow-300">⚠ Draft</span>
                                            ) : (
                                                <span className="font-semibold text-emerald-300">✓ Approved</span>
                                            )}
                                        </p>

                                        <p><span className="font-medium text-cyan-300">Effective from: </span>{formatDate(roundingRule.effective_from)}</p>
                                        <p><span className="font-medium text-cyan-300">Effective until: </span>{formatDate(roundingRule.effective_until)}</p>

                                        {/* ===== Currency rounding rule review action ===== */}
                                        <div className="mt-3">
                                            <Link href={`/admin/pricing/rounding-rules/${roundingRule.id}?country=${selectedCountryCode}&returnTo=country-review`} 
                                            className={formStyles.smallButton}>Review rounding rule</Link>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* ===== Desktop currency rounding rule table ===== */}
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
                                            <th className={tableStyles.cellCaption}>Action</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {roundingRules.map((roundingRule) => (
                                            <tr key={roundingRule.id} className={tableStyles.rowCyan}>
                                                <td className={tableStyles.cell}>{roundingRule.currency_code}</td>
                                                <td className={tableStyles.cell}>{Number(roundingRule.rounding_increment).toFixed(2)}</td>
                                                <td className={tableStyles.cell}>{roundingRule.rounding_mode}</td>

                                                {/* ===== Currency rounding rule status ===== */}
                                                <td className={tableStyles.cell}>
                                                    {roundingRule.status === "draft" ? (
                                                        <span className="font-semibold text-yellow-300">⚠ Draft</span>
                                                    ) : (
                                                        <span className="font-semibold text-emerald-300">✓ Approved</span>
                                                    )}
                                                </td>

                                                <td className={tableStyles.cell}>{formatDate(roundingRule.effective_from)}</td>
                                                <td className={tableStyles.cell}>{formatDate(roundingRule.effective_until)}</td>
                                                <td className={tableStyles.cell}>
                                                    <Link href={`/admin/pricing/rounding-rules/${roundingRule.id}?country=${selectedCountryCode}&returnTo=country-review`} 
                                                    className={formStyles.smallButton}>Review rounding rule</Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </section>

                {/* ===== Readiness ===== */}
                <section className="mt-8">
                    <h2 className="mb-3 text-lg font-semibold text-cyan-300">Readiness</h2>

                    <p className="mb-4 text-sm text-slate-400">
                        Review the financial configuration that must be completed before this pricing market can be marked ready.
                    </p>

                    <div className={tableStyles.DivCyanList}>

                        {/* ===== Pricing profile readiness ===== */}
                        <p>
                            <span className="font-medium text-cyan-300">Pricing profiles: </span>
                            {draftPricingProfileCount === 0 && activePricingProfileCount > 0 ? (
                                <span className="font-semibold text-emerald-300">✓ {activePricingProfileCount} approved</span>
                            ) : (
                                <span className="font-semibold text-yellow-300">⚠ {draftPricingProfileCount} draft / {activePricingProfileCount} approved</span>
                            )}
                        </p>

                        {/* ===== Weekly schedule readiness ===== */}
                        <p>
                            <span className="font-medium text-cyan-300">Weekly schedule: </span>
                            {pricingSchedules.length > 0 ? (
                                <span className="font-semibold text-emerald-300">✓ {pricingSchedules.length} schedule rows</span>
                            ) : (
                                <span className="font-semibold text-yellow-300">⚠ Missing schedule</span>
                            )}
                        </p>

                        {/* ===== Tax readiness ===== */}
                        <p>
                            <span className="font-medium text-cyan-300">Tax rule: </span>
                            {hasApprovedTaxRule ? (
                                <span className="font-semibold text-emerald-300">✓ Approved</span>
                            ) : (
                                <span className="font-semibold text-yellow-300">⚠ Review required</span>
                            )}
                        </p>

                        {/* ===== Rounding readiness ===== */}
                        <p>
                            <span className="font-medium text-cyan-300">Currency rounding rule: </span>
                            {hasApprovedRoundingRule ? (
                                <span className="font-semibold text-emerald-300">✓ Approved</span>
                            ) : (
                                <span className="font-semibold text-yellow-300">⚠ Review required</span>
                            )}
                        </p>

                        {/* ===== Market status ===== */}
                        <p>
                            <span className="font-medium text-cyan-300">Market status: </span>
                            {pricingMarket.configuration_status === "ready" ? (
                                <span className="font-semibold text-emerald-300">✓ Ready</span>
                            ) : (
                                <span className="font-semibold text-yellow-300">⚠ Review required</span>
                            )}
                        </p>

                    </div>
                </section>

                {/* ===== Page error messages ===== */}
                {pageSearchParams.error && (
                    <p className={pageStyles.errorMsg}>Could not complete the requested pricing-market action.</p>
                )}
                {/* ===== Mark pricing market ready action ===== */}
                {pricingMarket.configuration_status === "review_required" && (
                    <form action={markPricingMarketReady} className="mt-4">
                        <input type="hidden" name="countryCode" value={selectedCountryCode} />
                        <button type="submit" className={formStyles.smallButton}>Mark ready</button>
                    </form>
                )}
            </div>
        </main>
    );
}