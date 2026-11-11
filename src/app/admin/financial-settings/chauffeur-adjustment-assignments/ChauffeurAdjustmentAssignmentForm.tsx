"use client";

/* ============================================================
   VOYA TAXI — Chauffeur Adjustment ASSIGNMENT FORM

   Allows Admin to choose an existing adjustment definition
   and specify its effective period for an individual client.
============================================================ */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

export type AdjustmentOption = {
    id: string;
    name: string;
    adjustment_type: "discount" | "surcharge";
    effective_from: string;
    effective_until: string | null;
};

/* Chauffeurs available for financial adjustment assignments. */
export type ChauffeurOption = {
    id: string;
    name: string;
    email: string | null;
};

/* Support creation and editing through the same form. */
export type EditableAssignment = {
    id: string;
    chauffeur_id: string;
    adjustment_definition_id: string;
    effective_from: string;
    effective_until: string | null;
};

type Props = {
    chauffeurs: ChauffeurOption[];
    definitions: AdjustmentOption[];
    assignment?: EditableAssignment | null;
    onCancel?: () => void;
    onSaved?: (message: string) => void;
    onSubmitStart?: () => void;
};
export default function ChauffeurAdjustmentAssignmentForm({ chauffeurs, definitions, assignment, onCancel, onSaved, onSubmitStart }: Props) {
    /* Populate existing assignment values when entering edit mode. */
    /* Preserve the assigned chauffeur when editing an existing record. */
    const [chauffeurId, setChauffeurId] = useState(assignment?.chauffeur_id ?? "");
    const [definitionId, setDefinitionId] = useState(assignment?.adjustment_definition_id ?? "");
    const [effectiveFrom, setEffectiveFrom] = useState(assignment?.effective_from ?? "");
    const [effectiveUntil, setEffectiveUntil] = useState(assignment?.effective_until ?? "");

    /* SECTION 1: Manage assignment saving and user feedback. */
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [success, setSuccess] = useState(false);
    /* Determine whether the form creates or edits an assignment. */
    const isEditing = Boolean(assignment);

    /* SECTION 2: Save the selected adjustment for the selected chauffeur. */
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) return;

        setSaving(true);
        setMessage("");
        setSuccess(false);
        /* Clear previous success feedback before starting a new operation. */
        onSubmitStart?.();

        try {
                /* Use PATCH for existing assignments and POST for new ones. */
                const response = await fetch(
                    isEditing
                        ? `/api/admin/financial/chauffeur-adjustment-assignments/${assignment!.id}`
                        : "/api/admin/financial/chauffeur-adjustment-assignments",
                    {
                        method: isEditing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(isEditing
                    ? {
                        effective_from: effectiveFrom,
                        effective_until: effectiveUntil || null,
                    }
                    : {
                        chauffeur_id: chauffeurId,
                        adjustment_definition_id: definitionId,
                        effective_from: effectiveFrom,
                        effective_until: effectiveUntil || null,
                    }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message ?? "Could not assign adjustment.");

            /* Show confirmation and reset the form after saving. */
            setSuccess(true);
            setMessage(isEditing
                ? "Chauffeur Adjustment assignment updated successfully."
                : "Chauffeur Adjustment assigned successfully.");

        if (isEditing) 
            {
                /* Preserve the success message after returning to Create mode. */
                onSaved?.("Chauffeur Adjustment assignment updated successfully.");
                router.refresh();
                onCancel?.();

            } else {
                setDefinitionId("");
                setEffectiveFrom("");
                setEffectiveUntil("");
                setChauffeurId("");
                router.refresh();
            }
        } catch (error) {
            /* Remove previous success feedback when the current operation fails. */
            onSaved?.("");
            setSuccess(false);
            setMessage(error instanceof Error ? error.message : "Unable to assign adjustment.");
        }
        finally {
            setSaving(false);
        }
    }

    /* Keep the selected definition available for date validation. */
    const selectedDefinition = definitions.find((item) => item.id === definitionId);

    return (
        <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-white/10 p-5">
            <h3 className="font-semibold text-white">
                {isEditing ? "Edit Chauffeur Adjustment" : "Assign Chauffeur Adjustment"}
            </h3>
            <p className="mt-2 text-sm text-slate-400">
                Choose an adjustment and its validity period for the selected chauffeur.
            </p>

            {/* Select the chauffeur receiving the adjustment. */}
            <label className="mt-4 block text-sm text-slate-200">
                Chauffeur
                <select value={chauffeurId} onChange={(event) => setChauffeurId(event.target.value)}
                    disabled={isEditing} required
                    className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 p-2 text-white">
                    <option value="">Select chauffeur</option>
                    {chauffeurs.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.name}{item.email ? ` (${item.email})` : ""}
                        </option>
                    ))}
                </select>
            </label>

            <div key={definitionId} className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="text-sm text-slate-200">
                    Adjustment Definition
                    {/* Populate the assignment dates when an adjustment definition is selected. */}
                    <select value={definitionId} disabled={isEditing} onChange={(event) => {
                        /* Clear both assignment dates when changing definitions. */
                        setDefinitionId(event.target.value);
                        setEffectiveFrom("");
                        setEffectiveUntil("");
                        }} className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 p-2 text-white"
                    >
                        <option value="">Select adjustment</option>
                        {definitions.map((item) =>
                            <option key={item.id} value={item.id}>
                                {item.name} ({item.adjustment_type})
                            </option>
                        )}
                    </select>
                </label>

                <label className="text-sm text-slate-200">
                    Effective From
                    <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)}
                        min={selectedDefinition?.effective_from}
                        max={selectedDefinition?.effective_until ?? undefined}
                        className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 p-2 text-white" />
                </label>

                <label className="text-sm text-slate-200">
                    Effective Until (optional)
                    <input type="date" value={effectiveUntil} onChange={(event) => setEffectiveUntil(event.target.value)}
                        min={effectiveFrom || selectedDefinition?.effective_from}
                        max={selectedDefinition?.effective_until ?? undefined}
                        className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 p-2 text-white" />
                </label>
            </div>

            <p className="mt-4 text-xs text-slate-400">
                {selectedDefinition
                    ? `Definition validity: ${selectedDefinition.effective_from} — ${selectedDefinition.effective_until ?? "No end"}`
                    : "Select a definition to view its allowed effective period."}
            </p>

            {/* SECTION 3: Assignment submission and feedback. */}
            <div className="mt-5 flex flex-wrap items-center gap-4">
                <button type="submit" disabled={saving || !chauffeurId || !definitionId || !effectiveFrom}
                    className="rounded-lg bg-cyan-700 px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? "Saving..." : isEditing ? "Save Changes" : "Assign Adjustment"}
                </button>
                {/* Return to creation mode without modifying the assignment. */}
                {isEditing && (
                    <button type="button" onClick={onCancel} disabled={saving}
                        className="rounded-lg border border-slate-600 px-5 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                        Cancel
                    </button>
                )}
            </div>

            {message && <p role={success ? "status" : "alert"} className={`mt-3 text-sm ${success ? "text-green-400" : "text-red-300"}`}>{message}</p>}
        </form>
    );
}