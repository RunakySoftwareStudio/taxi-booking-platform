
"use client";

import { useState } from "react";
import PlatformInvoiceSettingsForm from "./PlatformInvoiceSettingsForm";

/*
    PlatformInvoiceSettingsEditor

    Controls visibility of the Admin editing form.
    Displays the form only when Edit Details is selected.
*/

type PlatformSettings = {
    legal_name: string | null;
    business_address: string | null;
    kvk_number: string | null;
    vat_number: string | null;
    contact_email: string | null;
    iban: string | null;
    bic: string | null;
    payment_terms_days: number;
};

export default function PlatformInvoiceSettingsEditor({ settings }: { settings: PlatformSettings }) {
    const [isEditing, setIsEditing] = useState(false);

    return (
        <div className="mt-6">
            {/* Toggle the editing form without changing stored data. */}
            <button type="button" onClick={() => setIsEditing(!isEditing)}
                className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">
                {isEditing ? "Cancel Editing" : "Edit Details"}
            </button>

            {/* Close the editing form after a successful save. */}
            {isEditing && (
                <PlatformInvoiceSettingsForm initialSettings={settings} onSaved={() => setIsEditing(false)}/>
            )}
        </div>
    );
}
