import { NextResponse } from "next/server";

import { loadActiveJourneyPricingConfiguration } from "@/lib/pricing/loadActiveJourneyPricingConfiguration";
import { createTemporaryJourneyQuote } from "@/lib/pricing/createTemporaryJourneyQuote";
import { isCreateJourneyQuoteRequest } from "@/lib/pricing/isCreateJourneyQuoteRequest";
import { supabaseAdmin } from "@/lib/supabaseServer";
import type { CreateJourneyQuoteResponse } from "@/types/createJourneyQuoteResponseType";
import { createJourneyQuoteItems } from "@/lib/pricing/createJourneyQuoteItems";
import { calculateRouteEstimate } from "@/lib/mapbox/mapboxRouteService";
import { reverseGeocodeCoordinate } from "@/lib/mapbox/mapboxGeocodingService";
import { resolvePricingMarket } from "@/lib/pricing/resolvePricingMarket";



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
            {error:"Valid pickup and destination coordinates are required."},
            { status: 400 }
        );
    }
    /*
        PURPOSE: CALCULATE THE TRUSTED ROUTE ON THE SERVER
        The browser also currently sends distance and duration, but we no longer use those values for the price calculation.
        Instead:
        pickup + destination coordinates
            ↓
        server calls Mapbox
            ↓
        trusted distance + duration
            ↓
        pricing calculation

        This prevents somebody from manually changing the browser
        request to make a journey appear shorter or cheaper.
    */
    let routeEstimate;

    try {
        routeEstimate = await calculateRouteEstimate(
            requestBody.pickupCoordinate,
            requestBody.destinationCoordinate
        );
    }
    catch (error) {
        console.error("Could not calculate trusted journey route:", error);

        return NextResponse.json(
            { error: "The journey route could not be calculated." },
            { status: 500 }
        );
    }

    /*
        PURPOSE: DETERMINE THE PRICING COUNTRY FROM THE PICKUP
        The browser does not send or choose the pricing country.
        pickup coordinate
            ↓
        Mapbox reverse geocoding on the server
            ↓
        country code such as NL
    */
    let pickupCountry;

    try {
        pickupCountry = await reverseGeocodeCoordinate(
            requestBody.pickupCoordinate
        );
    }
    catch (error) {
        console.error("Could not determine pickup country:", error);

        return NextResponse.json(
            { error: "The pickup country could not be determined." },
            { status: 500 }
        );
    }

    /*
        PURPOSE: RESOLVE THE FINANCIAL PRICING MARKET

        The country was already verified by Mapbox on the server.

        Example:
        pickup country = NL
            ↓
        resolvePricingMarket("NL")
            ↓
        NL_DAYTIME_STANDARD
        EUR
        passenger_transport

        Website language is not involved.
    */
    const pricingMarket = resolvePricingMarket(pickupCountry.countryCode);
    if (!pricingMarket) {
        return NextResponse.json(
            { error: "Pricing is not yet available for this pickup country." },
            { status: 400 }
        );
    }

    const pricingConfiguration =
        await loadActiveJourneyPricingConfiguration({
            pricingProfileCode: pricingMarket.pricingProfileCode,
            countryCode: pricingMarket.countryCode,
            currencyCode: pricingMarket.currencyCode,
            serviceCategory: pricingMarket.serviceCategory,
        });

    const journeyQuote = createTemporaryJourneyQuote(
        pricingConfiguration.pricingProfile,
        pricingConfiguration.taxRule,
        pricingConfiguration.roundingRule,
        routeEstimate.distanceKilometers,
        routeEstimate.durationMinutes,
        pricingConfiguration.quoteValidityMinutes
    );

    const quoteItems = createJourneyQuoteItems(
        pricingConfiguration.pricingProfile,
        journeyQuote
    );

    /*
        This asigns and converts the TypeScript property names, into the Supabase column names:
        quote_id → newly added from journeyQuote.quoteId
        all other fields → copied from quoteItem and, where necessary, renamed from TypeScript camelCase to database snake_case
        it becomes:
        {
            quote_id: "ABC-123",
            item_code: "BASE_FARE",
            description: "Base fare",
            ...
            calculation_order: 10
        }
    */
    const quoteItemRows = quoteItems.map((quoteItem) => ({
        quote_id: journeyQuote.quoteId,
        item_code: quoteItem.itemCode,
        description: quoteItem.description,
        quantity: quoteItem.quantity,
        unit: quoteItem.unit,
        unit_amount_excluding_vat: quoteItem.unitAmountExcludingVat,
        amount_excluding_vat: quoteItem.amountExcludingVat,
        vat_rate_percentage: quoteItem.vatRatePercentage,
        vat_amount: quoteItem.vatAmount,
        amount_including_vat: quoteItem.amountIncludingVat,
        calculation_order: quoteItem.calculationOrder,
    }));

    // insert journey_quotes header. one summary row for the complete quote
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
    
    //stop if header insert fails
    if (insertError) {
        console.error("Could not store temporary journey quote:", insertError);
        return NextResponse.json(
            { error: "The temporary quote could not be created." },
            { status: 500 }
        );
    }

    // insert journey_quote_items. multiple detailed rows explaining the quote
    const { error: itemInsertError } = await supabaseAdmin
    .from("journey_quote_items")
    .insert(quoteItemRows);

    if (itemInsertError) {
        console.error("Could not store journey quote items:", itemInsertError);

        // delete the header if item insertion fails
        const { error: cleanupError } = await supabaseAdmin
            .from("journey_quotes")
            .delete()
            .eq("quote_id", journeyQuote.quoteId);
        if (cleanupError) {console.error("Could not remove incomplete journey quote:", cleanupError);}

        return NextResponse.json(
            { error: "The temporary quote calculation details could not be stored." },
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