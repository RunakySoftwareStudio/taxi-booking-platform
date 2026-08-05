import type { JourneyQuoteItem } from "@/types/journeyQuoteItemType";
import type { PricingProfile } from "@/types/pricingProfileType";
import type { TemporaryJourneyQuote } from "@/types/temporaryJourneyQuoteType";

type JourneyQuoteItemBeforeVat = Omit<
    JourneyQuoteItem,
    "vatAmount" | "amountIncludingVat"
>;

function roundMoney(inputValue: number): number {
    return Number(inputValue.toFixed(4));
}

/**
 * Creates detailed quote lines for the base fare, distance,
 * duration and an optional minimum-fare adjustment.
 */
export function createJourneyQuoteItems(pricingProfile: PricingProfile, journeyQuote: TemporaryJourneyQuote): JourneyQuoteItem[] {
    /*
    Below const: This is object destructuring in TypeScript/JavaScript.
    It takes four properties from the journeyQuote object and creates four separate constants.
    It is equivalent to writing:
        const distanceKm = journeyQuote.distanceKm;
        const estimatedDurationMinutes = journeyQuote.estimatedDurationMinutes;
        const taxRatePercentage = journeyQuote.taxRatePercentage;
        const fareCalculation = journeyQuote.fareCalculation;
    */
    const {
        distanceKm,
        estimatedDurationMinutes,
        taxRatePercentage,
        fareCalculation,
    } = journeyQuote;

    const baseFareAmount = roundMoney( pricingProfile.baseFareExcludingVat);
    const distanceFareAmount = roundMoney( distanceKm *  pricingProfile.distanceRatePerKmExcludingVat );
    let durationFareAmount = roundMoney(estimatedDurationMinutes * pricingProfile.durationRatePerMinuteExcludingVat);
    
    const fareBeforeMinimum =
        pricingProfile.baseFareExcludingVat +
        distanceKm * pricingProfile.distanceRatePerKmExcludingVat +
        estimatedDurationMinutes * pricingProfile.durationRatePerMinuteExcludingVat;

    const minimumFareWasApplied = fareBeforeMinimum <  pricingProfile.minimumFareExcludingVat;
    const targetFareExcludingVat = roundMoney(fareCalculation.basicFareExcludingVat );
    const componentTotal = roundMoney( baseFareAmount + distanceFareAmount + durationFareAmount);

    /*
     * Assign a possible four-decimal difference to the duration
     * line when the minimum fare was not applied.
     */
    if (!minimumFareWasApplied) {
        durationFareAmount = roundMoney(durationFareAmount + targetFareExcludingVat - componentTotal );
    }

    const itemsBeforeVat: JourneyQuoteItemBeforeVat[] = [
        {
            itemCode: "BASE_FARE",
            description: "Base fare",
            quantity: 1,
            unit: "journey",
            unitAmountExcludingVat: baseFareAmount,
            amountExcludingVat: baseFareAmount,
            vatRatePercentage: taxRatePercentage,
            calculationOrder: 10,
        },
        {
            itemCode: "DISTANCE_FARE",
            description: "Distance fare",
            quantity: distanceKm,
            unit: "km",
            unitAmountExcludingVat:
                pricingProfile.distanceRatePerKmExcludingVat,
            amountExcludingVat: distanceFareAmount,
            vatRatePercentage: taxRatePercentage,
            calculationOrder: 20,
        },
        {
            itemCode: "DURATION_FARE",
            description: "Duration fare",
            quantity: estimatedDurationMinutes,
            unit: "minute",
            unitAmountExcludingVat: pricingProfile.durationRatePerMinuteExcludingVat,
            amountExcludingVat: durationFareAmount,
            vatRatePercentage: taxRatePercentage,
            calculationOrder: 30,
        },
    ];

    // When the minimum fare applies, add one extra minimum-fare item to the end of the array.
    if (minimumFareWasApplied) {
        const minimumFareAdjustment = roundMoney(targetFareExcludingVat - componentTotal );

        itemsBeforeVat.push({
            itemCode: "MINIMUM_FARE_ADJUSTMENT",
            description: "Minimum fare adjustment",
            quantity: 1,
            unit: "adjustment",
            unitAmountExcludingVat: minimumFareAdjustment,
            amountExcludingVat: minimumFareAdjustment,
            vatRatePercentage: taxRatePercentage,
            calculationOrder: 40,
        });
    }

    const targetVatAmount = roundMoney(fareCalculation.vatAmount);
    let allocatedVatAmount = 0;

    /**
     * This whole section converts every item in itemsBeforeVat into a complete quote item containing:
    */
    return itemsBeforeVat.map((quoteItem, itemIndex) => {
        const isFinalItem = itemIndex === itemsBeforeVat.length - 1;
        const vatAmount = roundMoney(
            isFinalItem
                ? targetVatAmount - allocatedVatAmount
                : quoteItem.amountExcludingVat * (taxRatePercentage / 100)
        );

        allocatedVatAmount = roundMoney(allocatedVatAmount + vatAmount);

        // This code returns a new object for one quote item:
        //...quoteItem This is the spread operator.It copies all existing properties from quoteItem into the new object.
        // A new object is created with all original fields of quoteItem, plus the calculated vatAmount and amountIncludingVat.
        return {
            ...quoteItem,
            vatAmount,
            amountIncludingVat: roundMoney(quoteItem.amountExcludingVat + vatAmount),
        };
    });
}