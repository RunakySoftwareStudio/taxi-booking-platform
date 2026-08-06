import Link from "next/link";

import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";

type AdminPricingDetailPageProps = {
    params: Promise<{ pricingProfileId: string }>;
};

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
    created_at: string;
    updated_at: string;
    activated_at: string | null;
    archived_at: string | null;
};

type PricingRateRow = {
    base_fare_excluding_vat: string;
    distance_rate_per_km_excluding_vat: string;
    duration_rate_per_minute_excluding_vat: string;
    minimum_fare_excluding_vat: string;
};

type TaxRuleRow = {
    tax_name: string;
    service_category: string;
    tax_rate_percentage: string;
    status: string;
    effective_from: string;
    effective_until: string | null;
};

type RoundingRuleRow = {
    rounding_increment: string;
    rounding_mode: string;
    status: string;
    effective_from: string;
    effective_until: string | null;
};

function formatMoney(amountValue: string | number, currencyCode: string): string {
    return new Intl.NumberFormat("en-NL", {
        style: "currency",
        currency: currencyCode,
    }).format(Number(amountValue));
}

function formatDateTime(dateValue: string | null): string {
    if (!dateValue) { return "Not set"; }

    return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        hour12: false,
    }).format(new Date(dateValue));
}

function formatText(textValue: string): string {
    return textValue.replaceAll("_", " ");
}

/**
 * Purpose:
 * Displays the complete read-only configuration of one
 * versioned pricing profile.
 */
export default async function AdminPricingDetailPage({ params }: AdminPricingDetailPageProps) {
    const { pricingProfileId } = await params;
    const { data: profileData, error: profileError } = await supabaseAdmin
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
            effective_until,
            created_at,
            updated_at,
            activated_at,
            archived_at
        `)
        .eq("id", pricingProfileId)
        .maybeSingle();

    if (profileError || !profileData) {
        console.error("Could not load pricing profile:", profileError);

        return (
            <main className={pageStyles.main}>
                <div className={pageStyles.containerMedium}>
                    <Link href="/admin/pricing" className={formStyles.link}>Back to pricing</Link>
                    <h1 className={pageStyles.pageTitle}>Pricing profile details</h1>
                    <p className={pageStyles.errorMsg}>Could not load this pricing profile.</p>
                </div>
            </main>
        );
    }

    const pricingProfile = profileData as PricingProfileRow;
    const serviceCategory = "passenger_transport";
    const applicableAt = pricingProfile.effective_from;

    /*
     * Pricing rates are directly connected to the profile ID.
     *
     * Tax and rounding rules are selected using the profile's
     * market and effective date. Website language is never used.
     */
    const [rateResult, taxResult, roundingResult] = await Promise.all([
        supabaseAdmin
            .from("pricing_rates")
            .select(`
                base_fare_excluding_vat,
                distance_rate_per_km_excluding_vat,
                duration_rate_per_minute_excluding_vat,
                minimum_fare_excluding_vat
            `)
            .eq("pricing_profile_id", pricingProfile.id)
            .maybeSingle(),

        supabaseAdmin
            .from("tax_rules")
            .select(`
                tax_name,
                service_category,
                tax_rate_percentage,
                status,
                effective_from,
                effective_until
            `)
            .eq("country_code", pricingProfile.country_code)
            .eq("service_category", serviceCategory)
            .lte("effective_from", applicableAt)
            .or(`effective_until.is.null,effective_until.gt.${applicableAt}`)
            .order("effective_from", { ascending: false })
            .limit(1)
            .maybeSingle(),

        supabaseAdmin
            .from("currency_rounding_rules")
            .select(`
                rounding_increment,
                rounding_mode,
                status,
                effective_from,
                effective_until
            `)
            .eq("country_code", pricingProfile.country_code)
            .eq("currency_code", pricingProfile.currency_code)
            .lte("effective_from", applicableAt)
            .or(`effective_until.is.null,effective_until.gt.${applicableAt}`)
            .order("effective_from", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    const loadError = rateResult.error ?? taxResult.error ?? roundingResult.error;
    if (loadError) { console.error("Could not load pricing profile configuration:", loadError);}

    const pricingRate = rateResult.data as PricingRateRow | null;
    const taxRule = taxResult.data as TaxRuleRow | null;
    const roundingRule = roundingResult.data as RoundingRuleRow | null;

    const cardClass = "rounded-xl border border-cyan-400/20 bg-slate-900 p-5";
    const titleClass = "mb-4 text-lg font-semibold text-cyan-300";
    const rowClass = "mb-2 text-sm";
    const labelClass = "font-medium text-cyan-300";
    const valueClass = "text-white";

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                <Link href="/admin/pricing" className={formStyles.link}>Back to pricing</Link>

                <p className={pageStyles.pageLabelUpper}>Financial configuration</p>
                <h1 className={pageStyles.pageTitle}>{pricingProfile.pricing_profile_name}</h1>

                <p className={pageStyles.pageDescription}>
                    Read-only configuration for version {pricingProfile.pricing_profile_version}.
                </p>

                {loadError ? (<p className={pageStyles.errorMsg}>Some related pricing configuration could not be loaded.</p>) : null}

                <div className="grid gap-6 lg:grid-cols-2">
                    <section className={cardClass}>
                        <h2 className={titleClass}>Profile</h2>

                        <p className={rowClass}>
                            <span className={labelClass}>Name: </span>
                            <span className={valueClass}>{pricingProfile.pricing_profile_name}</span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Code: </span>
                            <span className={valueClass}>{pricingProfile.pricing_profile_code}</span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Version: </span>
                            <span className={valueClass}>{pricingProfile.pricing_profile_version}</span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Status: </span>
                            <span className={valueClass}>{formatText(pricingProfile.status)}</span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Market: </span>
                            <span className={valueClass}>
                                {pricingProfile.country_code} / {pricingProfile.currency_code}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Quote validity: </span>
                            <span className={valueClass}>
                                {pricingProfile.quote_validity_minutes} minutes
                            </span>
                        </p>
                    </section>

                    <section className={cardClass}>
                        <h2 className={titleClass}>Journey rates excluding VAT</h2>

                        <p className={rowClass}>
                            <span className={labelClass}>Base fare: </span>
                            <span className={valueClass}>
                                {pricingRate
                                    ? formatMoney(pricingRate.base_fare_excluding_vat, pricingProfile.currency_code)
                                    : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Per kilometre: </span>
                            <span className={valueClass}>
                                {pricingRate
                                    ? `${formatMoney(pricingRate.distance_rate_per_km_excluding_vat, pricingProfile.currency_code)}/km`
                                    : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Per minute: </span>
                            <span className={valueClass}>
                                {pricingRate
                                    ? `${formatMoney(pricingRate.duration_rate_per_minute_excluding_vat, pricingProfile.currency_code)}/minute`
                                    : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Minimum fare: </span>
                            <span className={valueClass}>
                                {pricingRate
                                    ? formatMoney(pricingRate.minimum_fare_excluding_vat, pricingProfile.currency_code)
                                    : "Missing"}
                            </span>
                        </p>
                    </section>

                    <section className={cardClass}>
                        <h2 className={titleClass}>VAT rule</h2>

                        <p className={rowClass}>
                            <span className={labelClass}>Tax name: </span>
                            <span className={valueClass}>{taxRule?.tax_name ?? "Missing"}</span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Service category: </span>
                            <span className={valueClass}>
                                {taxRule ? formatText(taxRule.service_category) : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>VAT rate: </span>
                            <span className={valueClass}>
                                {taxRule ? `${Number(taxRule.tax_rate_percentage)}%` : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Rule status: </span>
                            <span className={valueClass}>
                                {taxRule ? formatText(taxRule.status) : "Missing"}
                            </span>
                        </p>
                    </section>

                    <section className={cardClass}>
                        <h2 className={titleClass}>Currency rounding</h2>

                        <p className={rowClass}>
                            <span className={labelClass}>Increment: </span>
                            <span className={valueClass}>
                                {roundingRule
                                    ? formatMoney(roundingRule.rounding_increment, pricingProfile.currency_code)
                                    : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Mode: </span>
                            <span className={valueClass}>
                                {roundingRule ? formatText(roundingRule.rounding_mode) : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Rule status: </span>
                            <span className={valueClass}>
                                {roundingRule ? formatText(roundingRule.status) : "Missing"}
                            </span>
                        </p>
                    </section>

                    <section className={`${cardClass} lg:col-span-2`}>
                        <h2 className={titleClass}>Version lifecycle</h2>

                        <div className="grid gap-x-8 md:grid-cols-2">
                            <div>
                                <p className={rowClass}>
                                    <span className={labelClass}>Effective from: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.effective_from)}
                                    </span>
                                </p>

                                <p className={rowClass}>
                                    <span className={labelClass}>Effective until: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.effective_until)}
                                    </span>
                                </p>

                                <p className={rowClass}>
                                    <span className={labelClass}>Created: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.created_at)}
                                    </span>
                                </p>
                            </div>

                            <div>
                                <p className={rowClass}>
                                    <span className={labelClass}>Updated: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.updated_at)}
                                    </span>
                                </p>

                                <p className={rowClass}>
                                    <span className={labelClass}>Activated: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.activated_at)}
                                    </span>
                                </p>

                                <p className={rowClass}>
                                    <span className={labelClass}>Archived: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.archived_at)}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}