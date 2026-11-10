"use client";

/* ============================================================
   VOYA TAXI — CLIENT ADJUSTMENT CREATION FORM

   Creates reusable discount and surcharge definitions.
   Does not assign adjustments to clients or bookings.
============================================================ */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type AdjustmentType = "discount" | "surcharge";
type ValueType = "percentage" | "fixed";

/* Existing adjustment values supplied when editing a definition. */
export type ClientAdjustment = {
    id: string; name: string; description: string | null;
    adjustment_type: AdjustmentType; value_type: ValueType;
    value: number; currency_code: string | null;
    effective_from: string; effective_until: string | null;
};

type Props = {
    adjustment?: ClientAdjustment;
    onCancel?: () => void;
    onSaved?: (message: string) => void;
    onSubmitStart?: () => void;
};

export default function ClientAdjustmentForm({ adjustment, onCancel, onSaved, onSubmitStart }: Props) {
    const router = useRouter();
    const isEditing = Boolean(adjustment);

    /* Load existing values when editing; otherwise initialize an empty form. */
    const [name, setName] = useState(adjustment?.name ?? "");
    const [description, setDescription] = useState(adjustment?.description ?? "");
    const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>(adjustment?.adjustment_type ?? "discount");
    const [valueType, setValueType] = useState<ValueType>(adjustment?.value_type ?? "percentage");
    const [value, setValue] = useState(adjustment ? String(adjustment.value) : "");
    const [currencyCode, setCurrencyCode] = useState(adjustment?.currency_code ?? "EUR");
    const [effectiveFrom, setEffectiveFrom] = useState(adjustment?.effective_from ?? "");
    const [effectiveUntil, setEffectiveUntil] = useState(adjustment?.effective_until ?? "");
    
    const [isActive, setIsActive] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [success, setSuccess] = useState(false);

    /* SECTION 1: Save the definition through the protected Admin API. */
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setMessage("");
        setSuccess(false);
        /* Clear previous manager feedback before checking or saving. */
        onSubmitStart?.();

        try {
            
            /* Check overlapping periods before submitting the adjustment. */
            const overlapResponse = await fetch("/api/admin/financial/client-adjustments/check-overlap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: adjustment?.id,
                    name,
                    adjustment_type: adjustmentType,
                    effective_from: effectiveFrom,
                    effective_until: effectiveUntil || null,
                }),
            });

            const overlapResult = await overlapResponse.json();

            /* Show the conflict and prevent saving. */
            if (overlapResponse.status === 409) {
                const names = (overlapResult.warnings ?? [])
                    .map((item: { name: string }) => item.name)
                    .join(", ");
                    
                /* Remove previous success feedback when saving is blocked. */
                onSaved?.("");
                setMessage(`Cannot save: the effective period overlaps with ${names}. Please adjust the dates.`);
                return;
            }

            if (!overlapResponse.ok) {
                throw new Error(overlapResult.message ?? "Unable to check adjustment periods.");
            }

            const response = await fetch(isEditing ? `/api/admin/financial/client-adjustments/${adjustment!.id}` : "/api/admin/financial/client-adjustments",
                {
                    method: isEditing ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name, description, adjustment_type: adjustmentType, value_type: valueType,
                        value, currency_code: valueType === "fixed" ? currencyCode : null,
                        effective_from: effectiveFrom || null, effective_until: effectiveUntil || null,
                        is_active: isActive,
                }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message ?? "Could not save adjustment.");

            /* Refresh after saving; reset only when creating a new definition. */
            setSuccess(true);
            setMessage(isEditing ? "Adjustment updated successfully." : "Adjustment created successfully.");
            /* Notify the parent so the success message survives closing edit mode. */
            if (isEditing) onSaved?.("Adjustment updated successfully.");
            if (!isEditing) {
                setName(""); setDescription(""); setValue("");
                setEffectiveFrom(""); setEffectiveUntil("");
            }
            router.refresh();
            if (isEditing) onCancel?.();

        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to save adjustment.");
        } finally {
            setSaving(false);
        }
    }

    const inputClass = "mt-1 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white";
    const labelClass = "block text-sm text-slate-300";

    /* SECTION 2: Render the reusable adjustment definition form. */
    return (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
                <label htmlFor="adjustment-name" className={labelClass}>Adjustment Name *</label>
                <input id="adjustment-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)}
                    maxLength={150} required placeholder="e.g. Loyalty Discount" />
            </div>

            <div>
                <label htmlFor="adjustment-description" className={labelClass}>Description</label>
                <textarea id="adjustment-description" className={inputClass} value={description}
                    onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div>
                    <label htmlFor="adjustment-type" className={labelClass}>Adjustment Type *</label>
                    <select id="adjustment-type" className={inputClass} value={adjustmentType}
                        onChange={(e) => setAdjustmentType(e.target.value as AdjustmentType)}>
                        <option value="discount">Discount</option>
                        <option value="surcharge">Surcharge</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="value-type" className={labelClass}>Calculation Type *</label>
                    <select id="value-type" className={inputClass} value={valueType}
                        onChange={(e) => setValueType(e.target.value as ValueType)}>
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed Amount</option>
                    </select>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div>
                    {/* Display the appropriate label for percentage or fixed-amount adjustments. */}
                    <label htmlFor="adjustment-value" className={labelClass}>
                        {valueType === "percentage" ? "Percentage (%) *" : `Amount (${currencyCode}) *`}
                    </label>
                    <input id="adjustment-value" type="number" min="0.0001"
                        max={valueType === "percentage" && adjustmentType === "discount" ? 100 : undefined}
                        step="0.0001" className={inputClass} value={value}
                        onChange={(e) => setValue(e.target.value)} required placeholder="e.g. 10" />
                </div>
                {valueType === "fixed" && (
                    <div>
                        <label htmlFor="adjustment-currency" className={labelClass}>Currency *</label>
                        <select id="adjustment-currency" className={inputClass} value={currencyCode}
                            onChange={(e) => setCurrencyCode(e.target.value)}>
                            <option value="EUR">EUR</option>
                            <option value="USD">USD</option>
                            <option value="GBP">GBP</option>
                        </select>
                    </div>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div>
                    {/* Every adjustment requires a defined starting date. */}
                    <label htmlFor="effective-from" className={labelClass}>Effective From *</label>
                    <input id="effective-from" type="date" className={inputClass} value={effectiveFrom}
                        onChange={(e) => setEffectiveFrom(e.target.value)} required />
                </div>
                
                <div>
                    <label htmlFor="effective-until" className={labelClass}>Effective Until (optional)</label>
                    <input id="effective-until" type="date" min={effectiveFrom || undefined}
                        className={inputClass} value={effectiveUntil} onChange={(e) => setEffectiveUntil(e.target.value)} />
                </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active
            </label>

            {message && <p role="status" className={`text-sm ${success ? "text-green-400" : "text-red-300"}`}>{message}</p>}

            <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={saving}
                    className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
                    {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Adjustment"}
                </button>
                {isEditing && onCancel && (
                    <button type="button" onClick={onCancel} disabled={saving}
                        className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">
                        Cancel
                    </button>
                )}
            </div>
        </form>
    );
}