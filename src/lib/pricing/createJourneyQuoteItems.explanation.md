# `createJourneyQuoteItems.ts` — Learning Explanation

## 1. Purpose

The `createJourneyQuoteItems` function divides one calculated journey fare into detailed financial lines.

Instead of storing only one total, the quote can explain how the price was created:

- base fare;
- distance fare;
- duration fare;
- minimum-fare adjustment, when required;
- VAT belonging to each item.

For example, a €37.00 fare excluding VAT can be divided into:

| Item | Calculation | Amount excluding VAT |
|---|---:|---:|
| Base fare | 1 × €4.00 | €4.00 |
| Distance fare | 10 km × €2.50 | €25.00 |
| Duration fare | 20 minutes × €0.40 | €8.00 |
| **Total** |  | **€37.00** |

These calculation lines are later stored in the database table:

```text
journey_quote_items
```

---

## 2. Function inputs

The function receives two parameters:

```typescript
export function createJourneyQuoteItems(
    pricingProfile: PricingProfile,
    journeyQuote: TemporaryJourneyQuote
): JourneyQuoteItem[]
```

### `pricingProfile`

This contains the pricing rules used for the journey.

Examples:

```typescript
pricingProfile.baseFareExcludingVat
pricingProfile.distanceRatePerKmExcludingVat
pricingProfile.durationRatePerMinuteExcludingVat
pricingProfile.minimumFareExcludingVat
```

### `journeyQuote`

This contains the journey information and the completed quote calculation.

Examples:

```typescript
journeyQuote.distanceKm
journeyQuote.estimatedDurationMinutes
journeyQuote.taxRatePercentage
journeyQuote.fareCalculation
```

The function returns:

```typescript
JourneyQuoteItem[]
```

The brackets `[]` mean that it returns an array containing multiple quote items.

---

## 3. Object destructuring

The function contains:

```typescript
const {
    distanceKm,
    estimatedDurationMinutes,
    taxRatePercentage,
    fareCalculation,
} = journeyQuote;
```

This is called **object destructuring**.

It creates four separate constants from properties of `journeyQuote`:

```typescript
distanceKm
estimatedDurationMinutes
taxRatePercentage
fareCalculation
```

It is equivalent to:

```typescript
const distanceKm = journeyQuote.distanceKm;

const estimatedDurationMinutes =
    journeyQuote.estimatedDurationMinutes;

const taxRatePercentage =
    journeyQuote.taxRatePercentage;

const fareCalculation =
    journeyQuote.fareCalculation;
```

Destructuring makes the remaining code shorter because we do not need to repeat:

```typescript
journeyQuote.
```

For example:

```typescript
distanceKm
```

instead of:

```typescript
journeyQuote.distanceKm
```

---

## 4. The `roundMoney` helper

```typescript
function roundMoney(inputValue: number): number {
    return Number(inputValue.toFixed(4));
}
```

The financial database columns store calculation amounts with four decimal places.

For example:

```text
3.333333333
```

becomes:

```text
3.3333
```

### `toFixed(4)`

```typescript
inputValue.toFixed(4)
```

returns a string containing four decimal places.

Example:

```typescript
const result = 3.333333.toFixed(4);
```

Result:

```text
"3.3333"
```

### `Number(...)`

`Number` converts that string back into a number:

```typescript
Number("3.3333")
```

Result:

```text
3.3333
```

---

## 5. Calculating the basic quote items

### Base fare

```typescript
const baseFareAmount = roundMoney(
    pricingProfile.baseFareExcludingVat
);
```

The base fare is a fixed amount for starting the journey.

Example:

```text
€4.00
```

---

### Distance fare

```typescript
const distanceFareAmount = roundMoney(
    distanceKm *
        pricingProfile.distanceRatePerKmExcludingVat
);
```

This multiplies the journey distance by the configured rate per kilometre.

Example:

```text
10 km × €2.50 = €25.00
```

---

### Duration fare

```typescript
let durationFareAmount = roundMoney(
    estimatedDurationMinutes *
        pricingProfile.durationRatePerMinuteExcludingVat
);
```

This multiplies the estimated journey duration by the configured rate per minute.

Example:

```text
20 minutes × €0.40 = €8.00
```

`let` is used instead of `const` because the duration amount may later receive a very small reconciliation difference.

---

## 6. Checking the minimum fare

The fare before applying the minimum is calculated with:

```typescript
const fareBeforeMinimum =
    pricingProfile.baseFareExcludingVat +
    distanceKm *
        pricingProfile.distanceRatePerKmExcludingVat +
    estimatedDurationMinutes *
        pricingProfile.durationRatePerMinuteExcludingVat;
```

This represents:

```text
base fare + distance fare + duration fare
```

The function then checks:

```typescript
const minimumFareWasApplied =
    fareBeforeMinimum <
    pricingProfile.minimumFareExcludingVat;
```

The result is a Boolean:

```text
true
```

or:

```text
false
```

### Example without minimum fare

```text
Calculated fare: €37.00
Minimum fare:    €15.00
```

Because €37.00 is greater than €15.00:

```typescript
minimumFareWasApplied = false;
```

### Example with minimum fare

```text
Calculated fare: €7.00
Minimum fare:   €15.00
```

Because €7.00 is below €15.00:

```typescript
minimumFareWasApplied = true;
```

The missing amount is:

```text
€15.00 - €7.00 = €8.00
```

A separate quote item is then created:

```text
MINIMUM_FARE_ADJUSTMENT = €8.00
```

---

## 7. Target fare and component total

The completed quote already contains the official fare excluding VAT:

```typescript
const targetFareExcludingVat = roundMoney(
    fareCalculation.basicFareExcludingVat
);
```

This is the amount that the item lines must add up to.

The function also calculates the current total of the three normal components:

```typescript
const componentTotal = roundMoney(
    baseFareAmount +
        distanceFareAmount +
        durationFareAmount
);
```

The financial rule is:

```text
Sum of quote items excluding VAT
=
quote header fare excluding VAT
```

---

## 8. Reconciliation difference

JavaScript uses floating-point numbers. This can sometimes create very small differences.

For example:

```text
Expected: 37.0000
Calculated: 36.9999
```

When the minimum fare is not used, the function assigns this small difference to the duration item:

```typescript
if (!minimumFareWasApplied) {
    durationFareAmount = roundMoney(
        durationFareAmount +
            targetFareExcludingVat -
            componentTotal
    );
}
```

The symbol:

```typescript
!
```

means `not`.

Therefore:

```typescript
!minimumFareWasApplied
```

means:

```text
the minimum fare was not applied
```

This guarantees that the detailed component total matches the quote header.

---

## 9. `itemsBeforeVat`

The function creates an array:

```typescript
const itemsBeforeVat: JourneyQuoteItemBeforeVat[] = [
    // Base fare
    // Distance fare
    // Duration fare
];
```

At this stage, the items contain amounts excluding VAT, but they do not yet contain:

```typescript
vatAmount
amountIncludingVat
```

That is why the temporary type is called:

```typescript
JourneyQuoteItemBeforeVat
```

It is defined with:

```typescript
type JourneyQuoteItemBeforeVat = Omit<
    JourneyQuoteItem,
    "vatAmount" | "amountIncludingVat"
>;
```

### `Omit`

`Omit` creates a new type based on an existing type but removes selected properties.

In this case it means:

```text
Use all JourneyQuoteItem properties,
except vatAmount and amountIncludingVat.
```

---

## 10. Base fare item

```typescript
{
    itemCode: "BASE_FARE",
    description: "Base fare",
    quantity: 1,
    unit: "journey",
    unitAmountExcludingVat: baseFareAmount,
    amountExcludingVat: baseFareAmount,
    vatRatePercentage: taxRatePercentage,
    calculationOrder: 10,
}
```

Because the base fare is one fixed amount:

```text
quantity = 1
unit = journey
```

Example:

```text
1 journey × €4.00 = €4.00
```

---

## 11. Distance fare item

```typescript
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
}
```

Example:

```text
quantity = 10
unit = km
unit amount = €2.50
total = €25.00
```

---

## 12. Duration fare item

```typescript
{
    itemCode: "DURATION_FARE",
    description: "Duration fare",
    quantity: estimatedDurationMinutes,
    unit: "minute",
    unitAmountExcludingVat:
        pricingProfile.durationRatePerMinuteExcludingVat,
    amountExcludingVat: durationFareAmount,
    vatRatePercentage: taxRatePercentage,
    calculationOrder: 30,
}
```

Example:

```text
quantity = 20
unit = minute
unit amount = €0.40
total = €8.00
```

---

## 13. Minimum-fare adjustment item

This item is only added when the calculated fare is below the configured minimum fare:

```typescript
if (minimumFareWasApplied) {
    const minimumFareAdjustment = roundMoney(
        targetFareExcludingVat - componentTotal
    );

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
```

### `.push()`

```typescript
itemsBeforeVat.push(...)
```

adds a new item to the end of the array.

Example:

```text
Component total:          €7.00
Required minimum fare:   €15.00
Adjustment:               €8.00
```

The resulting items become:

```text
Base fare
Distance fare
Duration fare
Minimum-fare adjustment
```

---

## 14. VAT target

The total VAT already calculated for the quote is:

```typescript
const targetVatAmount = roundMoney(
    fareCalculation.vatAmount
);
```

Example:

```text
Fare excluding VAT: €37.00
VAT percentage:     9%
VAT amount:         €3.33
```

The detailed quote-item VAT values must add up to exactly this target.

---

## 15. Tracking allocated VAT

Before processing the items:

```typescript
let allocatedVatAmount = 0;
```

This variable tracks how much VAT has already been assigned to quote items.

Example:

```text
Start:                         €0.00
After base-fare VAT:           €0.36
After distance-fare VAT:       €2.61
After duration-fare VAT:       €3.33
```

---

## 16. Using `.map()`

```typescript
return itemsBeforeVat.map((quoteItem, itemIndex) => {
    // ...
});
```

`.map()` processes every element in an array and returns a new array.

The original `itemsBeforeVat` array is not changed.

### `quoteItem`

`quoteItem` is the current item being processed.

For example:

```text
First iteration:  BASE_FARE
Second iteration: DISTANCE_FARE
Third iteration:  DURATION_FARE
```

### `itemIndex`

`itemIndex` is the position of the current item.

Array indexes begin at zero:

```text
First item:  0
Second item: 1
Third item:  2
```

---

## 17. Detecting the final item

```typescript
const isFinalItem =
    itemIndex === itemsBeforeVat.length - 1;
```

Suppose the array contains three items:

```text
itemsBeforeVat.length = 3
```

The final index is:

```text
3 - 1 = 2
```

Therefore:

```text
Index 0: false
Index 1: false
Index 2: true
```

`isFinalItem` is only `true` for the last item.

---

## 18. Ternary operator

The VAT calculation uses:

```typescript
const vatAmount = roundMoney(
    isFinalItem
        ? targetVatAmount - allocatedVatAmount
        : quoteItem.amountExcludingVat *
              (taxRatePercentage / 100)
);
```

This syntax is called the **ternary operator**:

```typescript
condition
    ? valueWhenTrue
    : valueWhenFalse
```

The same logic written with `if` would be:

```typescript
let vatAmount: number;

if (isFinalItem) {
    vatAmount =
        targetVatAmount - allocatedVatAmount;
} else {
    vatAmount =
        quoteItem.amountExcludingVat *
        (taxRatePercentage / 100);
}

vatAmount = roundMoney(vatAmount);
```

---

## 19. Why the final item uses the remaining VAT

Each individual VAT line is stored with four decimal places.

Rounding every item separately can create a very small difference.

For example:

```text
Quote header VAT: €3.3300
VAT already assigned: €2.6100
```

The final item receives:

```text
€3.3300 - €2.6100 = €0.7200
```

This guarantees:

```text
Sum of item VAT amounts
=
VAT stored on journey quote header
```

Without this correction, the item VAT total could become:

```text
€3.3299
```

while the quote header contains:

```text
€3.3300
```

That would make the detailed lines inconsistent with the quote total.

---

## 20. Updating allocated VAT

```typescript
allocatedVatAmount = roundMoney(
    allocatedVatAmount + vatAmount
);
```

After calculating the VAT for one item, it is added to the VAT already assigned.

Example:

```text
Initial allocated VAT:       €0.00
Base-fare VAT:               €0.36
New allocated VAT:           €0.36

Distance-fare VAT:           €2.25
New allocated VAT:           €2.61

Remaining VAT:               €0.72
Final allocated VAT:         €3.33
```

---

## 21. Returning the completed item

```typescript
return {
    ...quoteItem,
    vatAmount,
    amountIncludingVat: roundMoney(
        quoteItem.amountExcludingVat + vatAmount
    ),
};
```

### Spread operator

```typescript
...quoteItem
```

is the object spread operator.

It copies all existing properties from `quoteItem` into a new object.

For example, it copies:

```typescript
itemCode
description
quantity
unit
unitAmountExcludingVat
amountExcludingVat
vatRatePercentage
calculationOrder
```

### Property shorthand

```typescript
vatAmount
```

is shorthand for:

```typescript
vatAmount: vatAmount
```

### Amount including VAT

```typescript
amountIncludingVat =
    amountExcludingVat + vatAmount
```

Example:

```text
Amount excluding VAT: €4.00
VAT:                  €0.36
Amount including VAT: €4.36
```

The original `quoteItem` object is not changed. A new complete object is returned.

---

## 22. Complete normal-journey example

### Pricing configuration

```text
Base fare:                    €4.00
Distance rate:                €2.50 per km
Duration rate:                €0.40 per minute
Minimum fare:                €15.00
VAT:                              9%
```

### Journey

```text
Distance:                     10 km
Estimated duration:           20 minutes
```

### Calculation excluding VAT

```text
Base fare:                    €4.00
Distance: 10 × €2.50 =       €25.00
Duration: 20 × €0.40 =        €8.00
                             -------
Subtotal excluding VAT:      €37.00
```

### VAT

```text
€37.00 × 9% = €3.33
```

### Detailed items

| Item | Excluding VAT | VAT | Including VAT |
|---|---:|---:|---:|
| Base fare | €4.00 | €0.36 | €4.36 |
| Distance fare | €25.00 | €2.25 | €27.25 |
| Duration fare | €8.00 | €0.72 | €8.72 |
| **Total** | **€37.00** | **€3.33** | **€40.33** |

---

## 23. Complete minimum-fare example

Suppose the normal components calculate to:

```text
Base fare:                    €4.00
Distance fare:                €2.00
Duration fare:                €1.00
                             -------
Calculated fare:              €7.00
```

The configured minimum fare is:

```text
€15.00
```

The required adjustment is:

```text
€15.00 - €7.00 = €8.00
```

The detailed items become:

| Item | Amount excluding VAT |
|---|---:|
| Base fare | €4.00 |
| Distance fare | €2.00 |
| Duration fare | €1.00 |
| Minimum-fare adjustment | €8.00 |
| **Total** | **€15.00** |

This preserves the original calculation while clearly showing why the final price became €15.00.

---

## 24. Calculation order

Each quote item receives a calculation order:

```text
10 — BASE_FARE
20 — DISTANCE_FARE
30 — DURATION_FARE
40 — MINIMUM_FARE_ADJUSTMENT
```

Using gaps of ten makes it easier to add new item types later.

For example:

```text
35 — WAITING_TIME_SURCHARGE
50 — PASSENGER_SUPPORT_SURCHARGE
90 — PROMOTION_DISCOUNT
```

The database uses `calculation_order` to display and process the items in a predictable sequence.

---

## 25. Important financial reconciliation rules

The function must preserve these rules:

```text
Sum of item amounts excluding VAT
=
journey quote fare excluding VAT
```

```text
Sum of item VAT amounts
=
journey quote VAT amount
```

```text
Sum of item amounts including VAT
=
journey quote total including VAT before final currency rounding
```

The final customer total may receive a separate currency-rounding adjustment.

For example:

```text
Total before final rounding: €40.3270
Final rounded total:         €40.33
```

That final currency rounding belongs to the quote header and is not currently represented as a normal fare item.

---

## 26. Overall function flow

```text
Read the pricing profile and quote
        ↓
Calculate base-fare amount
        ↓
Calculate distance-fare amount
        ↓
Calculate duration-fare amount
        ↓
Check whether minimum fare applies
        ↓
Create items excluding VAT
        ↓
Add minimum-fare adjustment when required
        ↓
Calculate VAT for each item
        ↓
Assign any VAT remainder to the final item
        ↓
Add amount including VAT
        ↓
Return the completed JourneyQuoteItem array
```

---

## 27. Why this function is useful

This function provides:

- transparent pricing for customers;
- explainable calculations for administrators;
- a historical financial record;
- support for future surcharges and discounts;
- exact reconciliation with the quote header;
- easier auditing and troubleshooting.

The calculation items make it possible to understand not only **what the total is**, but also **how the total was created**.