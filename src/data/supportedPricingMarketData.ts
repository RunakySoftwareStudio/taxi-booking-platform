import type { SupportedPricingMarket } from "@/types/supportedPricingMarketType";


/**
 * Purpose:
 * Stores the stable identity of financial markets known by Voya Taxi.
 *
 * Important:
 * This file does NOT store:
 * - VAT percentages;
 * - journey rates;
 * - currency-rounding rules;
 * - effective dates.
 *
 * Those changing financial rules are stored in Supabase.
 *
 * pricingEnabled:
 * true  = journeys may currently start in this pricing market.
 * false = the country may be known for cross-border tax purposes,
 *         but complete pickup pricing is not yet configured.
 */
export const supportedPricingMarkets: SupportedPricingMarket[] = [
    {
        countryCode: "NL",
        countryName: "Netherlands",
        currencyCode: "EUR",
        serviceCategory: "passenger_transport",
        timeZone: "Europe/Amsterdam",
        pricingEnabled: true,
    },
    {
        countryCode: "BE",
        countryName: "Belgium",
        currencyCode: "EUR",
        serviceCategory: "passenger_transport",
        timeZone: "Europe/Brussels",
        pricingEnabled: true,
    },
];