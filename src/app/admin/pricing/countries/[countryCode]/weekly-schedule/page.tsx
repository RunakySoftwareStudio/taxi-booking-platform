
import AdminWeeklySchedulePage from "./AdminWeeklySchedulePage";

/**
 * Purpose:
 * Route entry for reviewing and editing one pricing market's
 * recurring weekly pricing schedule.
 */
export default function Page({
    params,
    searchParams,
}: {
    params: Promise<{ countryCode: string }>;
    searchParams: Promise<{ error?: string }>;
}) {
    return <AdminWeeklySchedulePage params={params} searchParams={searchParams} />;
}