
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";
import DateTimeInputWithClear from "../../DateTimeInputWithClear";

type AdminRoundingRuleDetailPageProps = {
    params: Promise<{ roundingRuleId: string }>;
    searchParams: Promise<{ country?: string; error?: string }>;
};

type RoundingRuleRow = {
    id: string;
    country_code: string;
    currency_code: string;
    rounding_increment: string;
    rounding_mode: string;
    status: string;
    effective_from: string;
    effective_until: string | null;
    activated_at: string | null;
};

function formatDate(dateValue: string | null): string {
    if (!dateValue) { return "Open"; }
    return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dateValue));
}

/**
 * Purpose:
 * Displays one currency-rounding-rule version.
 *
 * Active rules remain read-only.
 * Changes to an active rule are made through a draft version.
 */
export default async function AdminRoundingRuleDetailPage({ params, searchParams }: AdminRoundingRuleDetailPageProps) {
    await requireAdminUser();

    const { roundingRuleId } = await params;
    const pageSearchParams = await searchParams;

    const { data, error } = await supabaseAdmin
        .from("currency_rounding_rules")
        .select(`
            id,
            country_code,
            currency_code,
            rounding_increment,
            rounding_mode,
            status,
            effective_from,
            effective_until,
            activated_at
        `)
        .eq("id", roundingRuleId)
        .maybeSingle();

    if (error) { console.error("Could not load currency rounding rule:", error); }
    if (error || !data) { notFound(); }

    const roundingRule = data as RoundingRuleRow;
    const countryCode = String(pageSearchParams.country || roundingRule.country_code).trim().toUpperCase();


    /**
     * Purpose:
     * Converts a database timestamp into the format required by
     * an HTML input with type="datetime-local".
     *
     * Example:
     * 2027-01-01T00:00:00.000Z -> 2027-01-01T00:00
     *
     * A null date becomes an empty input value.
     */
    async function createRoundingRuleDraft(formData: FormData) {
        "use server";

        const adminUser = await requireAdminUser();
        const sourceRoundingRuleId = String(formData.get("roundingRuleId") || "").trim();
        const countryCode = String(formData.get("countryCode") || "").trim().toUpperCase();

        if (!sourceRoundingRuleId) { redirect(`/admin/pricing/rounding-rules?country=${countryCode}`); }

        const { data: draftRoundingRuleId, error } = await supabaseAdmin.rpc("create_currency_rounding_rule_draft", {
            p_source_rounding_rule_id: sourceRoundingRuleId,
            p_created_by_user_id: adminUser.id,
        });

        if (error) {
            console.error("Could not create currency rounding-rule draft:", error);
            redirect(`/admin/pricing/rounding-rules/${sourceRoundingRuleId}?country=${countryCode}`);
        }

        if (!draftRoundingRuleId) { redirect(`/admin/pricing/rounding-rules/${sourceRoundingRuleId}?country=${countryCode}`); }

        redirect(`/admin/pricing/rounding-rules/${draftRoundingRuleId}?country=${countryCode}`);
    }

    /**
     * Purpose:
     * Creates an editable draft from an existing active currency-rounding rule.
     *
     * The database RPC either creates a new draft or returns the existing
     * draft for the same country/currency family.
     *
     * After creation, the administrator is redirected to the draft detail page.
     */
    function formatDateTimeInput(dateValue: string | null): string {
        if (!dateValue) { return ""; }
        return new Date(dateValue).toISOString().slice(0, 16);
    }

    /**
     * Purpose:
     * Saves editable values of an unfinished currency-rounding-rule draft.
     *
     * Editable values:
     * - rounding increment;
     * - rounding mode;
     * - effective-from;
     * - effective-until.
     *
     * Country and currency remain immutable.
     * The server also checks that effective-until is later than effective-from
     * before sending the update to the protected database RPC.
     *
     * After a successful save, the administrator returns to the
     * Currency Rounding Rules Management page.
     */
    async function updateRoundingRuleDraft(formData: FormData) {
        "use server";

        await requireAdminUser();

        const roundingRuleId = String(formData.get("roundingRuleId") || "").trim();
        const countryCode = String(formData.get("countryCode") || "").trim().toUpperCase();
        const roundingIncrement = Number(formData.get("roundingIncrement"));
        const roundingMode = String(formData.get("roundingMode") || "").trim();
        const effectiveFrom = String(formData.get("effectiveFrom") || "").trim();
        const effectiveUntil = String(formData.get("effectiveUntil") || "").trim();

        if (effectiveUntil && effectiveUntil <= effectiveFrom) {
            redirect(`/admin/pricing/rounding-rules/${roundingRuleId}?country=${countryCode}&error=effective-until-before-start`);
        }

        const { error } = await supabaseAdmin.rpc("update_currency_rounding_rule_draft", {
            p_rounding_rule_id: roundingRuleId,
            p_rounding_increment: roundingIncrement,
            p_rounding_mode: roundingMode,
            p_effective_from: effectiveFrom,
            p_effective_until: effectiveUntil || null,
        });

        if (error) {
            console.error("Could not update currency rounding-rule draft:", error);
            redirect(`/admin/pricing/rounding-rules/${roundingRuleId}?country=${countryCode}`);
        }

        redirect(`/admin/pricing/rounding-rules?country=${countryCode}`);
    }

    /**
     * Purpose:
     * Permanently deletes one unfinished currency-rounding-rule draft.
     *
     * Only draft rules can be deleted. The protected database RPC also
     * refuses deletion if the rule is referenced by a journey quote.
     *
     * After deletion, the administrator returns to the main
     * Currency Rounding Rules Management page.
     */
    async function deleteRoundingRuleDraft(formData: FormData) {
        "use server";

        await requireAdminUser();

        const roundingRuleId = String(formData.get("roundingRuleId") || "").trim();
        const countryCode = String(formData.get("countryCode") || "").trim().toUpperCase();

        const { error } = await supabaseAdmin.rpc("cancel_currency_rounding_rule_draft", {
            p_rounding_rule_id: roundingRuleId,
        });

        if (error) {
            console.error("Could not delete currency rounding-rule draft:", error);
            redirect(`/admin/pricing/rounding-rules/${roundingRuleId}?country=${countryCode}`);
        }

        redirect(`/admin/pricing/rounding-rules?country=${countryCode}`);
    }

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                <Link href={`/admin/pricing/rounding-rules?country=${countryCode}`} className={formStyles.link}>Back to rounding rules</Link>

                <p className={pageStyles.pageLabelUpper}>Financial configuration</p>
                <h1 className={pageStyles.pageTitle}>Currency rounding rule details</h1>
                <p className={pageStyles.pageDescription}>Review this rounding-rule version before making lifecycle changes.</p>

                {roundingRule.status === "draft" ? (
                    <>
                        {pageSearchParams.error === "effective-until-before-start" && (
                            <p className={pageStyles.errorMsg}>Effective until must be later than effective from.</p>
                        )}

                        <form action={updateRoundingRuleDraft} className="mt-6 max-w-2xl rounded-xl border border-cyan-400/20 bg-slate-900 p-5">
                            <input type="hidden" name="roundingRuleId" value={roundingRule.id}/>
                            <input type="hidden" name="countryCode" value={roundingRule.country_code}/>

                            <p className="mb-4"><span className="font-medium text-cyan-300">Country: </span>{roundingRule.country_code}</p>
                            <p className="mb-4"><span className="font-medium text-cyan-300">Currency: </span>{roundingRule.currency_code}</p>

                            <label className="mb-4 block">
                                <span className={formStyles.span}>Rounding increment</span>
                                <input name="roundingIncrement" type="number" min="0.0001" step="0.0001"
                                    defaultValue={roundingRule.rounding_increment} className={formStyles.inputWFullCyan} required/>
                            </label>

                            <label className="mb-4 block">
                                <span className={formStyles.span}>Rounding mode</span>
                                <select name="roundingMode" defaultValue={roundingRule.rounding_mode} className={formStyles.inputWFullCyan} required>
                                    <option value="nearest">Nearest</option>
                                    <option value="up">Up</option>
                                    <option value="down">Down</option>
                                </select>
                            </label>

                            <label className="mb-4 block">
                                <span className={formStyles.span}>Effective from</span>
                                <input name="effectiveFrom" type="datetime-local" defaultValue={formatDateTimeInput(roundingRule.effective_from)}
                                    className={`${formStyles.inputWFullCyan} datetimeInput`} required/>
                            </label>

                            <label className="mb-5 block">
                                <span className={formStyles.span}>Effective until</span>
                                <DateTimeInputWithClear name="effectiveUntil" defaultValue={formatDateTimeInput(roundingRule.effective_until)}/>
                            </label>

                            <div className="flex flex-wrap gap-3">
                                <button type="submit" className={formStyles.smallButton}>Save draft</button>
                                <Link href={`/admin/pricing/rounding-rules?country=${roundingRule.country_code}`} className={formStyles.smallButton}>Cancel</Link>
                                <button type="submit" formAction={deleteRoundingRuleDraft} formNoValidate className={formStyles.smallButton}>Delete draft</button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="mt-6 max-w-2xl rounded-xl border border-cyan-400/20 bg-slate-900 p-5">
                        <p className="mb-2"><span className="font-medium text-cyan-300">Country: </span>{roundingRule.country_code}</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Currency: </span>{roundingRule.currency_code}</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Increment: </span>{Number(roundingRule.rounding_increment)}</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Mode: </span>{roundingRule.rounding_mode}</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Status: </span>{roundingRule.status}</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Effective from: </span>{formatDate(roundingRule.effective_from)}</p>
                        <p className="mb-2"><span className="font-medium text-cyan-300">Effective until: </span>{formatDate(roundingRule.effective_until)}</p>
                        <p><span className="font-medium text-cyan-300">Activated: </span>{formatDate(roundingRule.activated_at)}</p>
                    </div>
                )}
                {roundingRule.status === "active" && (
                    <form action={createRoundingRuleDraft} className="mt-5">
                        <input type="hidden" name="roundingRuleId" value={roundingRule.id}/>
                        <input type="hidden" name="countryCode" value={roundingRule.country_code}/>
                        <button type="submit" className={formStyles.smallButton}>Create draft</button>
                    </form>
                )}
            </div>
        </main>
    );
}