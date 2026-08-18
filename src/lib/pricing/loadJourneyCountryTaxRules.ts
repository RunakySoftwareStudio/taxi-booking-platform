import "server-only";

import { supabaseAdmin } from "@/lib/supabaseServer";
import type { CountryTaxRule } from "@/types/countryTaxRuleType";

export type JourneyCountryTaxRule = {
    taxRuleId: string;
    taxRule: CountryTaxRule;
};

type TaxRuleRow = {
    id: string;
    country_code: string;
    tax_name: string;
    service_category: string;
    tax_rate_percentage: number | string;
    effective_from: string;
    effective_until: string | null;
};

/**
 * Purpose:
 * Loads the active tax rule for every country crossed by a journey.
 *
 * The tax rule is selected using the planned journey timestamp.
 *
 * Example:
 * Amsterdam -> Brussels
 *
 * ["NL", "BE"]
 *      ↓
 * NL -> applicable tax rule
 * BE -> applicable tax rule
 *
 * If even one required country has no applicable tax rule,
 * the quote must fail rather than guess a tax rate.
 */
export async function loadJourneyCountryTaxRules(countryCodes: string[], serviceCategory: string, taxEffectiveAt: Date): Promise<JourneyCountryTaxRule[]> {

    const taxEffectiveAtIso = taxEffectiveAt.toISOString();

    const { data, error } = await supabaseAdmin
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
        .in("country_code", countryCodes)
        .eq("service_category", serviceCategory)
        .eq("status", "active")
        .lte("effective_from", taxEffectiveAtIso)
        .or(`effective_until.is.null,effective_until.gt.${taxEffectiveAtIso}`);

    if (error) {
        console.error("Journey country tax-rule query error:", error);
        throw new Error("Could not load journey country tax rules.");
    }

    const taxRuleRows = (data ?? []) as TaxRuleRow[];

    for (const countryCode of countryCodes) {
        const matchingRules = taxRuleRows.filter(
            (taxRuleRow) => taxRuleRow.country_code === countryCode
        );

        if (matchingRules.length === 0) {
            throw new Error( `No active tax rule is available for ${countryCode}.`);
        }

        if (matchingRules.length > 1) {
            throw new Error(`Multiple active tax rules are available for ${countryCode}.` );
        }
    }

    return taxRuleRows.map((taxRuleRow) => ({
        taxRuleId: taxRuleRow.id,

        taxRule: {
            countryCode: taxRuleRow.country_code,
            taxName: taxRuleRow.tax_name,
            serviceCategory: taxRuleRow.service_category,
            taxRatePercentage: Number(taxRuleRow.tax_rate_percentage),
            effectiveFrom: taxRuleRow.effective_from,
            effectiveUntil: taxRuleRow.effective_until,
        },
    }));
}