
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";
import DateTimeInputWithClear from "../../DateTimeInputWithClear";

type AdminTaxRuleDetailPageProps = {
    params: Promise<{ taxRuleId: string }>;
    searchParams: Promise<{ country?: string; error?: string }>;
};

type TaxRuleRow = {
    id: string;
    country_code: string;
    tax_name: string;
    service_category: string;
    tax_rate_percentage: string;
    status: string;
    effective_from: string;
    effective_until: string | null;
    activated_at: string | null;
};

function formatDate(dateValue: string | null): string {
    if (!dateValue) { return "Open"; }
    return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dateValue));
}

// This turns: 2026-08-20T11:00:00.000Z into: 2026-08-20T11:00
function formatDateTimeInput(dateValue: string | null): string {
    if (!dateValue) { return ""; }
    return new Date(dateValue).toISOString().slice(0, 16);
}

async function createTaxRuleDraft(formData: FormData) {
    "use server";

    const adminUser = await requireAdminUser();
    const sourceTaxRuleId = String(formData.get("taxRuleId") || "").trim();
    const countryCode = String(formData.get("countryCode") || "").trim().toUpperCase();

    if (!sourceTaxRuleId) { redirect(`/admin/pricing/tax-rules?country=${countryCode}`); }

    const { data: draftTaxRuleId, error } = await supabaseAdmin.rpc("create_tax_rule_draft", {
        p_source_tax_rule_id: sourceTaxRuleId,
        p_created_by_user_id: adminUser.id,
    });

    if (error) {
        console.error("Could not create tax-rule draft:", error);
        redirect(`/admin/pricing/tax-rules/${sourceTaxRuleId}?country=${countryCode}`);
    }

    if (!draftTaxRuleId) { redirect(`/admin/pricing/tax-rules/${sourceTaxRuleId}?country=${countryCode}`); }

    redirect(`/admin/pricing/tax-rules/${draftTaxRuleId}?country=${countryCode}`);
}

async function updateTaxRuleDraft(formData: FormData) {
    "use server";

    await requireAdminUser();

    const taxRuleId = String(formData.get("taxRuleId") || "").trim();
    const countryCode = String(formData.get("countryCode") || "").trim().toUpperCase();
    const taxName = String(formData.get("taxName") || "").trim();
    const taxRatePercentage = Number(formData.get("taxRatePercentage"));
    const effectiveFrom = String(formData.get("effectiveFrom") || "").trim();
    const effectiveUntil = String(formData.get("effectiveUntil") || "").trim();

    // check if effectiveUntil <= effectiveFrom
    if (effectiveUntil && effectiveUntil <= effectiveFrom) {
        redirect(`/admin/pricing/tax-rules/${taxRuleId}?country=${countryCode}&error=effective-until-before-start`);
    }

    const { error } = await supabaseAdmin.rpc("update_tax_rule_draft", {
        p_tax_rule_id: taxRuleId,
        p_tax_name: taxName,
        p_tax_rate_percentage: taxRatePercentage,
        p_effective_from: effectiveFrom,
        p_effective_until: effectiveUntil || null,
    });

    if (error) {
        console.error("Could not update tax-rule draft:", error);
        // stay in the same page if erro happens
        redirect(`/admin/pricing/tax-rules/${taxRuleId}?country=${countryCode}`);
    }
    // go back to main page after saving
    redirect(`/admin/pricing/tax-rules?country=${countryCode}`);
}

async function cancelTaxRuleDraft(formData: FormData) {
    "use server";

    await requireAdminUser();

    const taxRuleId = String(formData.get("taxRuleId") || "").trim();
    const countryCode = String(formData.get("countryCode") || "").trim().toUpperCase();
    const { error } = await supabaseAdmin.rpc("cancel_tax_rule_draft", { p_tax_rule_id: taxRuleId });

    if (error) {
        console.error("Could not cancel tax-rule draft:", error);
        redirect(`/admin/pricing/tax-rules/${taxRuleId}?country=${countryCode}`);
    }

    redirect(`/admin/pricing/tax-rules?country=${countryCode}`);
}

/**
 * Purpose:
 * Displays one tax-rule version.
 *
 * Active tax rules are read-only here.
 * Changes to an active rule will later be made through a draft version.
 */
export default async function AdminTaxRuleDetailPage({ params, searchParams }: AdminTaxRuleDetailPageProps) {
    await requireAdminUser();

    const { taxRuleId } = await params;
    const pageSearchParams = await searchParams;

    const { data, error } = await supabaseAdmin
        .from("tax_rules")
        .select(`
            id,
            country_code,
            tax_name,
            service_category,
            tax_rate_percentage,
            status,
            effective_from,
            effective_until,
            activated_at
        `)
        .eq("id", taxRuleId)
        .maybeSingle();

    if (error) { console.error("Could not load tax rule:", error); }
    if (error || !data) { notFound(); }

    const taxRule = data as TaxRuleRow;
    const countryCode = String(pageSearchParams.country || taxRule.country_code).trim().toUpperCase();

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                <Link href={`/admin/pricing/tax-rules?country=${countryCode}`} className={formStyles.link}>Back to tax rules</Link>
                {taxRule.status === "draft" ? (
                    <>
                        {/*Show error message*/} 
                        {pageSearchParams.error === "effective-until-before-start" && (
                            <p className={pageStyles.errorMsg}>Effective until must be later than effective from.</p>
                        )}
                        <form action={updateTaxRuleDraft} className="mt-6 max-w-2xl rounded-xl border border-cyan-400/20 bg-slate-900 p-5">
                            <input type="hidden" name="taxRuleId" value={taxRule.id}/>
                            <input type="hidden" name="countryCode" value={taxRule.country_code}/>

                            <p className="mb-4"><span className="font-medium text-cyan-300">Country: </span>{taxRule.country_code}</p>
                            <p className="mb-4"><span className="font-medium text-cyan-300">Service: </span>{taxRule.service_category}</p>

                            <label className="mb-4 block">
                                <span className={formStyles.span}>Tax name</span>
                                <input name="taxName" defaultValue={taxRule.tax_name} className={formStyles.inputWFullCyan} required/>
                            </label>

                            <label className="mb-4 block">
                                <span className={formStyles.span}>Tax rate percentage</span>
                                <input name="taxRatePercentage" type="number" min="0" max="100" step="0.01" defaultValue={taxRule.tax_rate_percentage} className={formStyles.inputWFullCyan} required/>
                            </label>

                            <label className="mb-4 block">
                                <span className={formStyles.span}>Effective from</span>
                                    {/*
                                        className={`${formStyles.inputWFullCyan} datetimeInput`}  
                                            formStyles.inputWFullCyan  → your normal Voya input appearance from classNames.ts (Tailwind class)
                                            datetimeInput → special browser calendar styling from globals.css
                                    */}
                                    <input name="effectiveFrom" type="datetime-local" 
                                        defaultValue={formatDateTimeInput(taxRule.effective_from)}
                                        className={`${formStyles.inputWFullCyan} datetimeInput`} required
                                    />
                            </label>


                            <label className="mb-5 block">
                                <span className={formStyles.span}>Effective until</span>
                                <DateTimeInputWithClear name="effectiveUntil" defaultValue={formatDateTimeInput(taxRule.effective_until)}/>
                            </label>

                            <div className="flex gap-3">
                                <button type="submit" className={formStyles.smallButton}>
                                    Save draft
                                </button>

                                <Link href={`/admin/pricing/tax-rules?country=${taxRule.country_code}`} className={formStyles.smallButton}>
                                    Cancel
                                </Link>
                                {/**
                                 * Because the Cancel button is inside the same form as required fields, 
                                 * the browser may otherwise block cancellation if one of the editable fields is temporarily invalid or empty. 
                                 * formNoValidate:
                                    * Save draft   → validate form fields first
                                    * Cancel draft → ignore form validation and delete the draft
                                */}
                                <button type="submit" formAction={cancelTaxRuleDraft} formNoValidate className={formStyles.smallButton}>
                                    Delete draft
                                </button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="mt-6 max-w-2xl rounded-xl border border-cyan-400/20 bg-slate-900 p-5">
                        <p className="mb-2"><span className="font-medium text-cyan-300">Country: </span>{taxRule.country_code}</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Tax rule: </span>{taxRule.tax_name}</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Service: </span>{taxRule.service_category}</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Rate: </span>{Number(taxRule.tax_rate_percentage)}%</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Status: </span>{taxRule.status}</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Effective from: </span>{formatDate(taxRule.effective_from)}</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Effective until: </span>{formatDate(taxRule.effective_until)}</p>
                        <p><span className="font-medium text-cyan-300">Activated: </span>{formatDate(taxRule.activated_at)}</p>
                    </div>
                )}
                
                {taxRule.status === "active" && (
                    <form action={createTaxRuleDraft} className="mt-5">
                        <input type="hidden" name="taxRuleId" value={taxRule.id}/>
                        <input type="hidden" name="countryCode" value={taxRule.country_code}/>
                        <button type="submit" className={formStyles.smallButton}>Create draft</button>
                    </form>
                )}
            </div>

        </main>
    );
}