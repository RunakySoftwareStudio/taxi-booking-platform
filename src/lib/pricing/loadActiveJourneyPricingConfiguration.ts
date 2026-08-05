import "server-only";

import { supabaseAdmin } from "@/lib/supabaseServer";
import type { JourneyPricingConfiguration } from "@/types/journeyPricingConfigurationType";

/**
 * Purpose:
 * Defines which active financial configuration must be loaded
 * for one journey-price calculation.
 *
 * effectiveAt:
 * Determines which version is valid at the calculation moment.
 * The current quote API will initially use the current time.
 * Later it may use the planned journey date and time.
 * 
 *  Database snake_case rows
            ↓
    Validation and number conversion
            ↓
    Existing camelCase pricing types
            ↓
    JourneyPricingConfiguration
 */
type LoadJourneyPricingConfigurationInput = {
    pricingProfileCode: string;
    countryCode: string;
    currencyCode: string;
    serviceCategory: string;
    effectiveAt?: Date;
};

/**
 * Purpose:
 * Converts a database NUMERIC value into a trusted finite
 * JavaScript number.
 *
 * Supabase may return NUMERIC values as numbers or strings,
 * depending on the database client and generated typing.
 */
function getFiniteNumber(inputValue: unknown, fieldName: string): number {
    const convertedValue = Number(inputValue);

    if (!Number.isFinite(convertedValue)) {
        throw new Error(`Invalid numeric pricing value: ${fieldName}.`);
    }

    return convertedValue;
}

/**
 * Purpose:
 * Loads the active pricing profile, its exact rates, the
 * applicable tax rule and the applicable rounding rule.
 *
 * The returned camelCase objects can be passed directly to the
 * existing pricing calculation functions.
 */
export async function loadActiveJourneyPricingConfiguration(inputValue: LoadJourneyPricingConfigurationInput): Promise<JourneyPricingConfiguration> {
    const effectiveAt = inputValue.effectiveAt ?? new Date();
    const effectiveAtIso = effectiveAt.toISOString();

    const { data: pricingProfileRow, error: pricingProfileError } =
        await supabaseAdmin
            .from("pricing_profiles")
            .select(`
                id,
                pricing_profile_code,
                pricing_profile_version,
                country_code,
                currency_code,
                quote_validity_minutes,
                effective_from,
                effective_until
            `)
            .eq("pricing_profile_code", inputValue.pricingProfileCode)
            .eq("country_code", inputValue.countryCode)
            .eq("currency_code", inputValue.currencyCode)
            .eq("status", "active")
            .lte("effective_from", effectiveAtIso)
            .or(`effective_until.is.null,effective_until.gt.${effectiveAtIso}`)
            .maybeSingle();

    if (pricingProfileError) {
        console.error("Active pricing profile query error:", pricingProfileError);
        throw new Error("Could not load the active pricing profile.");
    }

    if (!pricingProfileRow) {
        throw new Error("No active pricing profile is available.");
    }

    const { data: pricingRatesRow, error: pricingRatesError } =
        await supabaseAdmin
            .from("pricing_rates")
            .select(`
                base_fare_excluding_vat,
                distance_rate_per_km_excluding_vat,
                duration_rate_per_minute_excluding_vat,
                minimum_fare_excluding_vat
            `)
            .eq("pricing_profile_id", pricingProfileRow.id)
            .maybeSingle();

    if (pricingRatesError) {
        console.error("Pricing rates query error:", pricingRatesError);
        throw new Error("Could not load the active pricing rates.");
    }

    if (!pricingRatesRow) {
        throw new Error("The active pricing profile has no pricing rates.");
    }

    const { data: taxRuleRow, error: taxRuleError } =
        await supabaseAdmin
            .from("tax_rules")
            .select(`
                id,
                country_code,
                tax_name,
                service_category,
                tax_rate_percentage,
                effective_from,
                effective_until
            `)
            .eq("country_code", inputValue.countryCode)
            .eq("service_category", inputValue.serviceCategory)
            .eq("status", "active")
            .lte("effective_from", effectiveAtIso)
            .or(`effective_until.is.null,effective_until.gt.${effectiveAtIso}`)
            .maybeSingle();

    if (taxRuleError) {
        console.error("Active tax rule query error:", taxRuleError);
        throw new Error("Could not load the active tax rule.");
    }

    if (!taxRuleRow) { throw new Error("No active tax rule is available."); }

    const { data: roundingRuleRow, error: roundingRuleError } =
        await supabaseAdmin
            .from("currency_rounding_rules")
            .select(`
                id,
                country_code,
                currency_code,
                rounding_increment,
                rounding_mode,
                effective_from,
                effective_until
            `)
            .eq("country_code", inputValue.countryCode)
            .eq("currency_code", inputValue.currencyCode)
            .eq("status", "active")
            .lte("effective_from", effectiveAtIso)
            .or(`effective_until.is.null,effective_until.gt.${effectiveAtIso}`)
            .maybeSingle();

    if (roundingRuleError) {
        console.error("Active rounding rule query error:", roundingRuleError);
        throw new Error("Could not load the active rounding rule.");
    }

    if (!roundingRuleRow) {
        throw new Error("No active currency rounding rule is available.");
    }

    const roundingMode = roundingRuleRow.rounding_mode;

    if (
        roundingMode !== "nearest" &&
        roundingMode !== "up" &&
        roundingMode !== "down"
    ) {
        throw new Error("The active currency rounding mode is invalid.");
    }

    return {
        pricingProfileId: pricingProfileRow.id,
        taxRuleId: taxRuleRow.id,
        roundingRuleId: roundingRuleRow.id,

        quoteValidityMinutes: getFiniteNumber(
            pricingProfileRow.quote_validity_minutes,
            "quote_validity_minutes"
        ),

        pricingProfile: {
            pricingProfileCode: pricingProfileRow.pricing_profile_code,
            pricingProfileVersion: getFiniteNumber(
                pricingProfileRow.pricing_profile_version,
                "pricing_profile_version"
            ),
            countryCode: pricingProfileRow.country_code,
            currencyCode: pricingProfileRow.currency_code,
            baseFareExcludingVat: getFiniteNumber(
                pricingRatesRow.base_fare_excluding_vat,
                "base_fare_excluding_vat"
            ),
            distanceRatePerKmExcludingVat: getFiniteNumber(
                pricingRatesRow.distance_rate_per_km_excluding_vat,
                "distance_rate_per_km_excluding_vat"
            ),
            durationRatePerMinuteExcludingVat: getFiniteNumber(
                pricingRatesRow.duration_rate_per_minute_excluding_vat,
                "duration_rate_per_minute_excluding_vat"
            ),
            minimumFareExcludingVat: getFiniteNumber(
                pricingRatesRow.minimum_fare_excluding_vat,
                "minimum_fare_excluding_vat"
            ),
            effectiveFrom: pricingProfileRow.effective_from,
            effectiveUntil: pricingProfileRow.effective_until,
        },

        taxRule: {
            countryCode: taxRuleRow.country_code,
            taxName: taxRuleRow.tax_name,
            serviceCategory: taxRuleRow.service_category,
            taxRatePercentage: getFiniteNumber(
                taxRuleRow.tax_rate_percentage,
                "tax_rate_percentage"
            ),
            effectiveFrom: taxRuleRow.effective_from,
            effectiveUntil: taxRuleRow.effective_until,
        },

        roundingRule: {
            countryCode: roundingRuleRow.country_code,
            currencyCode: roundingRuleRow.currency_code,
            roundingIncrement: getFiniteNumber(
                roundingRuleRow.rounding_increment,
                "rounding_increment"
            ),
            roundingMode,
            effectiveFrom: roundingRuleRow.effective_from,
            effectiveUntil: roundingRuleRow.effective_until,
        },
    };
}