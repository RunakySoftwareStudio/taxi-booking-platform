
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/requireAdminUser";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { pageStyles } from "@/styles/classNames";
import WeeklyScheduleEditor from "./WeeklyScheduleEditor";


/* ===== Page properties ===== */
type AdminWeeklySchedulePageProps = {
    params: Promise<{ countryCode: string }>;
    searchParams: Promise<{ error?: string }>;
};

/* ===== Pricing market data ===== */
type PricingMarketRow = {
    country_code: string;
    country_name: string;
    currency_code: string;
    service_category: string;
    configuration_status: string;
    pricing_enabled: boolean;
};

/* ===== Weekly schedule data ===== */
type PricingScheduleRow = {
    id: string;
    day_of_week: number;
    start_local_time: string;
    end_local_time: string;
    pricing_profile_code: string;
};

/* ===== Pricing profile data ===== */
type PricingProfileRow = {
    pricing_profile_code: string;
    pricing_profile_name: string;
    pricing_profile_version: number;
};

/**
 * Purpose:
 * Dedicated administrator page for reviewing and editing
 * one pricing market's recurring weekly pricing schedule.
 */
/* ===== Save weekly schedule server action ===== */
async function saveWeeklySchedule(formData: FormData) {
    "use server";

    await requireAdminUser();

    /* ===== Read submitted schedule ===== */
    const countryCode = String(formData.get("countryCode") || "").trim().toUpperCase();
    const scheduleJson = String(formData.get("scheduleJson") || "");

    if (!countryCode || !scheduleJson) {
        redirect(`/admin/pricing/countries/${countryCode || ""}/weekly-schedule?error=missing-schedule`);
    }

    /* ===== Parse submitted schedule ===== */
    let scheduleRows: unknown;

    try {
        scheduleRows = JSON.parse(scheduleJson);
    } catch {
        redirect(`/admin/pricing/countries/${countryCode}/weekly-schedule?error=invalid-schedule`);
    }

    /* ===== Store complete weekly schedule atomically ===== */
    const { error } = await supabaseAdmin.rpc("replace_pricing_market_weekly_schedule", {
        p_country_code: countryCode,
        p_schedule: scheduleRows,
    });

    if (error) {
        console.error("Could not replace weekly pricing schedule:", error);
        redirect(`/admin/pricing/countries/${countryCode}/weekly-schedule?error=save-failed`);
    }

    /* ===== Return to country review after successful save ===== */
    redirect(`/admin/pricing/countries/${countryCode}`);
}
export default async function AdminWeeklySchedulePage({ params, searchParams }: AdminWeeklySchedulePageProps) {
    await requireAdminUser();

    /* ===== Read selected country ===== */
    const { countryCode } = await params;
    const selectedCountryCode = countryCode.trim().toUpperCase();

    /* ===== Read page error ===== */
    const pageSearchParams = await searchParams;
    const pageError = pageSearchParams.error;

    /* ===== Load pricing market ===== */
    const { data: pricingMarketData, error: pricingMarketError } = await supabaseAdmin
        .from("pricing_markets")
        .select("country_code, country_name, currency_code, service_category, configuration_status, pricing_enabled")
        .eq("country_code", selectedCountryCode)
        .maybeSingle();

    if (pricingMarketError) { console.error("Could not load pricing market:", pricingMarketError); }
    if (!pricingMarketData) { notFound(); }

    const pricingMarket = pricingMarketData as PricingMarketRow;

    /* ===== Load weekly schedule ===== */
    const { data: pricingScheduleData, error: pricingScheduleError } = await supabaseAdmin
        .from("pricing_schedules")
        .select("id, day_of_week, start_local_time, end_local_time, pricing_profile_code")
        .eq("country_code", selectedCountryCode)
        .eq("service_category", pricingMarket.service_category)
        .order("day_of_week", { ascending: true })
        .order("start_local_time", { ascending: true });

    if (pricingScheduleError) { console.error("Could not load pricing schedule:", pricingScheduleError); }

    const pricingSchedules = (pricingScheduleData ?? []) as PricingScheduleRow[];

    /* ===== Load pricing-profile families ===== */
    const { data: pricingProfileData, error: pricingProfileError } = await supabaseAdmin
        .from("pricing_profiles")
        .select("pricing_profile_code, pricing_profile_name, pricing_profile_version")
        .eq("country_code", selectedCountryCode)
        .eq("currency_code", pricingMarket.currency_code)
        .order("pricing_profile_code", { ascending: true })
        .order("pricing_profile_version", { ascending: false });

    if (pricingProfileError) { console.error("Could not load pricing profiles:", pricingProfileError); }

    const pricingProfiles = (pricingProfileData ?? []) as PricingProfileRow[];

    /* ===== Keep one row per pricing-profile family ===== */
    const pricingProfileOptions: PricingProfileRow[] = [];

    for (const pricingProfile of pricingProfiles) {
        const profileAlreadyAdded = pricingProfileOptions.some(
            (profileOption) => profileOption.pricing_profile_code === pricingProfile.pricing_profile_code
        );

        if (!profileAlreadyAdded) {
            pricingProfileOptions.push(pricingProfile);
        }
    }

    /* ===== Prepare weekly schedule editor data ===== */
    const weeklyScheduleEditorRows = pricingSchedules.map((pricingSchedule) => ({
        id: pricingSchedule.id,
        dayOfWeek: pricingSchedule.day_of_week,
        startLocalTime: pricingSchedule.start_local_time.slice(0, 5),
        endLocalTime: pricingSchedule.end_local_time.slice(0, 5),
        pricingProfileCode: pricingSchedule.pricing_profile_code,
    }));

    const weeklyScheduleEditorProfileOptions = pricingProfileOptions.map((pricingProfile) => ({
        pricingProfileCode: pricingProfile.pricing_profile_code,
        pricingProfileName: pricingProfile.pricing_profile_name,
    }));

    {/* ===== Return the main page ========================================================================================= */}
    return (
        <main className={pageStyles.main}>
            <div className={pageStyles.container}>

                {/* ===== Page navigation ===================================== */}
                <Link href={`/admin/pricing/countries/${selectedCountryCode}`} className="text-sm text-cyan-300 hover:underline">
                    ← Back to {selectedCountryCode} review
                </Link>

                {/* ===== Page heading ======================================== */}
                <div className="mt-6">
                    <p className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-400">Pricing market</p>
                    <h1 className="mt-2 text-3xl font-bold text-white">Edit weekly schedule</h1>
                    <p className="mt-2 text-slate-400">
                        {pricingMarket.country_name} ({pricingMarket.country_code}) · {pricingMarket.currency_code}
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                        Loaded weekly schedule: <span className="font-semibold text-cyan-300">{pricingSchedules.length} periods</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                        Pricing-profile families: <span className="font-semibold text-cyan-300">{pricingProfileOptions.length}</span>
                    </p>

                    {/* ===== Weekly schedule editor =============================== */}
                    <div className="mt-8">
                        <WeeklyScheduleEditor
                            countryCode={selectedCountryCode}
                            initialSchedule={weeklyScheduleEditorRows}
                            pricingProfileOptions={weeklyScheduleEditorProfileOptions}
                            saveAction={saveWeeklySchedule}
                            initialError={pageError}
                        />
                    </div>
                </div>

            </div>
        </main>
    );
}