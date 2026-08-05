import type { CountryRoundingRule } from "@/types/countryRoundingRuleType";
import type { CountryTaxRule } from "@/types/countryTaxRuleType";
import type { PricingProfile } from "@/types/pricingProfileType";

/**
 * Purpose:
 * Combines the exact database configuration records required
 * to calculate and store one journey quote.
 *
 * The three IDs are stored on journey_quotes for historical
 * tracing.
 *
 * The nested objects use the existing calculation-facing types,
 * so the current pricing engine does not need to understand
 * database column names.
 * Why both IDs and objects are needed
    The objects are used for calculation:
        pricingProfile → basic journey fare
        taxRule → VAT calculation
        roundingRule → final currency rounding

    The IDs are used when saving the quote:
        pricingProfileId → journey_quotes.pricing_profile_id
        taxRuleId        → journey_quotes.tax_rule_id
        roundingRuleId   → journey_quotes.rounding_rule_id
        quoteValidityMinutes→ determines expires_at
*/

export type JourneyPricingConfiguration = {
    pricingProfileId: string;
    taxRuleId: string;
    roundingRuleId: string;

    quoteValidityMinutes: number;

    pricingProfile: PricingProfile;
    taxRule: CountryTaxRule;
    roundingRule: CountryRoundingRule;
};