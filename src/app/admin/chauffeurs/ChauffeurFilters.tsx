"use client";

import { useState } from "react";
import { formStyles } from "@/styles/classNames";

type ChauffeurFiltersProps = {
    nameFilter: string;
    serviceAreaFilter: string;
    petsFilter: string;
    wheelchairCapacityFilter: number;
    extraLargeLuggageFilter: string;
};

/*
    ChauffeurFilters

    Contains the Admin chauffeur search/filter controls.
    Filtering is submitted through URL parameters while Reset
    reloads the clean Chauffeurs page.
*/
export default function ChauffeurFilters({
    nameFilter,
    serviceAreaFilter,
    petsFilter,
    wheelchairCapacityFilter,
    extraLargeLuggageFilter,
}: ChauffeurFiltersProps) {

    /* Stores the editable text-filter values so they can be cleared with ×. */
    const [nameValue, setNameValue] = useState(nameFilter);
    const [serviceAreaValue, setServiceAreaValue] = useState(serviceAreaFilter);

    /* Clears all chauffeur filters and returns to the full chauffeur list. */
    function resetFilters() {
        window.location.assign("/admin/chauffeurs");
    }

    return (
        <form
            method="GET"
            action="/admin/chauffeurs"
            className="mt-6 flex flex-wrap items-end gap-3"
        >
            {/* Searches chauffeur names using partial text. */}
            <div>
                <label htmlFor="name" className="mb-1 block text-sm text-slate-300">
                    Name
                </label>

                <div className="relative">
                    <input
                        id="name"
                        name="name"
                        type="text"
                        value={nameValue}
                        onChange={(event) => setNameValue(event.target.value)}
                        placeholder="Search name..."
                        className={`${formStyles.selectForm} pr-9`}
                        autoComplete="off"
                    />

                    {/* Clears only the chauffeur-name filter. */}
                    {nameValue && (
                        <button
                            type="button"
                            onClick={() => setNameValue("")}
                            aria-label="Clear chauffeur name"
                            title="Clear chauffeur name"
                            className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-2xl font-bold leading-none text-slate-300 hover:text-cyan-300"
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            {/* Searches chauffeur service areas using partial text. */}
            <div>
                <label htmlFor="serviceArea" className="mb-1 block text-sm text-slate-300">
                    Service area
                </label>

                <div className="relative">
                    <input
                        id="serviceArea"
                        name="serviceArea"
                        type="text"
                        value={serviceAreaValue}
                        onChange={(event) => setServiceAreaValue(event.target.value)}
                        placeholder="Almere..."
                        className={`${formStyles.selectForm} pr-9`}
                        autoComplete="off"
                    />

                    {/* Clears only the service-area filter. */}
                    {serviceAreaValue && (
                        <button
                            type="button"
                            onClick={() => setServiceAreaValue("")}
                            aria-label="Clear service area"
                            title="Clear service area"
                            className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-2xl font-bold leading-none text-slate-300 hover:text-cyan-300"
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            {/* Filters chauffeurs by pet acceptance. */}
            <div>
                <label htmlFor="pets" className="mb-1 block text-sm text-slate-300">
                    Pets
                </label>

                <select
                    id="pets"
                    name="pets"
                    defaultValue={petsFilter}
                    className={formStyles.selectForm}
                >
                    <option value="all">All</option>
                    <option value="yes">Accepts pets</option>
                    <option value="no">No pets</option>
                </select>
            </div>

            {/* Filters by minimum wheelchair capacity of the default vehicle. */}
            <div>
                <label htmlFor="wheelchairCapacity" className="mb-1 block text-sm text-slate-300">
                    Wheelchair capacity
                </label>

                <select
                    id="wheelchairCapacity"
                    name="wheelchairCapacity"
                    defaultValue={wheelchairCapacityFilter || ""}
                    className={formStyles.selectForm}
                >
                    <option value="">Any</option>
                    <option value="1">At least 1</option>
                    <option value="2">At least 2</option>
                    <option value="3">At least 3</option>
                    <option value="4">At least 4</option>
                </select>
            </div>

            {/* Filters by extra-large-luggage support of the default vehicle. */}
            <div>
                <label htmlFor="extraLargeLuggage" className="mb-1 block text-sm text-slate-300">
                    Extra-large luggage
                </label>

                <select
                    id="extraLargeLuggage"
                    name="extraLargeLuggage"
                    defaultValue={extraLargeLuggageFilter}
                    className={formStyles.selectForm}
                >
                    <option value="all">All</option>
                    <option value="yes">Supported</option>
                    <option value="no">Not supported</option>
                </select>
            </div>

            <button type="submit" className={formStyles.filterButton}>
                Search
            </button>

            {/* Clears both the URL filters and the visible form values. */}
            <button
                type="button"
                onClick={resetFilters}
                className={formStyles.filterButton}
            >
                Reset filters
            </button>
        </form>
    );
}