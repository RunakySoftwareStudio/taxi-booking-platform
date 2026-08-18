import { describe, expect, it } from "vitest";

import { calculateJourneyQuoteTaxAllocations } from "@/lib/pricing/calculateJourneyQuoteTaxAllocations";
import type { RouteCountryDistance } from "@/lib/pricing/calculateRouteCountryDistances";
import type { JourneyCountryTaxRule } from "@/lib/pricing/loadJourneyCountryTaxRules";

describe("calculateJourneyQuoteTaxAllocations", () => {
    it("allocates the fare by country distance and calculates VAT per country", () => {
        /*
         * Simple test route:
         *
         * NL = 60 km = 60%
         * BE = 40 km = 40%
         *
         * Total fare excluding VAT = €100
         *
         * Therefore:
         * NL receives €60
         * BE receives €40
         *
         * The BE 21% rate below is only test data for verifying
         * the calculation. It is not production tax configuration.
         */
        const countryDistances: RouteCountryDistance[] = [
            {
                countryCode: "NL",
                countryName: "Netherlands",
                distanceMeters: 60_000,
                distanceKilometers: 60,
            },
            {
                countryCode: "BE",
                countryName: "Belgium",
                distanceMeters: 40_000,
                distanceKilometers: 40,
            },
        ];

        const countryTaxRules: JourneyCountryTaxRule[] = [
            {
                taxRuleId: "nl-tax-rule",
                taxRule: {
                    countryCode: "NL",
                    taxName: "VAT",
                    serviceCategory: "passenger_transport",
                    taxRatePercentage: 9,
                    effectiveFrom: "2026-01-01T00:00:00.000Z",
                    effectiveUntil: null,
                },
            },
            {
                taxRuleId: "be-test-tax-rule",
                taxRule: {
                    countryCode: "BE",
                    taxName: "VAT",
                    serviceCategory: "passenger_transport",
                    taxRatePercentage: 21,
                    effectiveFrom: "2026-01-01T00:00:00.000Z",
                    effectiveUntil: null,
                },
            },
        ];

        const allocations = calculateJourneyQuoteTaxAllocations(
            100,
            countryDistances,
            countryTaxRules
        );

        expect(allocations).toHaveLength(2);

        expect(allocations[0]).toEqual({
            countryCode: "NL",
            taxRuleId: "nl-tax-rule",
            distanceKilometers: 60,
            allocatedFareExcludingVat: 60,
            taxRatePercentage: 9,
            vatAmount: 5.4,
            amountIncludingVat: 65.4,
        });

        expect(allocations[1]).toEqual({
            countryCode: "BE",
            taxRuleId: "be-test-tax-rule",
            distanceKilometers: 40,
            allocatedFareExcludingVat: 40,
            taxRatePercentage: 21,
            vatAmount: 8.4,
            amountIncludingVat: 48.4,
        });

        const allocatedFareTotal = allocations.reduce(
            (totalAmount, allocation) =>
                totalAmount + allocation.allocatedFareExcludingVat,
            0
        );

        expect(allocatedFareTotal).toBe(100);
    });

    /**
         €100.0000 total fare
        → NL €33.3333
        → BE €66.6667
        → reconstructed total €100.0000 ✅
     */
    it("assigns the small allocation remainder to the final country", () => {
    const countryDistances: RouteCountryDistance[] = [
        {
            countryCode: "NL",
            countryName: "Netherlands",
            distanceMeters: 1,
            distanceKilometers: 0.001,
        },
        {
            countryCode: "BE",
            countryName: "Belgium",
            distanceMeters: 2,
            distanceKilometers: 0.002,
        },
    ];

    const countryTaxRules: JourneyCountryTaxRule[] = [
        {
            taxRuleId: "nl-tax-rule",
            taxRule: {
                countryCode: "NL",
                taxName: "VAT",
                serviceCategory: "passenger_transport",
                taxRatePercentage: 9,
                effectiveFrom: "2026-01-01T00:00:00.000Z",
                effectiveUntil: null,
            },
        },
        {
            taxRuleId: "be-test-tax-rule",
            taxRule: {
                countryCode: "BE",
                taxName: "VAT",
                serviceCategory: "passenger_transport",
                taxRatePercentage: 21,
                effectiveFrom: "2026-01-01T00:00:00.000Z",
                effectiveUntil: null,
            },
        },
    ];

    const allocations = calculateJourneyQuoteTaxAllocations(
            100,
            countryDistances,
            countryTaxRules
        );

        expect(allocations[0].allocatedFareExcludingVat).toBe(33.3333);
        expect(allocations[1].allocatedFareExcludingVat).toBe(66.6667);

        const allocatedFareTotal = allocations.reduce(
            (totalAmount, allocation) =>
                totalAmount + allocation.allocatedFareExcludingVat,
            0
        );

        expect(allocatedFareTotal).toBe(100);
    });

    it("rejects the calculation when a route country has no tax rule", () => {
        const countryDistances: RouteCountryDistance[] = [
            {
                countryCode: "NL",
                countryName: "Netherlands",
                distanceMeters: 60_000,
                distanceKilometers: 60,
            },
            {
                countryCode: "BE",
                countryName: "Belgium",
                distanceMeters: 40_000,
                distanceKilometers: 40,
            },
        ];

        const countryTaxRules: JourneyCountryTaxRule[] = [
            {
                taxRuleId: "nl-tax-rule",
                taxRule: {
                    countryCode: "NL",
                    taxName: "VAT",
                    serviceCategory: "passenger_transport",
                    taxRatePercentage: 9,
                    effectiveFrom: "2026-01-01T00:00:00.000Z",
                    effectiveUntil: null,
                },
            },
        ];

        expect(() =>
            calculateJourneyQuoteTaxAllocations(
                100,
                countryDistances,
                countryTaxRules
            )
        ).toThrow("Exactly one tax rule is required for BE.");
    });

});