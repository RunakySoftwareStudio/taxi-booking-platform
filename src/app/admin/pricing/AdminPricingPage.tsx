import Link from "next/link";

import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supportedPricingMarkets } from "@/data/supportedPricingMarketData";
import PricingCountrySelector from "./PricingCountrySelector";

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

type PricingRateRow = {
    pricing_profile_id: string;
    base_fare_excluding_vat: string;
    distance_rate_per_km_excluding_vat: string;
    duration_rate_per_minute_excluding_vat: string;
    minimum_fare_excluding_vat: string;
};

type AdminPricingPageProps = {
    searchParams: Promise<{
        country?: string;
        error?: string;
    }>;
};

/**
 * Formats a database amount using the currency stored on the
 * pricing profile. This only controls display formatting.
 * It does not select the pricing market.
 */
function formatMoney(amount: string, currencyCode: string): string {
    return new Intl.NumberFormat("en-NL", {
        style: "currency",
        currency: currencyCode,
    }).format(Number(amount));
}

function formatStatus(status: string): string {
    return status.replaceAll("_", " ");
}

/**
 * Creates Version 1 of a completely new pricing-profile family.
 *
 * The administrator selects a pricing market and business purpose.
 * The server translates those selections into the stable profile code
 * and name. The browser is therefore not trusted to choose the
 * actual financial identity.
 */
async function createPricingProfileFamily(formData: FormData) {
    "use server";

    const adminUser = await requireAdminUser();
    const selectedCountryCode = String(formData.get("countryCode") || "")
        .trim()
        .toUpperCase();

    const pricingMarket = supportedPricingMarkets.find(
        (supportedMarket) =>
            supportedMarket.countryCode === selectedCountryCode &&
            supportedMarket.pricingEnabled
    );

    if (!pricingMarket) {
        redirect("/admin/pricing?error=invalid-pricing-market");
    }

    const pricingPurpose = String(formData.get("pricingPurpose") || "").trim();

    let pricingPurposeCode = "";
    let pricingPurposeName = "";

    if (pricingPurpose === "daytime") {
        pricingPurposeCode = "DAYTIME";
        pricingPurposeName = "Daytime";
    }

    if (pricingPurpose === "night") {
        pricingPurposeCode = "NIGHT";
        pricingPurposeName = "Night";
    }

    if (pricingPurpose === "weekend") {
        pricingPurposeCode = "WEEKEND";
        pricingPurposeName = "Weekend";
    }

    if (pricingPurpose === "holiday") {
        pricingPurposeCode = "HOLIDAY";
        pricingPurposeName = "Holiday";
    }

    if (pricingPurpose === "event") {
        pricingPurposeCode = "EVENT";
        pricingPurposeName = "Event";
    }

    if (!pricingPurposeCode) {
        redirect("/admin/pricing?error=invalid-pricing-purpose");
    }

    const pricingProfileCode = `${pricingMarket.countryCode}_${pricingPurposeCode}_STANDARD`;
    const pricingProfileName = `${pricingMarket.countryName} ${pricingPurposeName} Standard`;

    const { data: newPricingProfileId, error } = await supabaseAdmin.rpc(
        "create_pricing_profile_family",
        {
            p_pricing_profile_code: pricingProfileCode,
            p_pricing_profile_name: pricingProfileName,
            p_country_code: pricingMarket.countryCode,
            p_currency_code: pricingMarket.currencyCode,
            p_created_by_user_id: adminUser.id,
        }
    );

    if (error) {
        console.error("Could not create pricing-profile family:", error);
        redirect("/admin/pricing?error=create-family-failed");
    }

    if (!newPricingProfileId) {
        redirect("/admin/pricing?error=create-family-failed");
    }

    redirect(`/admin/pricing/${newPricingProfileId}`);
}

/**
 * Purpose:
 * Displays a read-only overview of all versioned pricing profiles
 * and their matching rate records.
 */
export default async function AdminPricingPage({searchParams}: AdminPricingPageProps) {

    const pageSearchParams = await searchParams;
    const enabledPricingMarkets = supportedPricingMarkets.filter((supportedMarket) => supportedMarket.pricingEnabled);

    const requestedCountryCode = String(pageSearchParams.country || "")
        .trim()
        .toUpperCase();

    const selectedPricingMarket = enabledPricingMarkets.find((supportedMarket) => supportedMarket.countryCode === requestedCountryCode) ?? enabledPricingMarkets[0];
    const selectedCountryCode = selectedPricingMarket.countryCode;

    /*
    * First load only the pricing profiles that belong to
    * the country currently selected on the page.
    */
    const profileResult = await supabaseAdmin
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


    if (profileResult.error) {
        console.error("Could not load pricing profiles:", profileResult.error);

        return (
            <main className={pageStyles.main}>
                <div className={pageStyles.containerMedium}>
                    <h1 className={pageStyles.pageTitle}> Pricing management </h1>
                    <p className={pageStyles.errorMsg}> Could not load pricing configuration.</p>
                </div>
            </main>
        );
    }

    const pricingProfiles =(profileResult.data ?? []) as PricingProfileRow[];
    const pricingProfileIds = pricingProfiles.map((pricingProfile) => pricingProfile.id);
    /*
    * Load rates only for the pricing profiles that belong
    * to the selected country.
    *
    * If the selected country has no pricing profiles yet,
    * no pricing-rate query is necessary.
    */
    let pricingRates: PricingRateRow[] = [];

    if (pricingProfileIds.length > 0) {
        const rateResult = await supabaseAdmin
            .from("pricing_rates")
            .select(`
                pricing_profile_id,
                base_fare_excluding_vat,
                distance_rate_per_km_excluding_vat,
                duration_rate_per_minute_excluding_vat,
                minimum_fare_excluding_vat
            `)
            .in("pricing_profile_id", pricingProfileIds);

        if (rateResult.error) {
            console.error("Could not load pricing rates:", rateResult.error);

            return (
                <main className={pageStyles.main}>
                    <div className={pageStyles.containerMedium}>
                        <h1 className={pageStyles.pageTitle}> Pricing management </h1>
                        <p className={pageStyles.errorMsg}> Could not load pricing configuration. </p>
                    </div>
                </main>
            );
        }

        pricingRates = (rateResult.data ?? []) as PricingRateRow[];
    }

    const rateByProfileId = new Map(pricingRates.map((pricingRate) => [pricingRate.pricing_profile_id, pricingRate]));

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                <Link href="/admin" className={formStyles.link}>Back to admin</Link>
                <p className={pageStyles.pageLabelUpper}>Financial configuration</p>
                <h1 className={pageStyles.pageTitle}>Pricing management</h1>
                <p className={pageStyles.pageDescription}>
                    Read-only overview of all pricing-profile versions and their configured rates.
                </p>

                <div className="mb-6 max-w-sm"> 
                    <PricingCountrySelector selectedCountryCode={selectedCountryCode} pricingMarkets={enabledPricingMarkets}/>
                </div>

                <form action={createPricingProfileFamily} className="mb-8">
                    <input type="hidden" name="countryCode" value={selectedCountryCode}/>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label>
                            <span className={formStyles.span}>Pricing purpose</span>
                            <select name="pricingPurpose" defaultValue="" className={formStyles.inputWFullCyan} required>
                                <option value="" disabled>Select pricing purpose</option>
                                <option value="daytime">Daytime</option>
                                <option value="night">Night</option>
                                <option value="weekend">Weekend</option>
                                <option value="holiday">Holiday</option>
                                <option value="event">Special event</option>
                            </select>
                        </label>

                        <button type="submit" className={formStyles.smallButton}>
                            Create pricing profile
                        </button>
                    </div>
                </form>
                {pricingProfiles.length === 0 ? (
                    <p className={tableStyles.cellEmpty}>No pricing profiles were found.</p>
                ) : (
                    <>
                        {/* Desktop and tablet table. */}
                        <div className="hidden lg:block">
                            <table className={tableStyles.table1000}>
                                <thead className={tableStyles.tableHeaderCyan}>
                                    <tr>
                                        <th className={tableStyles.cellCaption}>Profile</th>
                                        <th className={tableStyles.cellCaption}>Market</th>
                                        <th className={tableStyles.cellCaption}>Status</th>
                                        <th className={tableStyles.cellCaption}>Base</th>
                                        <th className={tableStyles.cellCaption}>Per km</th>
                                        <th className={tableStyles.cellCaption}>Per minute</th>
                                        <th className={tableStyles.cellCaption}>Minimum</th>
                                        <th className={tableStyles.cellCaption}>Validity</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {pricingProfiles.map((pricingProfile) => {
                                        const pricingRate = rateByProfileId.get(pricingProfile.id);
                                        return (
                                            <tr key={pricingProfile.id} className={tableStyles.rowCyan}>
                                                <td className={tableStyles.cell}>
                                                    <Link href={`/admin/pricing/${pricingProfile.id}`} className={formStyles.link}>
                                                        {pricingProfile.pricing_profile_name}
                                                    </Link>
                                                    <div>
                                                        {pricingProfile.pricing_profile_code} {" - V"} {pricingProfile.pricing_profile_version}
                                                    </div>
                                                </td>
                                                <td className={tableStyles.cell}>
                                                    {pricingProfile.country_code} {" / "} {pricingProfile.currency_code}
                                                </td>
                                                <td className={tableStyles.cell}>
                                                    {formatStatus(pricingProfile.status)}
                                                </td>
                                                <td className={tableStyles.cell}>
                                                    {pricingRate
                                                        ? formatMoney(pricingRate.base_fare_excluding_vat, pricingProfile.currency_code)
                                                        : "Missing"}
                                                </td>
                                                <td className={tableStyles.cell}>
                                                    {pricingRate
                                                        ? formatMoney(pricingRate.distance_rate_per_km_excluding_vat, pricingProfile.currency_code)
                                                        : "Missing"}
                                                </td>
                                                <td className={tableStyles.cell}>
                                                    {pricingRate
                                                        ? formatMoney(pricingRate.duration_rate_per_minute_excluding_vat, pricingProfile.currency_code)
                                                        : "Missing"}
                                                </td>
                                                <td className={tableStyles.cell}>
                                                    {pricingRate
                                                        ? formatMoney(pricingRate.minimum_fare_excluding_vat, pricingProfile.currency_code)
                                                        : "Missing"}
                                                </td>
                                                <td className={tableStyles.cell}>
                                                    {pricingProfile.quote_validity_minutes} minutes
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile list. */}
                        <div className="space-y-4 lg:hidden">
                            {pricingProfiles.map((pricingProfile) => {
                                const pricingRate = rateByProfileId.get(pricingProfile.id);

                                return (
                                    <div key={pricingProfile.id} className={tableStyles.DivCyanList}>
                                        <div className="space-y-2">
                                            <p>
                                                <span className="font-medium text-cyan-300">Profile: </span>
                                                <Link href={`/admin/pricing/${pricingProfile.id}`} className={formStyles.link}>
                                                    {pricingProfile.pricing_profile_name} - V{pricingProfile.pricing_profile_version}
                                                </Link>
                                            </p>

                                            <p>
                                                <span className="font-medium text-cyan-300">Code: </span>
                                                <span className="text-white">{pricingProfile.pricing_profile_code}</span>
                                            </p>

                                            <p>
                                                <span className="font-medium text-cyan-300">Market: </span>
                                                <span className="text-white">{pricingProfile.country_code} / {pricingProfile.currency_code}</span>
                                            </p>

                                            <p>
                                                <span className="font-medium text-cyan-300">Status: </span>
                                                <span className="text-white">{formatStatus(pricingProfile.status)}</span>
                                            </p>

                                            <p>
                                                <span className="font-medium text-cyan-300">Base fare: </span>
                                                <span className="text-white">
                                                    {pricingRate ? formatMoney(pricingRate.base_fare_excluding_vat, pricingProfile.currency_code) : "Missing"}
                                                </span>
                                            </p>

                                            <p>
                                                <span className="font-medium text-cyan-300">Per kilometre: </span>
                                                <span className="text-white">
                                                    {pricingRate ? `${formatMoney(pricingRate.distance_rate_per_km_excluding_vat, pricingProfile.currency_code)}/km` : "Missing"}
                                                </span>
                                            </p>

                                            <p>
                                                <span className="font-medium text-cyan-300">Per minute: </span>
                                                <span className="text-white">
                                                    {pricingRate ? `${formatMoney(pricingRate.duration_rate_per_minute_excluding_vat, pricingProfile.currency_code)}/minute` : "Missing"}
                                                </span>
                                            </p>

                                            <p>
                                                <span className="font-medium text-cyan-300">Minimum fare: </span>
                                                <span className="text-white">
                                                    {pricingRate ? formatMoney(pricingRate.minimum_fare_excluding_vat, pricingProfile.currency_code) : "Missing"}
                                                </span>
                                            </p>

                                            <p>
                                                <span className="font-medium text-cyan-300">Quote validity: </span>
                                                <span className="text-white">{pricingProfile.quote_validity_minutes} minutes</span>
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}