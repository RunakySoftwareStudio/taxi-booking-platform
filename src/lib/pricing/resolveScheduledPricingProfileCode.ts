import { supabaseAdmin } from "@/lib/supabaseServer";

/**
 * Purpose:
 * Selects the pricing-profile family that applies to the planned
 * pickup date and local pickup time.
 *
 * Priority:
 *
 * special date/time override
 *          ↓
 * normal weekly schedule
 *
 * Example:
 *
 * 2026-12-25 14:00
 *      ↓
 * Christmas override
 *      ↓
 * NL_HOLIDAY_STANDARD
 *
 * If no override exists:
 *
 * Monday 14:00
 *      ↓
 * NL_DAYTIME_STANDARD
 */


/**
 * Converts YYYY-MM-DD into ISO weekday numbering:
 *
 * 1 = Monday
 * ...
 * 7 = Sunday
 */
function getIsoDayOfWeek(journeyDate: string): number {
    const dayOfWeek = new Date(`${journeyDate}T00:00:00Z`).getUTCDay();

    return dayOfWeek === 0 ? 7 : dayOfWeek;
}


/**
 * Returns the pricing-profile code for one planned journey.
 *
 * The date and time represent the local pickup clock time.
 */
export async function resolveScheduledPricingProfileCode(
    countryCode: string,
    serviceCategory: string,
    journeyDate: string,
    journeyTime: string
): Promise<string> {

    const normalizedCountryCode = countryCode.trim().toUpperCase();
    const localJourneyDateTime = `${journeyDate}T${journeyTime}:00`;

    /*
     * First check special date/time overrides.
     *
     * Lower priority number wins.
     */
    const overrideResult = await supabaseAdmin
        .from("pricing_schedule_overrides")
        .select("pricing_profile_code, priority")
        .eq("country_code", normalizedCountryCode)
        .eq("service_category", serviceCategory)
        .lte("start_local_datetime", localJourneyDateTime)
        .gt("end_local_datetime", localJourneyDateTime)
        .order("priority", { ascending: true })
        .limit(2);

    if (overrideResult.error) {
        throw new Error(`Could not load pricing schedule overrides: ${overrideResult.error.message}`);
    }

    const matchingOverrides = overrideResult.data ?? [];

    /*
     * Two matching overrides with the same highest priority are
     * ambiguous and therefore rejected instead of guessing.
     */
    if (
        matchingOverrides.length > 1 &&
        matchingOverrides[0].priority === matchingOverrides[1].priority
    ) {
        throw new Error("Multiple pricing schedule overrides have the same priority.");
    }

    if (matchingOverrides.length > 0) {
        return matchingOverrides[0].pricing_profile_code;
    }


    /*
     * No special override applies, so use the normal recurring
     * weekly schedule.
     */
    const dayOfWeek = getIsoDayOfWeek(journeyDate);

    const scheduleResult = await supabaseAdmin
        .from("pricing_schedules")
        .select("pricing_profile_code")
        .eq("country_code", normalizedCountryCode)
        .eq("service_category", serviceCategory)
        .eq("day_of_week", dayOfWeek)
        .lte("start_local_time", journeyTime)
        .gt("end_local_time", journeyTime)
        .limit(2);

    if (scheduleResult.error) {
        throw new Error(`Could not load pricing schedule: ${scheduleResult.error.message}`);
    }

    const matchingSchedules = scheduleResult.data ?? [];

    if (matchingSchedules.length === 0) {
        throw new Error("No pricing schedule matches the planned pickup time.");
    }

    if (matchingSchedules.length > 1) {
        throw new Error("Multiple pricing schedules match the planned pickup time.");
    }

    return matchingSchedules[0].pricing_profile_code;
}