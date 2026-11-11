"use client";
import { useState } from "react";
import ChauffeurAdjustmentForm from "./ChauffeurAdjustmentForm";
import { useRouter } from "next/navigation";

/* ============================================================
   VOYA TAXI — CHAUFFEUR ADJUSTMENTS MANAGER

   Coordinates reusable chauffeur discounts and surcharges.
   Shares the selected adjustment between the form and table.
============================================================ */

export type ChauffeurAdjustment = {
    id: string;
    name: string;
    description: string | null;
    adjustment_type: "discount" | "surcharge";
    value_type: "percentage" | "fixed";
    value: number;
    currency_code: string | null;
    effective_from: string;
    effective_until: string | null;
    is_active: boolean;
};

type Props = { adjustments: ChauffeurAdjustment[] };

export default function ChauffeurAdjustmentsManager({ adjustments }: Props) {
    /* SECTION 1: Track the selected definition for editing. */
    const [selected, setSelected] = useState<ChauffeurAdjustment | null>(null);
    /* Preserve feedback when switching between creation and editing. */
    const [successMessage, setSuccessMessage] = useState("");
   /* Manage activation without modifying adjustment values. */
    const router = useRouter();
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [statusError, setStatusError] = useState("");
    /* Feedback for activation and deactivation actions. */
    const [statusMessage, setStatusMessage] = useState("");

    async function handleStatusChange(item: ChauffeurAdjustment) {
        if (updatingId) return;

        setUpdatingId(item.id);
        setStatusError("");
        setStatusMessage("");
        setSuccessMessage("");

        try {
            const response = await fetch(`/api/admin/financial/chauffeur-adjustments/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !item.is_active }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message ?? "Unable to update adjustment status.");
            setStatusMessage(result.message);
            router.refresh();
        } catch (error) {
            setStatusError(error instanceof Error ? error.message : "Unable to update adjustment status.");
        } finally {
            setUpdatingId(null);
        }
    }

    /* Return to creation mode after editing. */
    function handleCancel() {
        setSelected(null);
    }
    
    return (
        <>
            <section id="chauffeur-adjustment-form" className="mt-8 rounded-lg border border-slate-700 p-6">            <h2 className="text-xl font-semibold text-white">
                    {selected ? "Edit Adjustment" : "Create Adjustment"}
                </h2>

                {/* Feedback for creating or editing a definition. */}
                {successMessage && (
                    <p role="status" className="mt-4 text-sm text-green-400">{successMessage}</p>
                )}

                {/* Shared form for creating and editing chauffeur adjustment definitions. */}
                <ChauffeurAdjustmentForm
                    key={selected?.id ?? "new"}
                    adjustment={selected ?? undefined}
                    onCancel={handleCancel}
                    onSaved={setSuccessMessage}
                    onSubmitStart={() => {
                        setSuccessMessage("");
                        setStatusMessage("");
                        setStatusError("");
                    }}
                />
                </section>
                <section className="mt-6 rounded-lg border border-slate-700 p-6">
                    <h2 className="text-xl font-semibold text-white">Existing Adjustments</h2>

                    {/* Feedback for activating or deactivating existing definitions. */}
                    {statusMessage && (
                        <p role="status" className="mt-4 text-sm text-green-400">{statusMessage}</p>
                    )}
                    {statusError && (
                        <p role="alert" className="mt-3 text-sm text-red-300">{statusError}</p>
                    )}

                    {!adjustments.length 
                        ? (<p className="mt-4 text-sm text-slate-400">No adjustments configured.</p>) 
                        : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="border-b border-slate-700 text-slate-300">
                                        <tr>
                                            <th className="px-3 py-3">Name</th>
                                            <th className="px-3 py-3">Type</th>
                                            <th className="px-3 py-3">Value</th>
                                            <th className="px-3 py-3">Effective Period</th>
                                            <th className="px-3 py-3">Status</th>
                                            <th className="px-3 py-3">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {adjustments.map((item) => (
                                            <tr key={item.id} className="border-b border-slate-800 text-slate-200">
                                                <td className="px-3 py-3">
                                                    <span className="font-medium">{item.name}</span>
                                                    {item.description && <p className="mt-1 text-xs text-slate-400">{item.description}</p>}
                                                </td>
                                                <td className="px-3 py-3 capitalize">{item.adjustment_type}</td>
                                                <td className="px-3 py-3">
                                                    {item.value_type === "percentage" ? `${Number(item.value)}%` : `${item.currency_code} ${Number(item.value).toFixed(2)}`}
                                                </td>
                                                <td className="px-3 py-3">{item.effective_from} — {item.effective_until ?? "No end"}</td>
                                                <td className={`px-3 py-3 ${item.is_active ? "text-green-400" : "text-slate-400"}`}>
                                                    {item.is_active ? "Active" : "Inactive"}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <button type="button" onClick={() => {
                                                        setSuccessMessage("");
                                                        setStatusMessage("");
                                                        setStatusError("");
                                                        setSelected(item);
                                                        document.getElementById("chauffeur-adjustment-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                                                    }} className="rounded-md border border-cyan-600 px-3 py-1.5 text-sm text-cyan-400 hover:bg-slate-800">
                                                        Edit
                                                    </button>
                                                    <button type="button" onClick={() => handleStatusChange(item)} disabled={updatingId !== null}
                                                        className="ml-2 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                                                        {updatingId === item.id ? "Saving..." : item.is_active ? "Deactivate" : "Activate"}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    }
            </section>
        </>
    );
}