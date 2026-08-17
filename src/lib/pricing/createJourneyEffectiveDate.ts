import { TZDate } from "@date-fns/tz";

/**
 * Purpose:
 * Converts the planned local pickup date and time into one real
 * moment in time using the pickup market timezone.
 *
 * Example:
 * 2026-12-25 + 14:00 + Europe/Amsterdam
 *              ↓
 * UTC Date that can safely be compared with TIMESTAMPTZ values
 * such as tax_rules.effective_from and effective_until.
 * Why month - 1?

    JavaScript date months start at zero:
    January   = 0
    February  = 1
    ...
    December  = 11

    But our booking date contains:2026-12-25 ->  12
    so we convert: month - 1 which gives 11 for December.

    Why return new Date(...)?
    TZDate determines the correct real moment, including Amsterdam summer/winter time. We then return a normal JavaScript Date, 
    because our tax loader only needs a real timestamp that it can convert with: .toISOString()

    For example, winter:
    25 December 2026, 14:00 Europe/Amsterdam
                        ↓
    2026-12-25T13:00:00.000Z
    The timezone package handles the offset rather than us hard-coding +01:00 or +02:00.
 */
export function createJourneyEffectiveDate(
    journeyDate: string,
    journeyTime: string,
    timeZone: string
): Date {

    const [year, month, day] = journeyDate.split("-").map(Number);
    const [hour, minute] = journeyTime.split(":").map(Number);

    const localJourneyDate = new TZDate(
        year,
        month - 1,
        day,
        hour,
        minute,
        0,
        timeZone
    );

    if (Number.isNaN(localJourneyDate.getTime())) {
        throw new Error("Invalid planned journey date, time, or timezone.");
    }

    return new Date(localJourneyDate.getTime());
}