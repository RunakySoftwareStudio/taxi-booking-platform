"use client";

/* ============================================================
   VOYA TAXI — RETRY COMMISSION BUTTON

   Allows Admin to retry failed commission generation.
   Displays the API result and refreshes financial review.
============================================================ */

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { bookingId: string };

export default function RetryCommissionButton({ bookingId }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    /* SECTION 1: Request a protected commission retry. */
    async function handleRetry() {
        if (loading) return;

        setLoading(true);
        setMessage("");

        try {
            const response = await fetch(`/api/admin/commissions/${bookingId}/retry`, { method: "POST" });
            const result = await response.json();

            if (!response.ok) {setMessage(result.message ?? "Commission retry failed."); return;}

            router.refresh();
        } catch {
            setMessage("Unable to contact the server.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <button type="button" onClick={handleRetry} disabled={loading}
                className="rounded bg-cyan-700 px-3 py-1.5 text-sm text-white hover:bg-cyan-600 disabled:opacity-50">
                {loading ? "Retrying..." : "Retry"}
            </button>
            {message && <p role="alert" className="mt-2 max-w-xs text-xs text-red-300">{message}</p>}
        </div>
    );
}