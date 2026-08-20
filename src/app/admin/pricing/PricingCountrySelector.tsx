"use client";

import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { formStyles } from "@/styles/classNames";

/**
 * basePath?: string;
    * basePath = the property name.
    * : = “has type”.
    * string = the value must be text.
    * ? = this property is optional.
    * 
    * means the component can be called either with:
    *       <PricingCountrySelector selectedCountryCode="NL" />
    *       or with:
    *       <PricingCountrySelector selectedCountryCode="NL" basePath="/admin/pricing/tax-rules" />
 */
type PricingCountrySelectorProps = {
    selectedCountryCode: string;
    basePath?: string;
    pricingMarkets: {countryCode: string; countryName: string;}[];
};

/**
 * Purpose:
 * Changes the country shown on a financial configuration page.
 *
 * Example:
 *
 * Pricing:
 * /admin/pricing?country=BE
 *
 * Tax rules:
 * /admin/pricing/tax-rules?country=BE
 *
 * Changing the URL causes the server page to run again and
 * load the configuration belonging to the selected country.
 * 
 * Please note: basePath = "/admin/pricing"
 * Because basePath is optional, we give it a default here:basePath = "/admin/pricing"
 */
export default function PricingCountrySelector({selectedCountryCode, pricingMarkets, basePath = "/admin/pricing"}: PricingCountrySelectorProps) {

    const router = useRouter();

    function handleCountryChange(event: ChangeEvent<HTMLSelectElement>) {
        const countryCode = event.target.value;
        router.push(`${basePath}?country=${encodeURIComponent(countryCode)}` );
    }

    return (
        <label>
            <span className={formStyles.span}>Country</span>
            <select value={selectedCountryCode} onChange={handleCountryChange} className={formStyles.inputWFullCyan} >
                {pricingMarkets.map((pricingMarket) => (
                    <option key={pricingMarket.countryCode} value={pricingMarket.countryCode}>
                        {pricingMarket.countryName}
                    </option>
                ))}
            </select>
        </label>
    );
}