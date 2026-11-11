"use client";

/* ============================================================
   VOYA TAXI — CHAUFFEUR ADJUSTMENT ASSIGNMENTS MANAGER

   Coordinates the centralized Create/Edit form and existing
   chauffeur assignments without changing their identities.
============================================================ */

import { useState } from "react";
import ChauffeurAdjustmentAssignmentForm, {
    type AdjustmentOption,
    type ChauffeurOption,
    type EditableAssignment,
} from "./ChauffeurAdjustmentAssignmentForm";
import ChauffeurAdjustmentAssignmentsTable, {
    type ChauffeurAssignmentRow,
} from "./ChauffeurAdjustmentAssignmentsTable";

type Props = {
    chauffeurs: ChauffeurOption[];
    definitions: AdjustmentOption[];
    assignments: ChauffeurAssignmentRow[];
};

export default function ChauffeurAdjustmentAssignmentsManager({ chauffeurs, definitions, assignments }: Props) {
    /* SECTION 1: Track the assignment being edited. */
    const [selected, setSelected] = useState<EditableAssignment | null>(null);
    const [successMessage, setSuccessMessage] = useState("");

    /* SECTION 2: Select an existing assignment for editing. */
    function handleEdit(item: ChauffeurAssignmentRow) {
        setSuccessMessage("");
        setSelected({
            id: item.id,
            chauffeur_id: item.chauffeur_id,
            adjustment_definition_id: item.adjustment_definition_id,
            effective_from: item.effective_from,
            effective_until: item.effective_until,
        });

        document.getElementById("chauffeur-assignment-form")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }

    /* Return to creation mode after editing or cancellation. */
    function handleCancel() {
        setSelected(null);
    }

    return (
        <>
            {/* SECTION 3: Shared assignment creation and editing form. */}
            <div id="chauffeur-assignment-form">
                {successMessage && (
                    <p role="status" className="mt-4 text-sm text-green-400">
                        {successMessage}
                    </p>
                )}

                <ChauffeurAdjustmentAssignmentForm
                    key={selected?.id ?? "new"}
                    chauffeurs={chauffeurs}
                    definitions={definitions}
                    assignment={selected}
                    onCancel={handleCancel}
                    onSaved={setSuccessMessage}
                    onSubmitStart={() => setSuccessMessage("")}
                />
            </div>

            {/* SECTION 4: Existing assignments and status controls. */}
            {/* Reset outdated table feedback when an assignment is edited or saved. */}
            <ChauffeurAdjustmentAssignmentsTable
                key={selected?.id ?? `new-${successMessage}`}
                assignments={assignments}
                onEdit={handleEdit}
                onStatusChangeStart={() => setSuccessMessage("")}
            />
        </>
    );
}