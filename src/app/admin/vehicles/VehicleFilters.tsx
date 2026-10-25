
import Link from "next/link";
import { formStyles } from "@/styles/classNames";
import { SlidersHorizontal } from "lucide-react";

/* ============================================================
   ADMIN VEHICLE MANAGEMENT CONTROLS

   Combines the Add Vehicle navigation and vehicle filters.
   Uses GET parameters for server-side filtering.
   Does not change vehicle records or their management actions.
============================================================ */

type VehicleFiltersProps = {
    chauffeurs: { id: string; name: string; }[];
    filterChauffeurId: string;
    filterLargeLuggage: boolean;
    filterMobilityStorage: boolean;
};

/* Displays vehicle management controls and the three list filters. */
export default function VehicleFilters({chauffeurs, filterChauffeurId, filterLargeLuggage, filterMobilityStorage}: VehicleFiltersProps) {
    return (
        <section className="mt-6 rounded-2xl border border-cyan-700/60 bg-slate-900/70 p-4 md:p-5">

            {/* ===== MANAGEMENT HEADER ===== */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">Vehicle management</h2>
                    <p className="mt-1 text-sm text-slate-400">Find existing vehicles or register a new one.</p>
                </div>
                {/* Centers the Add Vehicle button text horizontally and vertically. */}
                <Link href="/admin/vehicles/new" className={`${formStyles.primaryButtonDP} inline-flex items-center justify-center`}>
                    + Add vehicle
                </Link>
            </div>

            {/* ===== FILTER PANEL ===== */}
            <div className="mt-5 border-t border-cyan-800/60 pt-5">
                <div className="mb-4 flex items-center gap-2 border-b border-cyan-500/20 pb-3">
                    <SlidersHorizontal className="h-5 w-5 text-cyan-400" aria-hidden="true" />
                    <h2 className="text-lg font-semibold text-cyan-300">Filter Vehicles</h2>
                </div>
                <form key={`${filterChauffeurId}-${filterLargeLuggage}-${filterMobilityStorage}`} action="/admin/vehicles" method="GET" className="flex flex-wrap items-end gap-4">
                    <label className="block w-full max-w-sm">
                        <span className={formStyles.span}>Chauffeur</span>
                        <select key={filterChauffeurId} name="filterChauffeurId" defaultValue={filterChauffeurId} className={formStyles.selectWFull}>
                            <option value="">All chauffeurs</option>
                            {chauffeurs.map((chauffeur) => (
                                <option key={chauffeur.id} value={chauffeur.id}>{chauffeur.name}</option>
                            ))}
                        </select>
                    </label>

                    <label className="flex items-center gap-2 pb-2 text-sm text-white">
                        <input key={`large-${filterLargeLuggage}`} type="checkbox" name="filterLargeLuggage" value="true" defaultChecked={filterLargeLuggage} />
                        Extra-large luggage
                    </label>

                    <label className="flex items-center gap-2 pb-2 text-sm text-white">
                        <input key={`mobility-${filterMobilityStorage}`} type="checkbox" name="filterMobilityStorage" value="true" defaultChecked={filterMobilityStorage} />
                        Mobility-aid storage
                    </label>

                    <div className="flex items-center gap-3">
                        <button type="submit" className={formStyles.smallButton}>Filter</button>
                        <Link href="/admin/vehicles" className={formStyles.link}>Clear</Link>
                    </div>
                </form>
            </div>
        </section>
    );
}
