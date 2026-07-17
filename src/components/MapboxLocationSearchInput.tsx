"use client";

/*
 * File purpose:
 * This reusable component allows a client to search for and select a location
 * through Mapbox Search Box.
 *
 * It loads address and POI suggestions, removes duplicate-looking results and
 * retrieves the exact coordinates after the client selects one location.
 *
 * The component can be reused for pickup, destination and future location fields.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { getTranslation } from "@/lib/i18n/translations";
import { formStyles } from "@/styles/classNames";
import type { LocationSuggestion, LocationSuggestionsResponse, RetrievedLocation, RetrievedLocationResponse } from "@/types/mapboxType";

type MapboxLocationSearchInputProps = {
    id: string;
    name: string;
    label: string;
    selectedLocation: RetrievedLocation | null;
    onSelectedLocationChange: (locationValue: RetrievedLocation | null) => void;
};

type ApiErrorResponse = { message?: string };

// Searches for and selects one exact Mapbox location.
export default function MapboxLocationSearchInput({ id, name, label, selectedLocation, onSelectedLocationChange }: MapboxLocationSearchInputProps) {
    const { languageCode } = useLanguage();
    const sessionTokenRef = useRef("");
    const [searchText, setSearchText] = useState("");
    const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isRetrieving, setIsRetrieving] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    // Returns translated booking-form text.
    function getLocationText(textKey: string) { return getTranslation("bookingForm", textKey, languageCode); }

    /* Loads suggestions shortly after the client stops typing.
        Type at least 3 characters
            ↓
        Wait 350 milliseconds
                ↓
        Load Mapbox suggestions
                ↓
        Select one suggestion
                ↓
        Retrieve exact coordinates
                ↓
        Show selected location

        Why the 350-millisecond delay? Without a delay, Mapbox would receive a request after every keystroke:
        Without a delay, Mapbox would receive a request after every keystroke:
            A
            Am
            Ams
            Amst
            Amste
            The short delay waits until the client pauses typing, which reduces unnecessary API requests.
    */
    useEffect(() => {
        const cleanedSearchText = searchText.trim();

        if (selectedLocation || cleanedSearchText.length < 3) { return; }

        const controller = new AbortController();

        const searchTimer = window.setTimeout(async () => {
            setIsSearching(true);
            setErrorMessage("");

            try {
                if (!sessionTokenRef.current) { sessionTokenRef.current = crypto.randomUUID(); }

                const searchParameters = new URLSearchParams({
                    q: cleanedSearchText,
                    sessionToken: sessionTokenRef.current,
                    languageCode,
                });

                const response = await fetch(`/api/mapbox/location-suggestions?${searchParameters}`, { signal: controller.signal });
                const result = await response.json() as LocationSuggestionsResponse & ApiErrorResponse;
                if (!response.ok) { throw new Error(result.message || "Location suggestions failed."); }

                // Removes suggestions with the same visible name and address.
                const uniqueSuggestions = result.suggestions.filter((suggestion, suggestionIndex, allSuggestions) =>
                    allSuggestions.findIndex((otherSuggestion) => otherSuggestion.name === suggestion.name && otherSuggestion.fullAddress === suggestion.fullAddress, ) === suggestionIndex,);

                setSuggestions(uniqueSuggestions);
                setHasSearched(true);
            } catch (error) {
                if (error instanceof Error && error.name === "AbortError") { return; }
                console.error("Could not load Mapbox location suggestions:", error);
                setSuggestions([]);
                setHasSearched(true);
                setErrorMessage(getTranslation("bookingForm", "locationSearchFailedText", languageCode));
            } finally {
                if (!controller.signal.aborted) { setIsSearching(false); }
            }
        }, 350);

        return () => {
            window.clearTimeout(searchTimer);
            controller.abort();
        };
    }, [searchText, selectedLocation, languageCode]);

    // Updates the search text and clears old results for short input.
    function handleSearchTextChange(event: ChangeEvent<HTMLInputElement>) {
        const nextSearchText = event.target.value;

        setSearchText(nextSearchText);
        setErrorMessage("");
        setHasSearched(false);

        if (nextSearchText.trim().length < 3) { setSuggestions([]); }
    }

    // Retrieves the exact coordinates of the selected suggestion.
    async function handleSelectSuggestion(suggestion: LocationSuggestion) {
        if (!sessionTokenRef.current) { return; }

        setIsRetrieving(true);
        setErrorMessage("");

        try {
            const searchParameters = new URLSearchParams({
                mapboxId: suggestion.mapboxId,
                sessionToken: sessionTokenRef.current,
                languageCode,
            });

            const response = await fetch(`/api/mapbox/retrieve-location?${searchParameters}`);
            const result = await response.json() as RetrievedLocationResponse & ApiErrorResponse;

            if (!response.ok) { throw new Error(result.message || "Location retrieval failed."); }

            setSearchText(result.location.fullAddress);
            setSuggestions([]);
            setHasSearched(false);
            onSelectedLocationChange(result.location);
        } catch (error) {
            console.error("Could not retrieve the selected Mapbox location:", error);
            setErrorMessage(getLocationText("locationSearchFailedText"));
        } finally {
            setIsRetrieving(false);
        }
    }

    // Clears the selected location and starts a new Mapbox search session.
    function handleChangeLocation() {
        const previousAddress = selectedLocation?.fullAddress || "";

        onSelectedLocationChange(null);
        setSearchText(previousAddress);
        setSuggestions([]);
        setHasSearched(false);
        setErrorMessage("");
        sessionTokenRef.current = "";
    }

    // Displays the selected location or an interactive suggestion field.
    return (
        <div className="relative">
            <label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label>

            {/* Stores only a location that was selected from Mapbox. */}
            <input type="hidden" name={name} value={selectedLocation?.fullAddress || ""} />

            {selectedLocation ? (
                <div className="rounded-xl border border-green-400/40 bg-green-400/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-300">{getLocationText("locationSelectedText")}</p>
                    <p className="mt-1 font-medium text-white" dir="auto">{selectedLocation.name}</p>
                    <p className="mt-1 text-sm text-slate-300" dir="auto">{selectedLocation.fullAddress}</p>

                    <button type="button" onClick={handleChangeLocation} className="mt-3 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
                        {getLocationText("changeLocationButton")}
                    </button>
                </div>
            ) : (
                <>
                    <input id={id} type="text" value={searchText} onChange={handleSearchTextChange} placeholder={getLocationText("locationSearchPlaceholder")} autoComplete="off" spellCheck={false} dir="auto" className={formStyles.inputUserPage} />
                    <div className="mt-2 min-h-5 text-sm" aria-live="polite">
                        {isSearching && <p className="text-slate-400">{getLocationText("locationSearchingText")}</p>}
                        {isRetrieving && <p className="text-slate-400">{getLocationText("locationSelectResultText")}</p>}
                        {errorMessage && <p className="text-red-300">{errorMessage}</p>}
                        {!isSearching && hasSearched && !errorMessage && suggestions.length === 0 && (
                            <p className="text-slate-400">{getLocationText("locationNoResultsText")}</p>
                        )}
                    </div>

                    {suggestions.length > 0 && (
                        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-cyan-400/30 bg-slate-950 shadow-xl">
                            {suggestions.map((suggestion) => (
                                <button key={suggestion.mapboxId} type="button" onClick={() => handleSelectSuggestion(suggestion)} disabled={isRetrieving} 
                                    className="block w-full border-b border-white/10 px-4 py-3 text-start transition last:border-b-0 hover:bg-cyan-400/10 disabled:opacity-50" >
                                    <span className="block font-medium text-white" dir="auto">{suggestion.name}</span>
                                    <span className="mt-1 block text-sm text-slate-400" dir="auto">{suggestion.fullAddress}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}