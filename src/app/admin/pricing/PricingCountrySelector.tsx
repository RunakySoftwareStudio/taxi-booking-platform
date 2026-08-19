"use client";

import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { formStyles } from "@/styles/classNames";

type PricingCountrySelectorProps = {
    selectedCountryCode: string;

    pricingMarkets: {
        countryCode: string;
        countryName: string;
    }[];
};

/**
 * Purpose:
 * Changes the country shown on the Pricing Management page.
 *
 * Example:
 *
 * Netherlands
 *      ↓
 * /admin/pricing?country=NL
 *
 * Belgium
 *      ↓
 * /admin/pricing?country=BE
 *
 * Changing the URL causes AdminPricingPage to run again on the server.
 * The server then loads the pricing profiles for that country.
 */
export default function PricingCountrySelector({selectedCountryCode, pricingMarkets}: PricingCountrySelectorProps) {

    const router = useRouter();

    function handleCountryChange(event: ChangeEvent<HTMLSelectElement>) {
        const countryCode = event.target.value;
        router.push(`/admin/pricing?country=${encodeURIComponent(countryCode)}`);
    }

    return (
        <label>
            <span className={formStyles.span}>Country</span>
            <select value={selectedCountryCode} onChange={handleCountryChange} className={formStyles.inputWFullCyan}>
                {pricingMarkets.map((pricingMarket) => (
                    <option key={pricingMarket.countryCode} value={pricingMarket.countryCode}>
                        {pricingMarket.countryName}
                    </option>
                ))}
            </select>
        </label>
    );
}