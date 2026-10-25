
"use client";

import { useState } from "react";

/* ============================================================
   COPY ID BUTTON
   Reusable clipboard button for chauffeur IDs and booking UUIDs.
   Does not change any database records.
============================================================ */
export default function CopyBookingIdButton({recordId, label = "Copy ID"}: {recordId: string; label?: string}) {
    const [copied, setCopied] = useState(false);

    /* Copies the UUID and restores the original button label after 2 seconds. */
    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(recordId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    }
    
    return (
        <button type="button" onClick={handleCopy} className="text-sm text-cyan-300 underline hover:text-cyan-100">
            {copied ? "Copied!" : label}
        </button>
    );
}
