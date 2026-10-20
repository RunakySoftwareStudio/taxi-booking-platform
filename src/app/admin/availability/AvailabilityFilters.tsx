
import Link from "next/link";
import { formStyles } from "@/styles/classNames";

/* ============================================================
   ADMIN AVAILABILITY FILTERS
   Filters chauffeur availability by chauffeur and date.
   Uses GET parameters without changing database records.
============================================================ */

type AvailabilityFiltersProps = {
    chauffeurs: {id: string; name: string;}[];
    filterChauffeurId: string;
    filterDate: string;
};

/* Displays the chauffeur and date selection controls. */
export default function AvailabilityFilters({chauffeurs, filterChauffeurId, filterDate}: AvailabilityFiltersProps) {
    return (
        <section className="mt-6 rounded-2xl border border-cyan-700/60 bg-slate-900/70 p-4 md:p-5">
            <h2 className="text-lg font-semibold text-white">Search chauffeur availability</h2>
            <p className="mt-1 text-sm text-slate-400">Find availability records for a chauffeur or a specific date.</p>

            {/* Remounts form fields when filters are cleared or changed through the URL. */}
            <form key={`${filterChauffeurId}-${filterDate}`} action="/admin/availability" method="GET" className="mt-5 flex flex-wrap items-end gap-4">
                <label className="block w-full max-w-sm">
                    <span className={formStyles.span}>Chauffeur</span>
                    <select name="filterChauffeurId" defaultValue={filterChauffeurId} className={formStyles.selectWFull}>
                        <option value="">All chauffeurs</option>
                        {chauffeurs.map((chauffeur) => (
                            <option key={chauffeur.id} value={chauffeur.id}>{chauffeur.name}</option>
                        ))}
                    </select>
                </label>

                {/* The native date input submits a YYYY-MM-DD value. */}
                <label className="block">
                    <span className={formStyles.span}>Date</span>
                    <input type="date" name="filterDate" defaultValue={filterDate} className={formStyles.inputWFullCyan} />
                </label>

                <div className="flex items-center gap-3">
                    <button type="submit" className={formStyles.smallButton}>Search</button>
                    <Link href="/admin/availability" className={formStyles.link}>Clear</Link>
                </div>
            </form>
        </section>
    );
}
