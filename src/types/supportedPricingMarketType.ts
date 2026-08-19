/**
 * Purpose:
 * Defines one financial pricing market supported by Voya Taxi.
 *
 * This contains only stable market identity information.
 *
 * Important:
 * Changing financial configuration such as VAT percentages,
 * journey rates and rounding rules belongs in Supabase.
 */
export type SupportedPricingMarket = {
    countryCode: string;
    countryName: string;
    currencyCode: string;
    serviceCategory: string;
    timeZone: string;
    pricingEnabled: boolean;
};