import { NextResponse } from "next/server";

import { loadActiveJourneyPricingConfiguration } from "@/lib/pricing/loadActiveJourneyPricingConfiguration";
import { createTemporaryJourneyQuote } from "@/lib/pricing/createTemporaryJourneyQuote";
import { isCreateJourneyQuoteRequest } from "@/lib/pricing/isCreateJourneyQuoteRequest";
import { supabaseAdmin } from "@/lib/supabaseServer";
import type { CreateJourneyQuoteResponse } from "@/types/createJourneyQuoteResponseType";

/*
 * Temporary default pricing market.
 *
 * This must later be resolved from the journey pickup location
 * and operating market. It must never be selected from the
 * website language.
 */
const defaultPricingMarket = {
    pricingProfileCode: "NL_DAYTIME_STANDARD",
    countryCode: "NL",
    currencyCode: "EUR",
    serviceCategory: "passenger_transport",
} as const;

/**
 * Purpose:
 * Validates the journey information, calculates a temporary quote,
 * stores it in Supabase, and returns it to the browser.
 */
export async function POST(request: Request) {
    let requestBody: unknown;

    try {
        requestBody = await request.json();
    } 
    catch {
        return NextResponse.json(
            { error: "The request body must contain valid JSON." },
            { status: 400 }
        );
    }

    if (!isCreateJourneyQuoteRequest(requestBody)) {
        return NextResponse.json(
            {error:"Distance and estimated duration must be positive numbers."},
            { status: 400 }
        );
    }

    const pricingConfiguration =
        await loadActiveJourneyPricingConfiguration({
            pricingProfileCode: defaultPricingMarket.pricingProfileCode,
            countryCode: defaultPricingMarket.countryCode,
            currencyCode: defaultPricingMarket.currencyCode,
            serviceCategory: defaultPricingMarket.serviceCategory,
        });

    const journeyQuote = createTemporaryJourneyQuote(
        pricingConfiguration.pricingProfile,
        pricingConfiguration.taxRule,
        pricingConfiguration.roundingRule,
        requestBody.distanceKm,
        requestBody.estimatedDurationMinutes,
        pricingConfiguration.quoteValidityMinutes
    );

    const { error: insertError } = await supabaseAdmin
        .from("journey_quotes")
        .insert({
            quote_id: journeyQuote.quoteId,
            pricing_profile_id: pricingConfiguration.pricingProfileId,
            tax_rule_id: pricingConfiguration.taxRuleId,
            rounding_rule_id: pricingConfiguration.roundingRuleId,
            pricing_calculation_version: 1,
            pricing_profile_code: journeyQuote.pricingProfileCode,
            pricing_profile_version: journeyQuote.pricingProfileVersion,
            country_code: journeyQuote.countryCode,
            currency_code: journeyQuote.currencyCode,
            distance_km: journeyQuote.distanceKm,
            estimated_duration_minutes: journeyQuote.estimatedDurationMinutes,
            tax_rate_percentage: journeyQuote.taxRatePercentage,
            basic_fare_excluding_vat: journeyQuote.fareCalculation.basicFareExcludingVat,
            vat_amount: journeyQuote.fareCalculation.vatAmount,
            total_including_vat_before_rounding: journeyQuote.fareCalculation.totalIncludingVatBeforeRounding,
            final_total_including_vat: journeyQuote.fareCalculation.finalTotalIncludingVat,
            created_at: journeyQuote.createdAt,
            expires_at: journeyQuote.expiresAt,
        });

    if (insertError) {
        console.error("Could not store temporary journey quote:", insertError);
        return NextResponse.json(
            { error: "The temporary quote could not be created." },
            { status: 500 }
        );
    }

    /*
        Build a response that must match the successful API response type.
        CreateJourneyQuoteResponse is the reusable type.
        responseBody, is the actual object returned as JSON.
        TypeScript, verifies that responseBody, follows the required structure.
    */
    const responseBody: CreateJourneyQuoteResponse = {journeyQuote};

    // Return only the successfully stored temporary quote.
    return NextResponse.json(responseBody,{ status: 201 });

}