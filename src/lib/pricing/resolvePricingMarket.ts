/**
 * Purpose:
 * Resolves the financial pricing market from a verified country code.
 *
 * Important:
 * The country code must come from server-verified journey information.
 * Website language must NEVER determine the pricing market.
 *
 * Example:
 * NL
 *  ↓
 * Netherlands pricing market
 *  ↓
 * EUR
 * NL_DAYTIME_STANDARD
 * passenger_transport
 * Europe/Amsterdam
 */

export type PricingMarket = {
    countryCode: string;
    currencyCode: string;
    serviceCategory: string;
    timeZone: string;
};


/**
 * Returns the supported pricing market for one country.
 *
 * null means Voya Taxi does not currently have a pricing
 * configuration for that country.
 *
 * More countries can later be added here without changing
 * the journey-quote calculation itself.
 */
export function resolvePricingMarket(countryCode: string): PricingMarket | null {

    const normalizedCountryCode = countryCode.trim().toUpperCase();
    if (normalizedCountryCode === "NL") {
        return {
            countryCode: "NL",
            currencyCode: "EUR",
            serviceCategory: "passenger_transport",
            timeZone: "Europe/Amsterdam",
        };
    }
    return null;
}