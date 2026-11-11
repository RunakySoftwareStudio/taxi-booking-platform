"use client";

/* ============================================================
   VOYA TAXI — CLIENT ADJUSTMENT ASSIGNMENTS MANAGER

   Coordinates the assignment table and shared Create/Edit form.
   Keeps assignment selection within the client interface.
============================================================ */

import { useState } from "react";
import ClientAdjustmentAssignments from "./ClientAdjustmentAssignments";
import ClientAdjustmentAssignmentForm, { type AdjustmentOption } from "./ClientAdjustmentAssignmentForm";

export type ClientAssignmentRow = {
    id: string;
    adjustment_definition_id: string;
    effective_from: string;
    effective_until: string | null;
    is_active: boolean;
    client_adjustment_definitions: {
        name: string;
        adjustment_type: string;
        value_type: string;
        value: number;
        currency_code: string | null;
    } | null;
};

type Props = {
    clientId: string;
    assignments: ClientAssignmentRow[];
    definitions: AdjustmentOption[];
};

export default function ClientAdjustmentAssignmentsManager({ clientId, assignments, definitions }: Props) {
    /* SECTION 1: Track the assignment selected for editing. */
    const [selected, setSelected] = useState<ClientAssignmentRow | null>(null);
    /* Preserve successful edit feedback after returning to Create mode. */
    const [successMessage, setSuccessMessage] = useState("");

    function handleEdit(item: ClientAssignmentRow) {
        setSelected(item);
    }

    function handleCancel() {
        setSelected(null);
    }

    return (
        <>
            <ClientAdjustmentAssignments assignments={assignments} onEdit={handleEdit} />
            {/* Display successful edits after the form returns to Create mode. */}
            {successMessage && (
                <p role="status" className="mt-3 text-sm text-green-400">
                    {successMessage}
                </p>
            )}
            {/* SECTION 2: Reuse the assignment form for creation and editing. */}
            <ClientAdjustmentAssignmentForm
                key={selected?.id ?? "new"}
                clientId={clientId}
                definitions={definitions}
                assignment={selected}
                onCancel={handleCancel}
                onSaved={setSuccessMessage}
                onSubmitStart={() => setSuccessMessage("")}
            />
        </>
    );
}