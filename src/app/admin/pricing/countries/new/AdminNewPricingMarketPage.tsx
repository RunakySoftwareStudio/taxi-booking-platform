
import Link from "next/link";

import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { formStyles, pageStyles } from "@/styles/classNames";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

import { createJourneyEffectiveDate } from "@/lib/pricing/createJourneyEffectiveDate";

/* ===== Pricing market template data ===== */
type PricingMarketTemplateRow = {
    id: string;
    template_code: string;
    template_name: string;
    service_category: string;
};

/* ===== Add pricing market page props ===== */
type AdminNewPricingMarketPageProps = {
    searchParams: Promise<{ error?: string }>;
};

/**
 * Purpose:
 * Admin page for onboarding a new pricing market.
 *
 * The final form will create a review-required market and generate
 * its initial financial configuration from a selected template.
 */

/* ===== Create pricing market server action ===== */
async function createPricingMarket(formData: FormData) {
    "use server";

    const adminUser = await requireAdminUser();

    /* ===== Read and normalize form values ===== */
    const countryCode = String(formData.get("countryCode") || "").trim().toUpperCase();
    const countryName = String(formData.get("countryName") || "").trim();
    const currencyCode = String(formData.get("currencyCode") || "").trim().toUpperCase();
    const timeZone = String(formData.get("timeZone") || "").trim();
    const templateCode = String(formData.get("templateCode") || "").trim().toUpperCase();
    const plannedEffectiveFrom = String(formData.get("plannedEffectiveFrom") || "").trim();

    /* ===== Basic server validation ===== */
    if (!countryCode || !countryName || !currencyCode || !timeZone || !templateCode || !plannedEffectiveFrom) {
        redirect("/admin/pricing/countries/new?error=incomplete");
    }

    if (!/^[A-Z]{2}$/.test(countryCode) || !/^[A-Z]{3}$/.test(currencyCode)) {
        redirect("/admin/pricing/countries/new?error=invalid-code");
    }

    /* ===== Convert local planned date/time into a real timestamp ===== */
    const [plannedDate, plannedTime] = plannedEffectiveFrom.split("T");

    if (!plannedDate || !plannedTime) {
        redirect("/admin/pricing/countries/new?error=invalid-date");
    }

    let plannedEffectiveDate: Date;

    try {
        plannedEffectiveDate = createJourneyEffectiveDate(plannedDate, plannedTime, timeZone);
    } catch {
        redirect("/admin/pricing/countries/new?error=invalid-date");
    }

    /* ===== Create market and generated financial configuration ===== */
    const { data: newPricingMarketId, error } = await supabaseAdmin.rpc("create_pricing_market", {
        p_country_code: countryCode,
        p_country_name: countryName,
        p_currency_code: currencyCode,
        p_time_zone: timeZone,
        p_template_code: templateCode,
        p_planned_effective_from: plannedEffectiveDate.toISOString(),
        p_created_by_user_id: adminUser.id,
    });

    if (error) {
        console.error("Could not create pricing market:", error);
        redirect("/admin/pricing/countries/new?error=create-failed");
    }

    if (!newPricingMarketId) {redirect("/admin/pricing/countries/new?error=create-failed");}

    /* ===== Creation completed ===== */
    redirect("/admin/pricing/countries");
}

export default async function AdminNewPricingMarketPage({ searchParams }: AdminNewPricingMarketPageProps) {
    await requireAdminUser();

    /* ===== Read page search parameters ===== */
    const pageSearchParams = await searchParams;
    
    /* ===== Load available pricing market templates ===== */
    const { data: pricingMarketTemplateData, error: pricingMarketTemplateError } = await supabaseAdmin
        .from("pricing_market_templates")
        .select("id, template_code, template_name, service_category")
        .order("template_name", { ascending: true });

    if (pricingMarketTemplateError) { console.error("Could not load pricing market templates:", pricingMarketTemplateError); }

    const pricingMarketTemplates = (pricingMarketTemplateData ?? []) as PricingMarketTemplateRow[];

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>

                {/* ===== Page navigation ===== */}
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                    <Link href="/admin" className={formStyles.link}>← Back to admin</Link>
                    <span className="text-slate-600">|</span>
                    <Link href="/admin/pricing/countries" className={formStyles.link}>Pricing markets</Link>
                </div>

                {/* ===== Page title and description ===== */}
                <p className={pageStyles.pageLabelUpper}>Financial configuration</p>
                <h1 className={pageStyles.pageTitle}>Add pricing market</h1>

                <p className={pageStyles.pageDescription}>
                    Create a new country pricing market and generate its initial financial configuration from a reusable template.
                </p>

                {/* ===== Form error messages ===== */}
                {pageSearchParams.error === "incomplete" && (
                    <p className={pageStyles.errorMsg}>Please complete all required fields.</p>
                )}

                {pageSearchParams.error === "invalid-code" && (
                    <p className={pageStyles.errorMsg}>Country code must contain 2 letters and currency code must contain 3 letters.</p>
                )}

                {pageSearchParams.error === "invalid-date" && (
                    <p className={pageStyles.errorMsg}>The planned effective date, time, or time zone is invalid.</p>
                )}

                {pageSearchParams.error === "create-failed" && (
                    <p className={pageStyles.errorMsg}>Could not create the pricing market. Please check the configuration and try again.</p>
                )}

                {/* ===== Add country form ===== */}
                <form action={createPricingMarket} className="mt-6 max-w-2xl space-y-6">

                    {/* ===== Country information ===== */}
                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-cyan-300">Country information</h2>

                        <div className="grid gap-4 sm:grid-cols-2">

                            {/* Country code */}
                            <label>
                                <span className={formStyles.span}>Country code</span>
                                <input type="text" name="countryCode" maxLength={2} placeholder="DE" className={formStyles.inputWFullCyan} required />
                            </label>

                            {/* Country name */}
                            <label>
                                <span className={formStyles.span}>Country name</span>
                                <input type="text" name="countryName" placeholder="Germany" className={formStyles.inputWFullCyan} required />
                            </label>

                            {/* Currency code */}
                            <label>
                                <span className={formStyles.span}>Currency code</span>
                                <input type="text" name="currencyCode" maxLength={3} placeholder="EUR" className={formStyles.inputWFullCyan} required />
                            </label>

                            {/* Time zone */}
                            <label>
                                <span className={formStyles.span}>Time zone</span>
                                <input type="text" name="timeZone" placeholder="Europe/Berlin" className={formStyles.inputWFullCyan} required />
                            </label>

                        </div>
                    </section>

                    {/* ===== Pricing template ===== */}
                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-cyan-300">Pricing template</h2>

                        <label>
                            <span className={formStyles.span}>Template</span>
                            <select name="templateCode" defaultValue="" className={formStyles.inputWFullCyan} required>
                                <option value="" disabled>Select pricing template</option>

                                {pricingMarketTemplates.map((pricingMarketTemplate) => (
                                    <option key={pricingMarketTemplate.id} value={pricingMarketTemplate.template_code}>
                                        {pricingMarketTemplate.template_name} ({pricingMarketTemplate.service_category})
                                    </option>
                                ))}
                            </select>
                        </label>
                    </section>

                    {/* ===== Planned effective date ===== */}
                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-cyan-300">Planned effective date</h2>

                        <label>
                            <span className={formStyles.span}>Planned start date and time</span>
                            <input type="datetime-local" name="plannedEffectiveFrom" className={`${formStyles.inputWFullCyan} datetimeInput`} required />
                        </label>

                        <p className="mt-2 text-sm text-slate-400">
                            Choose a future date and time for the new market&apos;s initial financial configuration.
                        </p>
                    </section>

                    {/* ===== Create pricing market action ===== */}
                    <section>
                        <button type="submit" className={formStyles.smallButton}>Create pricing market</button>
                    </section>
                </form>

            </div>
        </main>
    );
}