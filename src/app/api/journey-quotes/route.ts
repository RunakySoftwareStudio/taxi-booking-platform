import { NextResponse } from "next/server";

import { loadActiveJourneyPricingConfiguration } from "@/lib/pricing/loadActiveJourneyPricingConfiguration";
import { isCreateJourneyQuoteRequest } from "@/lib/pricing/isCreateJourneyQuoteRequest";
import { supabaseAdmin } from "@/lib/supabaseServer";
import type { CreateJourneyQuoteResponse } from "@/types/createJourneyQuoteResponseType";
import { createJourneyQuoteItems } from "@/lib/pricing/createJourneyQuoteItems";
import { calculateRouteEstimate } from "@/lib/mapbox/mapboxRouteService";
import { reverseGeocodeCoordinate } from "@/lib/mapbox/mapboxGeocodingService";
import { resolvePricingMarket } from "@/lib/pricing/resolvePricingMarket";
import { createBookingDataFingerprint } from "@/lib/pricing/createBookingDataFingerprint";
import { resolveScheduledPricingProfileCode } from "@/lib/pricing/resolveScheduledPricingProfileCode";
import { createJourneyEffectiveDate } from "@/lib/pricing/createJourneyEffectiveDate";
import { calculateRouteCountryDistances, type RouteCountryDistance,} from "@/lib/pricing/calculateRouteCountryDistances";
import { validateRouteCountryDistanceCoverage } from "@/lib/pricing/validateRouteCountryDistanceCoverage";
import { loadJourneyCountryTaxRules, type JourneyCountryTaxRule,} from "@/lib/pricing/loadJourneyCountryTaxRules";
import { calculateJourneyQuoteTaxAllocations } from "@/lib/pricing/calculateJourneyQuoteTaxAllocations";
import { calculateBasicJourneyFare } from "@/lib/pricing/calculateBasicJourneyFare";
import { calculateJourneyFareFromVatAmount } from "@/lib/pricing/calculateJourneyFareFromVatAmount";
import { createTemporaryJourneyQuoteFromFareCalculation } from "@/lib/pricing/createTemporaryJourneyQuoteFromFareCalculation";

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
    let countryDistances: RouteCountryDistance[];

    try {
        routeEstimate = await calculateRouteEstimate(requestBody.pickupCoordinate, requestBody.destinationCoordinate);
        countryDistances = await calculateRouteCountryDistances(routeEstimate.geometry);

        /*==========test===================================================
        const countryDistanceTotal = countryDistances.reduce((totalDistance, countryDistance) => totalDistance + countryDistance.distanceKilometers, 0);
        console.log("Route country distance check:", {
            mapboxDistanceKilometers: routeEstimate.distanceKilometers,
            countryDistanceKilometers: Number(countryDistanceTotal.toFixed(3)),
            differenceKilometers: Number((routeEstimate.distanceKilometers - countryDistanceTotal).toFixed(3)),
        });
        ==========end test===================================================*/
    }
    catch (error) {
        console.error("Could not calculate trusted journey route:", error);

        return NextResponse.json(
            { error: "The journey route could not be calculated." },
            { status: 500 }
        );
    }

    // meaning a maximum difference of 10 metres.
    validateRouteCountryDistanceCoverage(routeEstimate.distanceMeters, countryDistances);

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
    let destinationCountry;

    try {
        pickupCountry = await reverseGeocodeCoordinate(requestBody.pickupCoordinate);
        destinationCountry = await reverseGeocodeCoordinate(requestBody.destinationCoordinate);
    }
    catch (error) {
        console.error("Could not determine journey countries:", error);

        return NextResponse.json(
            { error: "Could not determine journey countries." },
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
            {
                errorCode: "UNSUPPORTED_PICKUP_COUNTRY",
                error: "Pricing is not yet available for this pickup country.",
            },
            { status: 400 }
        );
    }

    const pricingProfileCode = await resolveScheduledPricingProfileCode(
        pricingMarket.countryCode,
        pricingMarket.serviceCategory,
        requestBody.date,
        requestBody.time
    );

    const taxEffectiveAt = createJourneyEffectiveDate(
        requestBody.date,
        requestBody.time,
        pricingMarket.timeZone
    );

    const countryCodes = countryDistances.map((countryDistance) => countryDistance.countryCode);
    let countryTaxRules: JourneyCountryTaxRule[];

    try {
        countryTaxRules = await loadJourneyCountryTaxRules(
            countryCodes,
            pricingMarket.serviceCategory,
            taxEffectiveAt
        );
    }
    catch (error) {
        console.error("Could not load journey country tax rules:", error);
        return NextResponse.json(
            {
                errorCode: "TAX_CONFIGURATION_UNAVAILABLE",
                error: "Tax configuration is not available for the complete journey.",
            },
            { status: 503 }
        );
    }

    const pricingConfiguration = await loadActiveJourneyPricingConfiguration({
            pricingProfileCode,
            countryCode: pricingMarket.countryCode,
            currencyCode: pricingMarket.currencyCode,
            serviceCategory: pricingMarket.serviceCategory,
            taxEffectiveAt,
    });

    const basicFareExcludingVat = calculateBasicJourneyFare(
        pricingConfiguration.pricingProfile,
        routeEstimate.distanceKilometers,
        routeEstimate.durationMinutes
    );

    const taxAllocations = calculateJourneyQuoteTaxAllocations(
        basicFareExcludingVat,
        countryDistances,
        countryTaxRules
    );

    const totalVatAmount = Number(
        taxAllocations.reduce(
            (totalVat, taxAllocation) =>
                totalVat + taxAllocation.vatAmount,
            0
        ).toFixed(4)
    );

    const fareCalculation = calculateJourneyFareFromVatAmount(
        basicFareExcludingVat,
        totalVatAmount,
        pricingConfiguration.roundingRule
    );

    const isMultiCountryQuote = taxAllocations.length > 1;

    const journeyQuote = createTemporaryJourneyQuoteFromFareCalculation(
        pricingConfiguration.pricingProfile,
        fareCalculation,
        routeEstimate.distanceKilometers,
        routeEstimate.durationMinutes,
        pricingConfiguration.quoteValidityMinutes,
        isMultiCountryQuote
            ? null
            : taxAllocations[0].taxRatePercentage
    );

    const quoteTaxRuleId = isMultiCountryQuote ? null : taxAllocations[0].taxRuleId;

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

    const quoteItemsForStorage = quoteItems.map((quoteItem) => ({
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

    const taxAllocationsForStorage = taxAllocations.map((taxAllocation) => ({
        country_code: taxAllocation.countryCode,
        tax_rule_id: taxAllocation.taxRuleId,
        distance_km: taxAllocation.distanceKilometers,
        allocated_fare_excluding_vat: taxAllocation.allocatedFareExcludingVat,
        tax_rate_percentage: taxAllocation.taxRatePercentage,
        vat_amount: taxAllocation.vatAmount,
        amount_including_vat: taxAllocation.amountIncludingVat,
    }));

    /*
        PURPOSE: CREATE THE JOURNEY FINGERPRINT

        This fingerprint represents the pickup and destination
        coordinates used to calculate this quote.

        Later, booking confirmation will create the same fingerprint
        again and compare it with this stored value.
    */
    const bookingDataFingerprint = createBookingDataFingerprint(
        requestBody.pickupCoordinate,
        requestBody.destinationCoordinate,
        requestBody.date,
        requestBody.time
    );



    /*=================================================================================
     Test the amounts 
        * LEARNING / DIAGNOSTIC EXAMPLE
        *
        * Used to diagnose a JavaScript floating-point mismatch:
        *
        * raw fare:        119.70000000000002
        * normalized fare: 119.7000
        *
        * The database requires the quote header and tax-allocation totals
        * to match exactly, so financial values are normalized to 4 decimals.
     ==================================================================================
        const taxAllocationFareTotal = taxAllocations.reduce(
            (totalFare, taxAllocation) =>
                totalFare + taxAllocation.allocatedFareExcludingVat,
            0
        );

        console.log("QUOTE TAX ALLOCATION DEBUG", {
            pricingProfileCode: journeyQuote.pricingProfileCode,

            originalBasicFare: basicFareExcludingVat,

            headerBasicFare:
                journeyQuote.fareCalculation.basicFareExcludingVat,

            allocationFareTotal: taxAllocationFareTotal,

            originalBasicFarePrecision:
                basicFareExcludingVat.toPrecision(17),

            headerBasicFarePrecision:
                journeyQuote.fareCalculation.basicFareExcludingVat.toPrecision(17),

            allocationFareTotalPrecision:
                taxAllocationFareTotal.toPrecision(17),

            taxAllocations,
        });
    =======================================================================================*/
    /*
        Create the complete journey quote atomically.
        PostgreSQL will:
        - lock this booking session;
        - insert the journey_quotes header;
        - insert all journey_quote_items;
        - insert all journey_quote_tax_allocations;
        - verify the tax-allocation totals;
        - void other active quotes from the same booking session.

        For a normal NL journey:
        journeyQuote
            ↓
        fare excl. VAT = for example €37.00

        countryDistances
            ↓
        NL only

        countryTaxRules
            ↓
        NL tax rule

        taxAllocations
            ↓
        NL
        fare = €37.00
        VAT = €3.33
        total = €40.33

        new atomic RPC
            ↓
        journey_quotes                    ✅
        journey_quote_items               ✅
        journey_quote_tax_allocations     ✅
    */
    const { error: createQuoteError } = await supabaseAdmin
        .rpc("create_journey_quote_with_items", {
            p_quote_id: journeyQuote.quoteId,
            p_booking_session_id: requestBody.bookingSessionId,

            p_pricing_profile_id: pricingConfiguration.pricingProfileId,
            p_tax_rule_id: quoteTaxRuleId,
            p_rounding_rule_id: pricingConfiguration.roundingRuleId,

            p_pricing_calculation_version: 1,
            p_booking_data_fingerprint: bookingDataFingerprint,

            p_pricing_profile_code: journeyQuote.pricingProfileCode,
            p_pricing_profile_version: journeyQuote.pricingProfileVersion,

            p_country_code: journeyQuote.countryCode,
            p_destination_country_code: destinationCountry.countryCode,
            p_currency_code: journeyQuote.currencyCode,

            p_distance_km: journeyQuote.distanceKm,
            p_estimated_duration_minutes: journeyQuote.estimatedDurationMinutes,

            p_tax_rate_percentage: journeyQuote.taxRatePercentage,

            p_basic_fare_excluding_vat: journeyQuote.fareCalculation.basicFareExcludingVat,
            p_vat_amount: journeyQuote.fareCalculation.vatAmount,
            p_total_including_vat_before_rounding: journeyQuote.fareCalculation.totalIncludingVatBeforeRounding,
            p_final_total_including_vat: journeyQuote.fareCalculation.finalTotalIncludingVat,

            p_created_at: journeyQuote.createdAt,
            p_expires_at: journeyQuote.expiresAt,

            p_quote_items: quoteItemsForStorage,
            p_tax_allocations: taxAllocationsForStorage,
        });

    if (createQuoteError) {
        console.error("Could not create temporary journey quote:", createQuoteError);

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