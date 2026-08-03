import { NextResponse } from "next/server";

import { dutchEuroRoundingRule } from "@/data/countryRoundingRuleData";
import { dutchPassengerTransportTaxRule } from "@/data/countryTaxRuleData";
import { dutchDaytimePricingProfile } from "@/data/pricingProfileData";
import { createTemporaryJourneyQuote } from "@/lib/pricing/createTemporaryJourneyQuote";
import { isCreateJourneyQuoteRequest } from "@/lib/pricing/isCreateJourneyQuoteRequest";
import { supabaseAdmin } from "@/lib/supabaseServer";

const quoteValidityMinutes = 15;

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

    const journeyQuote = createTemporaryJourneyQuote(
        dutchDaytimePricingProfile,
        dutchPassengerTransportTaxRule,
        dutchEuroRoundingRule,
        requestBody.distanceKm,
        requestBody.estimatedDurationMinutes,
        quoteValidityMinutes
    );

    const { error: insertError } = await supabaseAdmin
        .from("journey_quotes")
        .insert({
            quote_id: journeyQuote.quoteId,
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

    // Return only the successfully stored temporary quote.
    return NextResponse.json(
        { journeyQuote },
        { status: 201 }
    );
}