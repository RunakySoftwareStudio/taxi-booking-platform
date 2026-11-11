/* ============================================================
   VOYA TAXI — CLIENT ADJUSTMENT ASSIGNMENTS

   Displays assigned client discounts and surcharges.
   Assignment management actions will be added separately.
============================================================ */
"use client";
/* SECTION 1: Client-side state and page refresh for assignment actions. */
import { useState } from "react";
import { useRouter } from "next/navigation";

export type AssignmentRow = {
    id: string;
    effective_from: string;
    effective_until: string | null;
    is_active: boolean;
    adjustment_definition_id: string;
    client_adjustment_definitions: {
        name: string;
        adjustment_type: string;
        value_type: string;
        value: number;
        currency_code: string | null;
    } | null;
};

type Props = {
    assignments: AssignmentRow[];
    onEdit: (item: AssignmentRow) => void;
};
export default function ClientAdjustmentAssignments({ assignments, onEdit }: Props) {
    /* Track the selected assignment and pending status changes. */
    const router = useRouter();
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [success, setSuccess] = useState(false);

    /* Notify the parent manager when Admin selects an assignment. */
    function handleEdit(item: AssignmentRow) {
        setMessage("");
        setSuccess(false);
        onEdit(item);
    }

    /* SECTION 2: Activate or deactivate an existing client assignment. */
    async function handleStatusChange(item: AssignmentRow) {
        if (updatingId) return;

        setUpdatingId(item.id);
        setMessage("");
        setSuccess(false);

        try {
            const response = await fetch(
                `/api/admin/financial/client-adjustment-assignments/${item.id}`,
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

    return (
        <section className="mt-10">
            <h2 className="text-xl font-semibold text-white">Client Discounts & Surcharges</h2>
            <p className="mt-2 text-sm text-slate-400">Adjustments assigned specifically to this client.</p>

            <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w:700px text-left text-sm">
                    <thead className="bg-cyan-950/40 text-cyan-200">
                        <tr>
                            {["Adjustment", "Type", "Value", "Effective From", "Effective Until", "Status", "Actions"].map((heading) =>
                                <th key={heading} className="px-4 py-3 font-medium">{heading}</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {assignments.map((item) => {
                            const definition = item.client_adjustment_definitions;
                            const value = definition?.value_type === "percentage"
                                ? `${definition.value}%`
                                : `${definition?.currency_code ?? ""} ${definition?.value?.toFixed(2) ?? ""}`;

                            return (
                                <tr key={item.id} className="border-t border-white/10 text-slate-200">
                                    <td className="px-4 py-3">{definition?.name ?? "Unknown adjustment"}</td>
                                    <td className="px-4 py-3 capitalize">{definition?.adjustment_type}</td>
                                    <td className="px-4 py-3">{value}</td>
                                    <td className="px-4 py-3">{item.effective_from}</td>
                                    <td className="px-4 py-3">{item.effective_until ?? "No end date"}</td>
                                    <td className="px-4 py-3">{item.is_active ? "Active" : "Inactive"}</td>

                                    {/* SECTION: Edit assignment dates or change activation status. */}
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button type="button" onClick={() => handleEdit(item)}
                                                disabled={updatingId !== null}
                                                className="rounded-lg border border-slate-500 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                                                Edit
                                            </button>

                                            <button type="button" onClick={() => handleStatusChange(item)}
                                                disabled={updatingId !== null}
                                                className="rounded-lg border border-cyan-600 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-950 disabled:opacity-50">
                                                {updatingId === item.id ? "Updating..." : item.is_active ? "Deactivate" : "Activate"}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {assignments.length === 0 && (
                            <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No adjustments assigned to this client.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {/* SECTION 4: Display assignment status update feedback. */}
            {message && <p role={success ? "status" : "alert"} className={`mt-3 text-sm ${success ? "text-green-400" : "text-red-300"}`}>{message}</p>}
        </section>
    );
}