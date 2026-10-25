
import Link from "next/link";
import { formStyles } from "@/styles/classNames";

/* Defines the currently selected Taxi Operator search filters. */
type OperatorFiltersProps = {
    companyFilter: string;
    kvkFilter: string;
    locationFilter: string;
    statusFilter: string;
};

/* ============================================================
   ADMIN TAXI OPERATOR FILTERS
   Provides URL-based GET filters for company, KvK, location
   and verification status. Search and Clear do not change data.
============================================================ */
export default function OperatorFilters({companyFilter, kvkFilter, locationFilter, statusFilter}: OperatorFiltersProps) {
    return (
        <form key={`${companyFilter}-${kvkFilter}-${locationFilter}-${statusFilter}`} action="/admin/operators" method="GET" className="mt-4 flex flex-wrap items-end gap-4">
            {/* Search by company name. */}
            <label className="block w-full sm:max-w-xs">
                <span className={formStyles.span}>Company name</span>
                <input name="company" type="text" defaultValue={companyFilter} placeholder="Search company..." className={formStyles.inputWFullCyan} />
            </label>

            {/* Search by KvK registration number. */}
            <label className="block w-full sm:max-w-48">
                <span className={formStyles.span}>KvK number</span>
                <input name="kvk" type="text" defaultValue={kvkFilter} placeholder="Search KvK..." className={formStyles.inputWFullCyan} />
            </label>

            {/* Search by city or country code. */}
            <label className="block w-full sm:max-w-48">
                <span className={formStyles.span}>Location</span>
                <input name="location" type="text" defaultValue={locationFilter} placeholder="City or country..." className={formStyles.inputWFullCyan} />
            </label>

            {/* These options match the statuses used by the existing Admin page. */}
            <label className="block w-full sm:max-w-48">
                <span className={formStyles.span}>Verification status</span>
                <select name="status" defaultValue={statusFilter} className={formStyles.selectWFull}>
                    <option value="">All statuses</option>
                    <option value="pending_verification">Pending verification</option>
                    <option value="verified">Verified</option>
                    <option value="suspended">Suspended</option>
                    <option value="inactive">Inactive</option>
                </select>
            </label>

            {/* Submit selected filters or navigate back to the unfiltered list. */}
            <div className="flex items-center gap-3">
                <button type="submit" className={formStyles.smallButton}>Search</button>
                <Link href="/admin/operators" className={formStyles.link}>Clear</Link>
            </div>
        </form>
    );
}
