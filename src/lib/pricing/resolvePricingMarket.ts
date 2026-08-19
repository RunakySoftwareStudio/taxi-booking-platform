import { supportedPricingMarkets } from "@/data/supportedPricingMarketData";

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
 * passenger_transport
 * Europe/Amsterdam
 *
 * The actual pricing-profile code is selected separately
 * from the pricing schedule.
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
 *  More countries can later be added to supportedPricingMarketData
 *  without changing the journey-quote calculation itself.
 */
export function resolvePricingMarket(countryCode: string): PricingMarket | null {

    const normalizedCountryCode = countryCode.trim().toUpperCase();

    const pricingMarket = supportedPricingMarkets.find(
        (supportedMarket) =>
            supportedMarket.countryCode === normalizedCountryCode &&
            supportedMarket.pricingEnabled
    );

    if (!pricingMarket) {return null;}

    return {
        countryCode: pricingMarket.countryCode,
        currencyCode: pricingMarket.currencyCode,
        serviceCategory: pricingMarket.serviceCategory,
        timeZone: pricingMarket.timeZone,
    };
}