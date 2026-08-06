import Link from "next/link";

import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";

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
 * Purpose:
 * Displays a read-only overview of all versioned pricing profiles
 * and their matching rate records.
 */
export default async function AdminPricingPage() {
    const [profileResult, rateResult] = await Promise.all([
        supabaseAdmin
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
            .order("pricing_profile_code", { ascending: true })
            .order("pricing_profile_version", { ascending: false }),

        supabaseAdmin
            .from("pricing_rates")
            .select(`
                pricing_profile_id,
                base_fare_excluding_vat,
                distance_rate_per_km_excluding_vat,
                duration_rate_per_minute_excluding_vat,
                minimum_fare_excluding_vat
            `),
    ]);

    const loadError = profileResult.error ?? rateResult.error;

    if (loadError) {
        console.error("Could not load pricing configuration:", loadError);

        return (
            <main className={pageStyles.main}>
                <div className={pageStyles.containerMedium}>
                    <h1 className={pageStyles.pageTitle}>Pricing management</h1>
                    <p className={pageStyles.errorMsg}>Could not load pricing configuration.</p>
                </div>
            </main>
        );
    }

    const pricingProfiles = (profileResult.data ?? []) as PricingProfileRow[];
    const pricingRates = (rateResult.data ?? []) as PricingRateRow[];

    const rateByProfileId = new Map(
        pricingRates.map((pricingRate) => [pricingRate.pricing_profile_id, pricingRate])
    );

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                <Link href="/admin" className={formStyles.link}>Back to admin</Link>

                <p className={pageStyles.pageLabelUpper}>Financial configuration</p>
                <h1 className={pageStyles.pageTitle}>Pricing management</h1>

                <p className={pageStyles.pageDescription}>
                    Read-only overview of all pricing-profile versions and their configured rates.
                </p>

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
                                                        {pricingProfile.pricing_profile_code}
                                                        {" - V"}
                                                        {pricingProfile.pricing_profile_version}
                                                    </div>
                                                </td>

                                                <td className={tableStyles.cell}>
                                                    {pricingProfile.country_code}
                                                    {" / "}
                                                    {pricingProfile.currency_code}
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