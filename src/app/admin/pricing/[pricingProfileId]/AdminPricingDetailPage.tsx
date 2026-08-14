import Link from "next/link";

import { supabaseAdmin } from "@/lib/supabaseServer";
import { formStyles, pageStyles } from "@/styles/classNames";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import DraftPricingNavigationGuard from "./DraftPricingNavigationGuard";
import CancelPricingDraftButton from "./CancelPricingDraftButton";

type AdminPricingDetailPageProps = {
    params: Promise<{ pricingProfileId: string }>;
    searchParams: Promise<{ success?: string }>;
};

type PricingProfileRow = {
    id: string;
    pricing_profile_code: string;
    pricing_profile_name: string;
    pricing_profile_version: number;
    country_code: string;
    currency_code: string;
    quote_validity_minutes: number;
    status: string;
    effective_from: string;
    effective_until: string | null;
    created_at: string;
    updated_at: string;
    activated_at: string | null;
    archived_at: string | null;
};

type PricingRateRow = {
    base_fare_excluding_vat: string;
    distance_rate_per_km_excluding_vat: string;
    duration_rate_per_minute_excluding_vat: string;
    minimum_fare_excluding_vat: string;
};

type TaxRuleRow = {
    tax_name: string;
    service_category: string;
    tax_rate_percentage: string;
    status: string;
    effective_from: string;
    effective_until: string | null;
};

type RoundingRuleRow = {
    rounding_increment: string;
    rounding_mode: string;
    status: string;
    effective_from: string;
    effective_until: string | null;
};

function formatMoney(amountValue: string | number, currencyCode: string): string {
    return new Intl.NumberFormat("en-NL", {
        style: "currency",
        currency: currencyCode,
    }).format(Number(amountValue));
}

function formatDateTime(dateValue: string | null): string {
    if (!dateValue) { return "Not set"; }

    return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        hour12: false,
    }).format(new Date(dateValue));
}

function formatText(textValue: string): string {
    return textValue.replaceAll("_", " ");
}

/*=========================================================
    PURPOSE: CREATE A NEW DRAFT PRICING VERSION

    The admin page is protected by admin/layout.tsx.
    This action checks the admin role again before using
    supabaseAdmin for the financial database operation.

    PostgreSQL performs the profile and rate inserts together
    inside create_pricing_profile_draft().
=========================================================*/
async function createDraftPricingVersion(formData: FormData) {
    "use server";

    const adminUser = await requireAdminUser();
    const sourcePricingProfileId = String(formData.get("sourcePricingProfileId") || "");

    if (!sourcePricingProfileId) {redirect("/admin/pricing?error=missing-source-profile");}

    const { data: newDraftProfileId, error } = await supabaseAdmin.rpc(
        "create_pricing_profile_draft",
        {
            p_source_pricing_profile_id: sourcePricingProfileId,
            p_created_by_user_id: adminUser.id,
        }
    );

    if (error) {
        console.error("Could not create pricing-profile draft:", error);
        redirect(`/admin/pricing/${sourcePricingProfileId}?error=create-draft-failed`);
    }

    if (!newDraftProfileId || typeof newDraftProfileId !== "string") {
        console.error("Draft function did not return a valid profile ID.");
        redirect(`/admin/pricing/${sourcePricingProfileId}?error=invalid-draft-result`);
    }

    revalidatePath("/admin/pricing");
    redirect(`/admin/pricing/${newDraftProfileId}`);
}

/*=========================================================
    PURPOSE: UPDATE A DRAFT PRICING VERSION

    Only draft profiles may be edited.

    Protection:
    1. requireAdminUser() verifies the administrator.
    2. Server-side validation checks submitted values.
    3. PostgreSQL verifies that the profile is still a draft.
    4. PostgreSQL updates profile + rates atomically.
=========================================================*/
async function updateDraftPricingVersion(formData: FormData) {
    "use server";

    await requireAdminUser();

    const pricingProfileId = String(formData.get("pricingProfileId") || "");
    const saveAction = String(formData.get("saveAction") || "");
    const pricingProfileName = String(formData.get("pricingProfileName") || "").trim();
    const quoteValidityText = String(formData.get("quoteValidityMinutes") || "").trim();
    const baseFareText = String(formData.get("baseFareExcludingVat") || "").trim();
    const distanceRateText = String(formData.get("distanceRatePerKmExcludingVat") || "").trim();
    const durationRateText = String(formData.get("durationRatePerMinuteExcludingVat") || "").trim();
    const minimumFareText = String(formData.get("minimumFareExcludingVat") || "").trim();

    if (!pricingProfileId || !pricingProfileName || !quoteValidityText ||
        !baseFareText || !distanceRateText || !durationRateText || !minimumFareText) {
        redirect(`/admin/pricing/${pricingProfileId}?error=missing-fields`);
    }

    const quoteValidityMinutes = Number(quoteValidityText);
    const baseFareExcludingVat = Number(baseFareText);
    const distanceRatePerKmExcludingVat = Number(distanceRateText);
    const durationRatePerMinuteExcludingVat = Number(durationRateText);
    const minimumFareExcludingVat = Number(minimumFareText);

    if (!Number.isInteger(quoteValidityMinutes) || quoteValidityMinutes < 1 || quoteValidityMinutes > 1440) {
        redirect(`/admin/pricing/${pricingProfileId}?error=invalid-quote-validity`);
    }

    const pricingValues = [
        baseFareExcludingVat,
        distanceRatePerKmExcludingVat,
        durationRatePerMinuteExcludingVat,
        minimumFareExcludingVat,
    ];

    //if any value is not a valid number or is negative, reject the request.
    if (pricingValues.some((pricingValue) => !Number.isFinite(pricingValue) || pricingValue < 0)) {
        redirect(`/admin/pricing/${pricingProfileId}?error=invalid-pricing-value`);
    }

    const { data: updatedPricingProfileId, error } = await supabaseAdmin.rpc(
        "update_pricing_profile_draft",
        {
            p_pricing_profile_id: pricingProfileId,
            p_pricing_profile_name: pricingProfileName,
            p_quote_validity_minutes: quoteValidityMinutes,
            p_base_fare_excluding_vat: baseFareExcludingVat,
            p_distance_rate_per_km_excluding_vat: distanceRatePerKmExcludingVat,
            p_duration_rate_per_minute_excluding_vat: durationRatePerMinuteExcludingVat,
            p_minimum_fare_excluding_vat: minimumFareExcludingVat,
        }
    );

    if (error) {
        console.error("Could not update pricing-profile draft:", error);
        redirect(`/admin/pricing/${pricingProfileId}?error=update-draft-failed`);
    }

    if (!updatedPricingProfileId || typeof updatedPricingProfileId !== "string") {
        console.error("Draft update function did not return a valid profile ID.");
        redirect(`/admin/pricing/${pricingProfileId}?error=invalid-update-result`);
    }

    revalidatePath("/admin/pricing");
    revalidatePath(`/admin/pricing/${pricingProfileId}`);
    if (saveAction === "save-and-return") {redirect("/admin/pricing");}
    redirect(`/admin/pricing/${updatedPricingProfileId}`);
}

/*=========================================================
    PURPOSE: ACTIVATE A DRAFT PRICING VERSION

    This changes which pricing version customers will use.

    Flow:
        draft profile
            ↓
        requireAdminUser() verifies the administrator
            ↓
        PostgreSQL locks the pricing family
            ↓
        current active version becomes archived
            ↓
        draft becomes active
            ↓
        both versions receive the same transition timestamp
            ↓
        new customer quotes use the newly active version

    The PostgreSQL function performs the complete transition
    atomically. If any part fails, neither version is changed.
=========================================================*/
async function activateDraftPricingVersion(formData: FormData) {
    "use server";

    const adminUser = await requireAdminUser();
    const pricingProfileId = String(formData.get("pricingProfileId") || "");
    if (!pricingProfileId) { redirect("/admin/pricing?error=missing-profile"); }

    const { data: activatedPricingProfileId, error } = await supabaseAdmin.rpc(
        "activate_pricing_profile_draft",
        {
            p_pricing_profile_id: pricingProfileId,
            p_activated_by_user_id: adminUser.id,
        }
    );

    if (error) {
        console.error("Could not activate pricing-profile draft:", error);
        redirect(`/admin/pricing/${pricingProfileId}?error=activate-draft-failed`);
    }

    if (!activatedPricingProfileId || typeof activatedPricingProfileId !== "string") {
        console.error("Activation function did not return a valid profile ID.");
        redirect(`/admin/pricing/${pricingProfileId}?error=invalid-activation-result`);
    }

    revalidatePath("/admin/pricing");
    revalidatePath(`/admin/pricing/${pricingProfileId}`);

    redirect(`/admin/pricing/${activatedPricingProfileId}`);
}

/**
 * PURPOSE: CANCEL AN UNFINISHED PRICING DRAFT
 *
 * Only administrators can request this operation.
 *
 * PostgreSQL performs the safety checks:
 * - profile must still exist;
 * - status must still be draft;
 * - quoted financial versions cannot be deleted.
 *
 * pricing_rates are deleted automatically by the database
 * through ON DELETE CASCADE.
 */
async function cancelDraftPricingVersion(formData: FormData) {
    "use server";

    await requireAdminUser();

    const pricingProfileId = String(formData.get("pricingProfileId") || "");
    if (!pricingProfileId) { redirect("/admin/pricing?error=missing-profile");}

    const { error } = await supabaseAdmin.rpc("cancel_pricing_profile_draft", {p_pricing_profile_id: pricingProfileId,});
    if (error) {
        console.error("Could not cancel pricing-profile draft:", error);
        redirect(`/admin/pricing/${pricingProfileId}?error=cancel-draft-failed`);
    }

    revalidatePath("/admin/pricing");
    redirect("/admin/pricing?success=draft-cancelled");
}

/**
 * Creates one special pricing period.
 *
 * Used for Holiday and Event pricing only.
 *
 * Lower priority number = higher priority.
 */
async function createPricingScheduleOverride(formData: FormData) {
    "use server";

    await requireAdminUser();

    const pricingProfileId = String(formData.get("pricingProfileId") || "");
    const overrideName = String(formData.get("overrideName") || "").trim();
    const startDate = String(formData.get("startDate") || "").trim();
    const startTime = String(formData.get("startTime") || "").trim();
    const endDate = String(formData.get("endDate") || "").trim();
    const endTime = String(formData.get("endTime") || "").trim();

    const startLocalDateTime = `${startDate}T${startTime}`;
    const endLocalDateTime = `${endDate}T${endTime}`;
    const priorityText = String(formData.get("priority") || "").trim();

    if (!pricingProfileId || !overrideName || !startDate || !startTime ||
        !endDate || !endTime || !priorityText) {
        redirect(`/admin/pricing/${pricingProfileId}?error=missing-override-fields`);
    }

    const priority = Number(priorityText);

    if (!Number.isInteger(priority) || priority < 1) {
        redirect(`/admin/pricing/${pricingProfileId}?error=invalid-override-priority`);
    }

    if (startLocalDateTime >= endLocalDateTime) {
        redirect(`/admin/pricing/${pricingProfileId}?error=invalid-override-period`);
    }

    const { data: pricingProfile, error: profileError } = await supabaseAdmin
        .from("pricing_profiles")
        .select("pricing_profile_code, country_code, status")
        .eq("id", pricingProfileId)
        .maybeSingle();

    if (profileError || !pricingProfile) {
        redirect(`/admin/pricing/${pricingProfileId}?error=pricing-profile-not-found`);
    }

    if (
        pricingProfile.status !== "active" ||
        !["NL_HOLIDAY_STANDARD", "NL_EVENT_STANDARD"].includes(pricingProfile.pricing_profile_code)
    ) {
        redirect(`/admin/pricing/${pricingProfileId}?error=invalid-override-profile`);
    }

    const { error } = await supabaseAdmin
        .from("pricing_schedule_overrides")
        .insert({
            country_code: pricingProfile.country_code,
            service_category: "passenger_transport",
            override_name: overrideName,
            start_local_datetime: startLocalDateTime,
            end_local_datetime: endLocalDateTime,
            pricing_profile_code: pricingProfile.pricing_profile_code,
            priority,
        });

    if (error) {
        console.error("Could not create pricing schedule override:", error);
        redirect(`/admin/pricing/${pricingProfileId}?error=create-override-failed`);
    }

    revalidatePath(`/admin/pricing/${pricingProfileId}`);
    redirect(`/admin/pricing/${pricingProfileId}?success=override-created`);
}

/**
 * Purpose:
 * Displays the complete read-only configuration of one
 * versioned pricing profile.
 */
export default async function AdminPricingDetailPage({ params, searchParams}: AdminPricingDetailPageProps) {

    const { pricingProfileId } = await params;
    const { success } = await searchParams;
    const { data: profileData, error: profileError } = await supabaseAdmin
        .from("pricing_profiles")
        .select(`
            id,
            pricing_profile_code,
            pricing_profile_name,
            pricing_profile_version,
            country_code,
            currency_code,
            quote_validity_minutes,
            status,
            effective_from,
            effective_until,
            created_at,
            updated_at,
            activated_at,
            archived_at
        `)
        .eq("id", pricingProfileId)
        .maybeSingle();

    if (profileError || !profileData) {
        console.error("Could not load pricing profile:", profileError);

        return (
            <main className={pageStyles.main}>
                <div className={pageStyles.containerMedium}>
                    <Link href="/admin/pricing" className={formStyles.link}>Back to pricing</Link>
                    <h1 className={pageStyles.pageTitle}>Pricing profile details</h1>
                    <p className={pageStyles.errorMsg}>Could not load this pricing profile.</p>
                </div>
            </main>
        );
    }

    const pricingProfile = profileData as PricingProfileRow;
    const serviceCategory = "passenger_transport";
    const applicableAt = pricingProfile.effective_from;

    /*
     * Pricing rates are directly connected to the profile ID.
     *
     * Tax and rounding rules are selected using the profile's
     * market and effective date. Website language is never used.
     */
    const [rateResult, taxResult, roundingResult] = await Promise.all([
        supabaseAdmin
            .from("pricing_rates")
            .select(`
                base_fare_excluding_vat,
                distance_rate_per_km_excluding_vat,
                duration_rate_per_minute_excluding_vat,
                minimum_fare_excluding_vat
            `)
            .eq("pricing_profile_id", pricingProfile.id)
            .maybeSingle(),

        supabaseAdmin
            .from("tax_rules")
            .select(`
                tax_name,
                service_category,
                tax_rate_percentage,
                status,
                effective_from,
                effective_until
            `)
            .eq("country_code", pricingProfile.country_code)
            .eq("service_category", serviceCategory)
            .lte("effective_from", applicableAt)
            .or(`effective_until.is.null,effective_until.gt.${applicableAt}`)
            .order("effective_from", { ascending: false })
            .limit(1)
            .maybeSingle(),

        supabaseAdmin
            .from("currency_rounding_rules")
            .select(`
                rounding_increment,
                rounding_mode,
                status,
                effective_from,
                effective_until
            `)
            .eq("country_code", pricingProfile.country_code)
            .eq("currency_code", pricingProfile.currency_code)
            .lte("effective_from", applicableAt)
            .or(`effective_until.is.null,effective_until.gt.${applicableAt}`)
            .order("effective_from", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    const loadError = rateResult.error ?? taxResult.error ?? roundingResult.error;
    if (loadError) { console.error("Could not load pricing profile configuration:", loadError);}

    const pricingRate = rateResult.data as PricingRateRow | null;
    const taxRule = taxResult.data as TaxRuleRow | null;
    const roundingRule = roundingResult.data as RoundingRuleRow | null;

    const cardClass = "rounded-xl border border-cyan-400/20 bg-slate-900 p-5";
    const titleClass = "mb-4 text-lg font-semibold text-cyan-300";
    const rowClass = "mb-2 text-sm";
    const labelClass = "font-medium text-cyan-300";
    const valueClass = "text-white";

    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>
                {pricingProfile.status === "draft"
                    ? (<DraftPricingNavigationGuard formId="draft-pricing-form" saveAndReturnButtonId="draft-save-and-return"/> )
                    : (
                        <Link href="/admin/pricing" className={formStyles.link}>
                            Back to pricing
                        </Link>)
                }

                <p className={pageStyles.pageLabelUpper}>Financial configuration</p>
                <h1 className={pageStyles.pageTitle}>{pricingProfile.pricing_profile_name}</h1>

                <p className={pageStyles.pageDescription}>
                    Read-only configuration for version {pricingProfile.pricing_profile_version}.
                </p>
                {/*=========================================================
                    PURPOSE: EDIT DRAFT PRICING

                    This form is shown only when the selected pricing profile
                    has status = "draft" and a pricing_rates record exists.

                    The administrator may edit:
                    - pricing profile name;
                    - quote validity in minutes;
                    - base fare excluding VAT;
                    - distance rate per kilometre excluding VAT;
                    - duration rate per minute excluding VAT;
                    - minimum fare excluding VAT.

                    The following values remain read-only because they define
                    the pricing family, market, lifecycle, or shared rules:
                    - pricing profile code;
                    - version;
                    - country;
                    - currency;
                    - status;
                    - VAT rule;
                    - currency rounding rule.

                    When Save draft pricing is clicked:
                        form values
                            ↓
                        updateDraftPricingVersion()
                            ↓
                        requireAdminUser() verifies the administrator
                            ↓
                        server-side validation checks submitted values
                            ↓
                        PostgreSQL update_pricing_profile_draft()
                            ↓
                        PostgreSQL verifies status = draft
                            ↓
                        pricing_profiles + pricing_rates are updated atomically
                            ↓
                        page reloads with the saved draft values

                    Active and archived pricing versions never show this form
                    and PostgreSQL also rejects attempts to edit them.
                =========================================================*/}
                {pricingProfile.status === "draft" && pricingRate ? (
                    <>
                        <form id="draft-pricing-form" action={updateDraftPricingVersion} className={formStyles.form}>
                            <input type="hidden" name="pricingProfileId" value={pricingProfile.id} />
                            <button id="draft-save-and-return" type="submit" name="saveAction" value="save-and-return" className="hidden">
                                Save and return
                            </button>
                            <h2 className="mb-4 text-lg font-semibold text-cyan-300">Edit draft pricing</h2>

                            <div className="grid gap-4 md:grid-cols-2">
                                <label>
                                    <span className={formStyles.span}>Profile name</span>
                                    <input type="text" name="pricingProfileName" defaultValue={pricingProfile.pricing_profile_name}
                                        className={formStyles.inputWFullCyan} required />
                                </label>

                                <label>
                                    <span className={formStyles.span}>Quote validity (minutes)</span>
                                    <input type="number" name="quoteValidityMinutes" defaultValue={pricingProfile.quote_validity_minutes}
                                        min="1" max="1440" step="1" className={formStyles.inputWFullCyan} required />
                                </label>

                                {/*step="0.0001" matches our database precision: NUMERIC(12,4)*/}
                                <label>
                                    <span className={formStyles.span}>Base fare excluding VAT</span>
                                    <input type="number" name="baseFareExcludingVat" defaultValue={pricingRate.base_fare_excluding_vat}
                                        min="0" step="0.0001" className={formStyles.inputWFullCyan} required />
                                </label>

                                <label>
                                    <span className={formStyles.span}>Rate per kilometre excluding VAT</span>
                                    <input type="number" name="distanceRatePerKmExcludingVat" defaultValue={pricingRate.distance_rate_per_km_excluding_vat}
                                        min="0" step="0.0001" className={formStyles.inputWFullCyan} required />
                                </label>

                                <label>
                                    <span className={formStyles.span}>Rate per minute excluding VAT</span>
                                    <input type="number" name="durationRatePerMinuteExcludingVat" defaultValue={pricingRate.duration_rate_per_minute_excluding_vat}
                                        min="0" step="0.0001" className={formStyles.inputWFullCyan} required />
                                </label>

                                <label>
                                    <span className={formStyles.span}>Minimum fare excluding VAT</span>
                                    <input type="number" name="minimumFareExcludingVat" defaultValue={pricingRate.minimum_fare_excluding_vat}
                                        min="0" step="0.0001" className={formStyles.inputWFullCyan} required />
                                </label>
                            </div>
                        </form>

                        <div className="grid gap-4 md:grid-cols-2">
                            <button type="submit" className={`${formStyles.smallButton} mt-5`}>
                                Save draft pricing
                            </button>
                            {/* =========================================================
                                PURPOSE: CANCEL UNFINISHED PRICING DRAFT

                                This permanently removes only this draft version.

                                PostgreSQL verifies that:
                                - the profile is still a draft;
                                - it is not referenced by a journey quote.
                                The currently active pricing version is not changed

                                we give the form the name-like identifier: cancel-pricing-draft-form
                                form has ID: form id="cancel-pricing-draft-form"
                                cancel-pricing-draft-form
                                        ↓
                                CancelPricingDraftButton receives that ID
                                        ↓
                                user confirms "Yes, cancel draft"
                                        ↓
                                document.getElementById(...)    [Inside CancelPricingDraftButton.tsx, this line uses it: const form = document.getElementById(formId);]
                                        ↓
                                finds that exact form
                                        ↓
                                form.requestSubmit()
                                        ↓
                                cancelDraftPricingVersion() runs on server
                            ========================================================= */}
                            <form action={cancelDraftPricingVersion} className="mt-4">
                                <input type="hidden" name="pricingProfileId" value={pricingProfile.id}/>
                                <CancelPricingDraftButton pricingProfileVersion={pricingProfile.pricing_profile_version}/>
                            </form>
                        </div>

                     </>
                ) : null}

                {/*=========================================================
                    PURPOSE: ACTIVATE DRAFT PRICIN

                    Activation makes this draft the official pricing version
                    used for new customer quotes.

                    PostgreSQL performs both changes together:
                    - current active version → archived;
                    - this draft version → active.

                    The old version receives effective_until and the new
                    version receives effective_from at exactly the same time.

                    After activation this version becomes read-only.
                =========================================================*/}
                {pricingProfile.status === "draft" ? (
                    <section className="mt-6 rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-4">
                        <h2 className="text-lg font-semibold text-yellow-200">Activate pricing version</h2>

                        <p className="mt-2 text-sm text-slate-300">
                            Activating Version {pricingProfile.pricing_profile_version} will make these prices active for new customer quotes.
                            The current active version will automatically be archived.
                        </p>

                        <form action={activateDraftPricingVersion} className="mt-4">
                            <input type="hidden" name="pricingProfileId" value={pricingProfile.id} />
                            <button type="submit" className={formStyles.smallButton}>
                                Activate Version {pricingProfile.pricing_profile_version}
                            </button>
                        </form>
                    </section>
                ) : null}

                {/*
                    Button is clicked
                            ↓
                    Form calls createDraftPricingVersion
                            ↓
                    requireAdminUser verifies the administrator
                            ↓
                    PostgreSQL creates the profile and rates atomically
                            ↓
                    Page redirects to the new draft
                */}
                {pricingProfile.status === "active" ? (
                    <form action={createDraftPricingVersion} className="mb-6">
                        <input type="hidden" name="sourcePricingProfileId" value={pricingProfile.id} />
                        <button type="submit" className={formStyles.smallButton}>Create draft version</button>
                    </form>
                ) : null}

                {loadError ? (<p className={pageStyles.errorMsg}>Some related pricing configuration could not be loaded.</p>) : null}
                {success === "override-created" ? (
                    <p className="mb-4 rounded-lg border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-200">
                        Special pricing period saved successfully.
                    </p>
                ) : null}
                {/**
                 * PURPOSE: SPECIAL PRICING PERIOD
                 *
                 * Shows this form only for active Holiday or Event pricing profiles.
                 *
                 * The administrator can define:
                 * - override name;
                 * - start date and time;
                 * - end date and time;
                 * - priority.
                 *
                 * The saved period is stored in pricing_schedule_overrides.
                 * Lower priority number = higher priority.
                 *
                 * During quote creation:
                 * special override → checked first
                 * normal weekly schedule → used if no override matches
                 */}
                {pricingProfile.status === "active" &&
                    ["NL_HOLIDAY_STANDARD", "NL_EVENT_STANDARD"].includes(pricingProfile.pricing_profile_code) ? (
                    <section className="mt-6 rounded-xl border border-cyan-400/20 bg-slate-900 p-5">
                        <h2 className="mb-4 text-lg font-semibold text-cyan-300">Special pricing period</h2>
                        <form action={createPricingScheduleOverride} className={formStyles.form}>
                            <input type="hidden" name="pricingProfileId" value={pricingProfile.id} />
                            <div className="grid gap-4 md:grid-cols-2">
                                <label>
                                    <span className={formStyles.span}>Override name</span>
                                    <input type="text"  name="overrideName" className={formStyles.inputWFullCyan} placeholder="Christmas Day" required />
                                </label>
                                <label>
                                    <span className={formStyles.span}>Priority</span>
                                    <input type="number" name="priority" min="1" step="1" defaultValue="100" className={formStyles.inputWFullCyan} required/>
                                </label>
                                <label>
                                    <span className={formStyles.span}>Start date</span>
                                    <input
                                        type="date"
                                        name="startDate"
                                        className={formStyles.inputWFullCyan}
                                        required
                                    />
                                </label>

                                <label>
                                    <span className={formStyles.span}>Start time</span>
                                    <input
                                        type="time"
                                        name="startTime"
                                        step="60"
                                        className={formStyles.inputWFullCyan}
                                        required
                                    />
                                </label>

                                <label>
                                    <span className={formStyles.span}>End date</span>
                                    <input
                                        type="date"
                                        name="endDate"
                                        className={formStyles.inputWFullCyan}
                                        required
                                    />
                                </label>

                                <label>
                                    <span className={formStyles.span}>End time</span>
                                    <input
                                        type="time"
                                        name="endTime"
                                        step="60"
                                        className={formStyles.inputWFullCyan}
                                        required
                                    />
                                </label>
                            </div>

                            <p className="mt-3 text-sm text-slate-400">
                                Lower priority number means higher priority.
                            </p>

                            <button type="submit" className={`${formStyles.smallButton} mt-5`}>
                                Add special pricing period
                            </button>
                        </form>
                    </section>
                ) : null}

                <div className="grid gap-6 lg:grid-cols-2 mt-4">
                    <section className={cardClass}>
                        <h2 className={titleClass}>Profile</h2>

                        <p className={rowClass}>
                            <span className={labelClass}>Name: </span>
                            <span className={valueClass}>{pricingProfile.pricing_profile_name}</span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Code: </span>
                            <span className={valueClass}>{pricingProfile.pricing_profile_code}</span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Version: </span>
                            <span className={valueClass}>{pricingProfile.pricing_profile_version}</span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Status: </span>
                            <span className={valueClass}>{formatText(pricingProfile.status)}</span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Market: </span>
                            <span className={valueClass}>
                                {pricingProfile.country_code} / {pricingProfile.currency_code}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Quote validity: </span>
                            <span className={valueClass}>
                                {pricingProfile.quote_validity_minutes} minutes
                            </span>
                        </p>
                    </section>

                    <section className={cardClass}>
                        <h2 className={titleClass}>Journey rates excluding VAT</h2>

                        <p className={rowClass}>
                            <span className={labelClass}>Base fare: </span>
                            <span className={valueClass}>
                                {pricingRate
                                    ? formatMoney(pricingRate.base_fare_excluding_vat, pricingProfile.currency_code)
                                    : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Per kilometre: </span>
                            <span className={valueClass}>
                                {pricingRate
                                    ? `${formatMoney(pricingRate.distance_rate_per_km_excluding_vat, pricingProfile.currency_code)}/km`
                                    : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Per minute: </span>
                            <span className={valueClass}>
                                {pricingRate
                                    ? `${formatMoney(pricingRate.duration_rate_per_minute_excluding_vat, pricingProfile.currency_code)}/minute`
                                    : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Minimum fare: </span>
                            <span className={valueClass}>
                                {pricingRate
                                    ? formatMoney(pricingRate.minimum_fare_excluding_vat, pricingProfile.currency_code)
                                    : "Missing"}
                            </span>
                        </p>
                    </section>

                    <section className={cardClass}>
                        <h2 className={titleClass}>VAT rule</h2>

                        <p className={rowClass}>
                            <span className={labelClass}>Tax name: </span>
                            <span className={valueClass}>{taxRule?.tax_name ?? "Missing"}</span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Service category: </span>
                            <span className={valueClass}>
                                {taxRule ? formatText(taxRule.service_category) : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>VAT rate: </span>
                            <span className={valueClass}>
                                {taxRule ? `${Number(taxRule.tax_rate_percentage)}%` : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Rule status: </span>
                            <span className={valueClass}>
                                {taxRule ? formatText(taxRule.status) : "Missing"}
                            </span>
                        </p>
                    </section>

                    <section className={cardClass}>
                        <h2 className={titleClass}>Currency rounding</h2>

                        <p className={rowClass}>
                            <span className={labelClass}>Increment: </span>
                            <span className={valueClass}>
                                {roundingRule
                                    ? formatMoney(roundingRule.rounding_increment, pricingProfile.currency_code)
                                    : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Mode: </span>
                            <span className={valueClass}>
                                {roundingRule ? formatText(roundingRule.rounding_mode) : "Missing"}
                            </span>
                        </p>

                        <p className={rowClass}>
                            <span className={labelClass}>Rule status: </span>
                            <span className={valueClass}>
                                {roundingRule ? formatText(roundingRule.status) : "Missing"}
                            </span>
                        </p>
                    </section>

                    <section className={`${cardClass} lg:col-span-2`}>
                        <h2 className={titleClass}>Version lifecycle</h2>

                        <div className="grid gap-x-8 md:grid-cols-2">
                            <div>
                                <p className={rowClass}>
                                    <span className={labelClass}>Effective from: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.effective_from)}
                                    </span>
                                </p>

                                <p className={rowClass}>
                                    <span className={labelClass}>Effective until: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.effective_until)}
                                    </span>
                                </p>

                                <p className={rowClass}>
                                    <span className={labelClass}>Created: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.created_at)}
                                    </span>
                                </p>
                            </div>

                            <div>
                                <p className={rowClass}>
                                    <span className={labelClass}>Updated: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.updated_at)}
                                    </span>
                                </p>

                                <p className={rowClass}>
                                    <span className={labelClass}>Activated: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.activated_at)}
                                    </span>
                                </p>

                                <p className={rowClass}>
                                    <span className={labelClass}>Archived: </span>
                                    <span className={valueClass}>
                                        {formatDateTime(pricingProfile.archived_at)}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}