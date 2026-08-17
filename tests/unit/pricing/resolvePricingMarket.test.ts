import { describe, expect, it } from "vitest";

import { resolvePricingMarket } from "@/lib/pricing/resolvePricingMarket";

/**
 * Purpose:
 * Tests how a server-verified country code is converted
 * into the correct financial pricing market.
 *
 * Important:
 * Website language is not involved in this decision.
 *
 * Current rules:
 * NL → Netherlands pricing market
 * nl → normalized to NL
 * BE → not supported yet
 */
describe("resolvePricingMarket", () => {

    it("returns the Netherlands pricing market for NL", () => {
        const pricingMarket = resolvePricingMarket("NL");

        expect(pricingMarket).toEqual({
            countryCode: "NL",
            currencyCode: "EUR",
            serviceCategory: "passenger_transport",
            timeZone: "Europe/Amsterdam",
        });
    });


    it("normalizes a lowercase country code", () => {
        const pricingMarket = resolvePricingMarket("nl");

        expect(pricingMarket?.countryCode).toBe("NL");
    });


    it("returns null for a country that is not supported yet", () => {
        const pricingMarket = resolvePricingMarket("BE");

        expect(pricingMarket).toBeNull();
    });
});