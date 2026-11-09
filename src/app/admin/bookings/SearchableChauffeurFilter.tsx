"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formStyles } from "@/styles/classNames";

type ChauffeurFilterOption = {
    id: string;
    name: string;
};

type AssignmentFilter = "all" | "assigned" | "unassigned";

type SearchableChauffeurFilterProps = {
    chauffeurs: ChauffeurFilterOption[];
    assignmentFilter: AssignmentFilter;
    selectedChauffeurId?: string;
};

/*
    SearchableChauffeurFilter

    Keeps the Assignment and Chauffeur filters synchronized.
    When Unassigned is selected, the chauffeur selection is
    cleared and disabled.
*/
export default function SearchableChauffeurFilter({ chauffeurs, assignmentFilter, selectedChauffeurId = "",}: SearchableChauffeurFilterProps) {

    /* Navigate to the unfiltered Admin bookings page. */
    const router = useRouter();

    /* Unassigned bookings cannot have a selected chauffeur. */
    const initialChauffeur =
        assignmentFilter === "unassigned"
            ? undefined
            : chauffeurs.find((chauffeur) => chauffeur.id === selectedChauffeurId);

    const [assignment, setAssignment] = useState<AssignmentFilter>(assignmentFilter);
    const [searchValue, setSearchValue] = useState(initialChauffeur?.name ?? "");
    const [chauffeurId, setChauffeurId] = useState(initialChauffeur?.id ?? "");

    /* Clears the chauffeur selection when Unassigned is selected. */
    function handleAssignmentChange(value: AssignmentFilter) {
        setAssignment(value);

        if (value === "all" || value === "unassigned") {
            setSearchValue("");
            setChauffeurId("");
        }
    }

    /* Matches the chauffeur name to its UUID or clears the chauffeur selection. */
    function handleSearchChange(value: string) {
        setSearchValue(value);
        const matchedChauffeur = chauffeurs.find((chauffeur) => chauffeur.name === value);
        setChauffeurId(matchedChauffeur?.id ?? "");

        /* A selected chauffeur always belongs to assigned bookings. */
        if (matchedChauffeur) {setAssignment("assigned");}
    }

    const chauffeurDisabled = assignment === "unassigned";

    /* Clears only the selected chauffeur without changing the Assignment filter. */
    function clearChauffeur() {
        setSearchValue("");
        setChauffeurId("");
    }
    return (
        <>
            <div>
                <label htmlFor="assignment" className="mb-1 block text-sm text-slate-300">
                    Assignment
                </label>

                <select id="assignment" name="assignment" value={assignment}
                    onChange={(event) => handleAssignmentChange(event.target.value as AssignmentFilter)}
                    className={formStyles.selectForm}
                >
                    <option value="all">All bookings</option>
                    <option value="assigned">Assigned bookings</option>
                    <option value="unassigned">Unassigned bookings</option>
                </select>
            </div>

            <div>
                <label htmlFor="chauffeurSearch" className="mb-1 block text-sm text-slate-300">
                    Chauffeur
                </label>

                <div className="relative">
                    <input
                        id="chauffeurSearch" list="chauffeur-filter-options"
                        value={searchValue} onChange={(event) => handleSearchChange(event.target.value)}
                        placeholder={chauffeurDisabled ? "Not available" : "All chauffeurs"}
                        className={`${formStyles.selectForm} pr-9 disabled:cursor-not-allowed disabled:opacity-50`}
                        autoComplete="off" disabled={chauffeurDisabled}
                    />

                    {/* Clears only the selected chauffeur. */}
                    {searchValue && !chauffeurDisabled && (
                        <button type="button" onClick={clearChauffeur} aria-label="Clear chauffeur" title="Clear chauffeur"
                            className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-2xl font-bold leading-none text-slate-300 hover:text-cyan-300"
                        >
                            ×
                        </button>
                    )}
                </div>

                {/* Sends the chauffeur UUID while Admin searches using the chauffeur name. */}
                <input type="hidden" name="chauffeurId" value={chauffeurId} />
                <datalist id="chauffeur-filter-options">
                    {chauffeurs.map((chauffeur) => (<option key={chauffeur.id} value={chauffeur.name} />))}
                </datalist>
            </div>

            {/* Reset all booking filters, including Journey period. */}
            <button className={`${formStyles.filterButton} order-99`}
                type="button"
                onClick={() => {
                    setAssignment("all");
                    setSearchValue("");
                    setChauffeurId("");

                    /* Reset the Journey period selection. */
                    const periodSelect = document.getElementById("period");
                    if (periodSelect instanceof HTMLSelectElement) {periodSelect.value = "all";}

                    /* Reset the cancelled-bookings checkbox without submitting the form. */
                    const cancelledCheckbox = document.querySelector<HTMLInputElement>('input[name="includeCancelled"]' );
                    if (cancelledCheckbox) {cancelledCheckbox.checked = false; }

                    /* Navigate to the unfiltered bookings page. */
                    router.push("/admin/bookings");
                }}
            >
                Reset filters
            </button>
        </>
    );
}