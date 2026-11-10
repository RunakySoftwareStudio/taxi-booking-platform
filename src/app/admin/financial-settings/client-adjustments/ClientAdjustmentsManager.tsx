"use client";

/* ============================================================
   VOYA TAXI — CLIENT ADJUSTMENTS MANAGER

   Shares the selected adjustment between the upper form
   and the Existing Adjustments table.
============================================================ */

import { useState } from "react";
import ClientAdjustmentForm, { type ClientAdjustment } from "./ClientAdjustmentForm";
import { useRouter } from "next/navigation";

type AdjustmentRow = ClientAdjustment & { is_active: boolean };
type Props = { adjustments: AdjustmentRow[] };

export default function ClientAdjustmentsManager({ adjustments }: Props) {
    const [selected, setSelected] = useState<ClientAdjustment | null>(null);
    /* Preserve success feedback after returning to creation mode. */
    const [successMessage, setSuccessMessage] = useState("");

    /* Manage individual adjustment activation without modifying financial values. */
    const router = useRouter();
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [statusError, setStatusError] = useState("");

    async function handleStatusChange(item: AdjustmentRow) {
        if (updatingId) return;
            /* Clear previous feedback before updating adjustment status. */
            setUpdatingId(item.id);
            setStatusError("");
            setSuccessMessage("");

        try {
            const response = await fetch(`/api/admin/financial/client-adjustments/${item.id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !item.is_active }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message ?? "Unable to update adjustment status.");
            setSuccessMessage(result.message);
            router.refresh();
        } catch (error) {
            setStatusError(error instanceof Error ? error.message : "Unable to update adjustment status.");
        } finally {
            setUpdatingId(null);
        }
    }

    /* SECTION 1: Populate the upper form with the selected adjustment. */
    function handleEdit(item: AdjustmentRow) {
        setSuccessMessage("");
        setSelected(item);
        document.getElementById("client-adjustment-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    /* SECTION 2: Return to creation mode without removing success feedback. */
    function handleCancel() {
        setSelected(null);
        setStatusError("");
    }

    return (
        <>
            {/* Shared form for creating and editing adjustments. */}
            <section id="client-adjustment-form" className="mt-8 rounded-lg border border-slate-700 p-6">
                <h2 className="text-xl font-semibold text-white">
                    {selected ? "Edit Adjustment" : "Create Adjustment"}
                </h2>

                {successMessage && <p role="status" className="mt-4 text-sm text-green-400"> {successMessage}</p>}
                {statusError && <p role="alert" className="mt-3 text-sm text-red-300">{statusError}</p>}

                <ClientAdjustmentForm key={selected?.id ?? "new"} adjustment={selected ?? undefined} onCancel={handleCancel} onSaved={setSuccessMessage} onSubmitStart={() => setSuccessMessage("")} />
            </section>

            {/* Existing adjustment definitions and their Edit actions. */}
            <section className="mt-6 rounded-lg border border-slate-700 p-6">
                <h2 className="text-xl font-semibold text-white">Existing Adjustments</h2>
                {!adjustments.length ? (
                    <p className="mt-4 text-sm text-slate-400">No adjustments configured.</p>
                ) : (
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

                                        {/* Manage each adjustment independently. */}
                                        <td className="px-3 py-3">
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" onClick={() => handleEdit(item)}
                                                    className="rounded-md border border-cyan-600 px-3 py-1.5 text-sm text-cyan-400 hover:bg-slate-800">
                                                    Edit
                                                </button>
                                                <button type="button" onClick={() => handleStatusChange(item)} disabled={updatingId !== null}
                                                    className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                                                    {updatingId === item.id ? "Saving..." : item.is_active ? "Deactivate" : "Activate"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );
}