/**
 * This checks the important DST difference:
 * Winter:14:00 Amsterdam→ 13:00 UTC
 * Summer:14:00 Amsterdam→ 12:00 UTC
 * TZDate is specifically designed to use the supplied IANA timezone as the final constructor argument,
 * 
 */
import { describe, expect, it } from "vitest";
import { createJourneyEffectiveDate } from "@/lib/pricing/createJourneyEffectiveDate";

describe("createJourneyEffectiveDate", () => {

    it("converts Amsterdam winter time to UTC", () => {
        const result = createJourneyEffectiveDate(
            "2026-12-25",
            "14:00",
            "Europe/Amsterdam"
        );

        expect(result.toISOString()).toBe("2026-12-25T13:00:00.000Z");
    });

    it("converts Amsterdam summer time to UTC", () => {
        const result = createJourneyEffectiveDate(
            "2026-07-25",
            "14:00",
            "Europe/Amsterdam"
        );

        expect(result.toISOString()).toBe("2026-07-25T12:00:00.000Z");
    });

});