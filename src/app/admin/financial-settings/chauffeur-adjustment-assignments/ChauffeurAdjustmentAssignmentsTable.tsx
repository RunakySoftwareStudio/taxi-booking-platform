"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
/* ============================================================
   VOYA TAXI — CHAUFFEUR ADJUSTMENT ASSIGNMENTS TABLE

   Displays assigned chauffeur discounts and surcharges.
   Management actions will be connected separately.
============================================================ */

export type ChauffeurAssignmentRow = {
    id: string;
    chauffeur_id: string;
    adjustment_definition_id: string;
    effective_from: string;
    effective_until: string | null;
    is_active: boolean;
    chauffeur_name: string;
    adjustment_name: string;
    adjustment_type: string;
    value_type: string;
    value: number;
    currency_code: string | null;
};

type Props = {
    assignments: ChauffeurAssignmentRow[];
    onEdit: (item: ChauffeurAssignmentRow) => void;
    onStatusChangeStart: () => void;
};

export default function ChauffeurAdjustmentAssignmentsTable({ assignments, onEdit, onStatusChangeStart }: Props) {
    /* Manage assignment activation and deactivation. */
const router = useRouter();
const [updatingId, setUpdatingId] = useState<string | null>(null);
const [message, setMessage] = useState("");
const [success, setSuccess] = useState(false);
/* Filter existing financial adjustments by chauffeur. */
const [filterChauffeurId, setFilterChauffeurId] = useState("");

async function handleStatusChange(item: ChauffeurAssignmentRow) {
    if (updatingId) return;

        /* Clear previous Create/Edit feedback before changing assignment status. */
        onStatusChangeStart();
        setUpdatingId(item.id);
        setMessage("");
        setSuccess(false);

        try {
            const response = await fetch(
                `/api/admin/financial/chauffeur-adjustment-assignments/${item.id}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_active: !item.is_active }),
                }
            );

            const result = await response.json();
            if (!response.ok)
                throw new Error(result.message ?? "Unable to update assignment status.");

            setSuccess(true);
            setMessage(result.message);
            router.refresh();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to update assignment status.");
        } finally {
            setUpdatingId(null);
        }
    }

    /* Build the chauffeur selection list from existing assignments. */
    const chauffeurOptions = Array.from(
        new Map(assignments.map((item) => [
            item.chauffeur_id, { id: item.chauffeur_id, name: item.chauffeur_name },
        ])).values()
    ).sort((a, b) => a.name.localeCompare(b.name));

    /* Display only assignments belonging to the selected chauffeur. */
    const filteredAssignments = filterChauffeurId
        ? assignments.filter((item) => item.chauffeur_id === filterChauffeurId)
        : assignments;

    return (
        <>
            {/* Filter the assignment list without changing database records. */}
            <div className="mt-5 max-w-sm">
                <label htmlFor="assignment-chauffeur-filter" className="block text-sm text-slate-300">
                    Filter by Chauffeur
                </label>
                <select id="assignment-chauffeur-filter" value={filterChauffeurId}
                    onChange={(event) => setFilterChauffeurId(event.target.value)}
                    className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 p-2 text-white">
                    <option value="">All Chauffeurs</option>
                    {chauffeurOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                </select>
            </div>

            <section className="mt-8 rounded-xl border border-slate-700 p-6">

                <h2 className="text-xl font-semibold text-white">Existing Assignments</h2>

                <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-700 text-slate-300">
                            <tr>
                                {["Chauffeur", "Adjustment", "Type", "Value", "Effective Period", "Status", "Actions"].map((heading) => (
                                    <th key={heading} className="px-3 py-3">{heading}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAssignments.map((item) => (
                                <tr key={item.id} className="border-b border-slate-800 text-slate-200">
                                    <td className="px-3 py-3">{item.chauffeur_name}</td>
                                    <td className="px-3 py-3">{item.adjustment_name}</td>
                                    <td className="px-3 py-3 capitalize">{item.adjustment_type}</td>
                                    <td className="px-3 py-3">
                                        {item.value_type === "percentage"
                                            ? `${item.value}%`
                                            : `${item.currency_code ?? ""} ${item.value.toFixed(2)}`}
                                    </td>
                                    <td className="px-3 py-3">
                                        {item.effective_from} — {item.effective_until ?? "No end"}
                                    </td>
                                    <td className={`px-3 py-3 ${item.is_active ? "text-green-400" : "text-slate-400"}`}>
                                        {item.is_active ? "Active" : "Inactive"}
                                    </td>
                                    
                                    {/* Activate or deactivate an existing chauffeur adjustment assignment. */}
                                    <td className="px-3 py-3">
                                        {/* Select the assignment for editing in the shared form. */}
                                        <button type="button" onClick={() => onEdit(item)}
                                            disabled={updatingId !== null}
                                            className="mr-2 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                                            Edit
                                        </button>
                                        <button type="button" onClick={() => handleStatusChange(item)}
                                            disabled={updatingId !== null}
                                            className="rounded-md border border-cyan-600 px-3 py-1.5 text-sm text-cyan-400 hover:bg-slate-800 disabled:opacity-50">
                                            {updatingId === item.id ? "Updating..." : item.is_active ? "Deactivate" : "Activate"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!filteredAssignments.length && (
                                <tr>
                                    <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                                        No chauffeur adjustments assigned.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Display feedback for assignment status changes. */}
                {message && (
                    <p role={success ? "status" : "alert"} className={`mt-3 text-sm ${success ? "text-green-400" : "text-red-300"}`}>
                        {message}
                    </p>
                )}
            </section>
        </>
    );
}