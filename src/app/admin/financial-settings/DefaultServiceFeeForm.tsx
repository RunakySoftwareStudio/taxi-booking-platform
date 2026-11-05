"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
    DefaultServiceFeeForm
    Allows Admin to enter a default service-fee percentage
    and future effective date. API submission comes later.
*/
export default function DefaultServiceFeeForm() {
    const [percentage, setPercentage] = useState("");
    const [effectiveFrom, setEffectiveFrom] = useState("");
    // Earliest permitted start date: tomorrow in the Netherlands.
    const todayNL = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());

    const nextDate = new Date(`${todayNL}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const minDate = nextDate.toISOString().slice(0, 10);
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [isError, setIsError] = useState(false);

    /*
        Submit a new default service-fee rate.
        The protected API validates the request and calls the PostgreSQL scheduling RPC.
    */
    async function handleAddRate(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) return;

        setSaving(true);
        setMessage("");
        setIsError(false);

        try {
            const response = await fetch("/api/admin/financial-settings/default-service-fee", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ percentage: Number(percentage), effectiveFrom }),
            });

            const result = await response.json();

            if (!response.ok) {
                setIsError(true);
                setMessage(result.message || "Could not save service-fee rate.");
                return;
            }

            setPercentage("");
            setEffectiveFrom("");
            setMessage("Default service-fee rate scheduled successfully.");
            router.refresh();
        } catch {
            setIsError(true);
            setMessage("Unable to connect to the server.");
        } finally {
            setSaving(false);
        }
    }
    return (
        <form onSubmit={handleAddRate} className="mt-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Schedule Default Service Fee</h3>

            {/* Service-fee percentage */}
            <div className="space-y-2">
                <label htmlFor="default-service-fee-percentage" className="block text-sm font-medium text-slate-300">
                    Service fee percentage (%)
                </label>
                <input id="default-service-fee-percentage" type="number" min="0" max="100" step="0.0001"
                    value={percentage} onChange={(event) => setPercentage(event.target.value)}
                    placeholder="e.g. 10"
                    className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white"
                />
            </div>

            {/* Effective start date */}
            <div className="space-y-2">
                <label htmlFor="default-service-fee-date" className="block text-sm font-medium text-slate-300">
                    Effective from
                </label>
                <input id="default-service-fee-date" type="date" min={minDate}
                    value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)}
                    className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white"
                />
            </div>
            {/* Display submission feedback */}
            {message && (
                <p role="status" className={`text-sm ${isError ? "text-red-300" : "text-green-300"}`}>
                    {message}
                </p>
            )}

            {/* Submit the new service-fee rate */}
            <div className="flex justify-end">
                <button type="submit" disabled={saving || percentage === "" || !effectiveFrom}
                    className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? "Saving..." : "Add Service Fee Rate"}
                </button>
            </div>
        </form>
    );
}