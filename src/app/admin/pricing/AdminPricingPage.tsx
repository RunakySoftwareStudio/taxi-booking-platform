import Link from "next/link";

import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";

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
 * Creates Version 1 of a completely new pricing-profile family.
 *
 * The administrator selects a business purpose.
 * The server translates that purpose into the stable profile code
 * and name. The browser is therefore not trusted to choose the
 * actual financial identity.
 */
async function createPricingProfileFamily(formData: FormData) {
    "use server";

    const adminUser = await requireAdminUser();
    const pricingPurpose = String(formData.get("pricingPurpose") || "").trim();

    let pricingProfileCode = "";
    let pricingProfileName = "";

    if (pricingPurpose === "daytime") {
        pricingProfileCode = "NL_DAYTIME_STANDARD";
        pricingProfileName = "Netherlands Daytime Standard";
    }

    if (pricingPurpose === "night") {
        pricingProfileCode = "NL_NIGHT_STANDARD";
        pricingProfileName = "Netherlands Night Standard";
    }

    if (pricingPurpose === "weekend") {
        pricingProfileCode = "NL_WEEKEND_STANDARD";
        pricingProfileName = "Netherlands Weekend Standard";
    }

    if (pricingPurpose === "holiday") {
        pricingProfileCode = "NL_HOLIDAY_STANDARD";
        pricingProfileName = "Netherlands Holiday Standard";
    }

    if (pricingPurpose === "event") {
        pricingProfileCode = "NL_EVENT_STANDARD";
        pricingProfileName = "Netherlands Event Standard";
    }

    if (!pricingProfileCode) {
        redirect("/admin/pricing?error=invalid-pricing-purpose");
    }

    const { data: newPricingProfileId, error } = await supabaseAdmin.rpc(
        "create_pricing_profile_family",
        {
            p_pricing_profile_code: pricingProfileCode,
            p_pricing_profile_name: pricingProfileName,
            p_country_code: "NL",
            p_currency_code: "EUR",
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
                <form action={createPricingProfileFamily} className="mb-8">
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