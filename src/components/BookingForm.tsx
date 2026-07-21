"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { type BookingRequest } from "@/types/bookingType";
import { type BookingSummary } from "@/types/bookingSummaryType";
import { tripTypes } from "@/data/tripTypeData";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";
import { getTranslation } from "@/lib/i18n/translations";
import { useLanguage } from "@/components/LanguageProvider";
import Link from "next/link";
import MapboxLocationSearchInput from "@/components/MapboxLocationSearchInput";
import type { RetrievedLocation, RouteEstimate, RouteEstimateResponse } from "@/types/mapboxType";
import { formatShortDate, formatShortTime } from "@/lib/formatDateTime";

function getTodayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function BookingForm() {
    const { languageCode } = useLanguage();

    // getBookingFormText returns translated text for this booking form.
    // This keeps the JSX shorter than repeating getTranslation everywhere.
    function getBookingFormText(textKey: string) { return getTranslation("bookingForm", textKey, languageCode); }
    const [submitted, setSubmitted] = useState(false);
    const [submittedBooking, setSubmittedBooking] = useState<BookingSummary | null>(null);
    const [bookingDraft, setBookingDraft] = useState<BookingRequest | null>(null);
    const [isReviewing, setIsReviewing] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const todayDate = getTodayDateInputValue();
    const bookingResultRef = useRef<HTMLDivElement | null>(null);
    const [hasPets, setHasPets] = useState(false);
    // Stores the exact Mapbox locations selected by the client.
    const [pickupLocation, setPickupLocation] = useState<RetrievedLocation | null>(null);
    const [destinationLocation, setDestinationLocation] = useState<RetrievedLocation | null>(null);

    // Stores the automatically calculated Mapbox route information.
    const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(null);
    const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
    const [routeEstimateError, setRouteEstimateError] = useState("");

    // When submittedBooking changes from null to a real booking, scroll smoothly to the result area.
    useEffect(() => {
        if (submittedBooking) {
            bookingResultRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }
    }, [submittedBooking]);

    // Updates pickup and prepares a new route calculation.
    function handlePickupLocationChange(locationValue: RetrievedLocation | null) {
        setPickupLocation(locationValue);
        setRouteEstimate(null);
        setRouteEstimateError("");
        setIsCalculatingRoute(Boolean(locationValue && destinationLocation));
    }

    // Updates destination and prepares a new route calculation.
    function handleDestinationLocationChange(locationValue: RetrievedLocation | null) {
        setDestinationLocation(locationValue);
        setRouteEstimate(null);
        setRouteEstimateError("");
        setIsCalculatingRoute(Boolean(pickupLocation && locationValue));
    }

    // useeffect runs when something changes(pickupLocation or destinationLocation ). Requests a Mapbox route whenever both selected locations change.
    // the automatic calculation effect
    useEffect(() => {
        if (!pickupLocation || !destinationLocation) { return; }

        const controller = new AbortController();
        async function loadRouteEstimate() {
            try {
                const response = await fetch("/api/mapbox/route-estimate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        pickup: pickupLocation?.coordinate,
                        destination: destinationLocation?.coordinate,
                    }),
                    signal: controller.signal,
                });

                const result = await response.json() as RouteEstimateResponse & { message?: string };
                if (!response.ok || !result.route) { throw new Error(result.message || "Route calculation failed."); }

                setRouteEstimate(result.route);
                setRouteEstimateError("");
            } catch (error) {
                if (error instanceof Error && error.name === "AbortError") { return; }

                console.error("Could not calculate the Mapbox route:", error);
                setRouteEstimate(null);
                setRouteEstimateError(getTranslation("bookingForm", "routeEstimateFailedText", languageCode));
            } finally {
                if (!controller.signal.aborted) { setIsCalculatingRoute(false); }
            }
        }

        void loadRouteEstimate();

        return () => controller.abort();
    }, [pickupLocation, destinationLocation, languageCode]);

    // Converts a stable trip-type database value into translated visible text.
    function getTripTypeLabel(tripTypeValue: string) {
    const tripTypeTranslationKeys: Record<string, string> = {
        "one-way": "tripTypeOneWay",
        return: "tripTypeReturn",
        airport: "tripTypeAirport",
        business: "tripTypeBusiness",
        hourly: "tripTypeHourly",
    };

    const translationKey = tripTypeTranslationKeys[tripTypeValue];

    return translationKey
        ? getTranslation("chauffeurDashboardPage", translationKey, languageCode)
        : tripTypeValue;
    }

    // Converts a stable booking-status database value into translated visible text.
    function getBookingStatusLabel(statusValue: string) {
        const statusTranslationKeys: Record<string, string> = {
            pending: "bookingStatusPending",
            approved: "bookingStatusApproved",
            accepted: "bookingStatusAccepted",
            assigned: "bookingStatusAssigned",
            completed: "bookingStatusCompleted",
            cancelled: "bookingStatusCancelled",
            rejected: "bookingStatusRejected",
            confirmed: "bookingStatusConfirmed",
        };

        const translationKey = statusTranslationKeys[statusValue];

        return translationKey
            ? getTranslation("chauffeurDashboardPage", translationKey, languageCode)
            : statusValue;
    }

    function createBookingRequest(formData: FormData, selectedPickup: RetrievedLocation,  selectedDestination: RetrievedLocation ): BookingRequest {
        return {
            pickup: String(formData.get("pickup") || ""),
            destination: String(formData.get("destination") || ""),
            pickupCoordinate: selectedPickup.coordinate,
            destinationCoordinate: selectedDestination.coordinate,
            date: String(formData.get("date") || ""),
            time: String(formData.get("time") || ""),
            estimatedDurationMinutes: String(routeEstimate?.durationMinutes || ""),
            passengers: String(formData.get("passengers") || ""),
            luggage: String(formData.get("luggage") || ""),
            name: String(formData.get("name") || ""),
            phone: String(formData.get("phone") || ""),
            email: String(formData.get("email") || ""),
            tripType: String(formData.get("tripType") || ""),
            notes: String(formData.get("notes") || ""),
            status: "pending",
            hasPets,
        };
    }

    function handleReviewBooking(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        // Prevents manually typed text from being submitted without selecting Mapbox results.
        if (!pickupLocation || !destinationLocation) {
            setErrorMessage(getBookingFormText("locationSelectResultText"));
            return;
        }
        // Waits for a valid route calculation before opening the review screen.
        if (isCalculatingRoute) {
            setErrorMessage(getBookingFormText("routeCalculationPendingText"));
            return;
        }
        if (!routeEstimate) {
            setErrorMessage(getBookingFormText("routeEstimateFailedText"));
            return;
        }
        const form = event.currentTarget;
        const formData = new FormData(form);
        const bookingRequest = createBookingRequest(formData, pickupLocation, destinationLocation);

        setErrorMessage("");
        setSubmitted(false);
        setSubmittedBooking(null);
        setBookingDraft(bookingRequest);
        setIsReviewing(true);
        setRouteEstimateError("");
    }

    function handleBackToEdit() {
        setErrorMessage("");
        setIsReviewing(false);
    }

    async function handleConfirmBooking() {
        if (!bookingDraft) {return;  }
        setErrorMessage("");
        setIsSending(true);

        try {
            const response = await fetch("/api/bookings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bookingDraft), });

            if (!response.ok) { throw new Error("Booking request failed"); }

            const result = (await response.json()) as { message: string; booking: BookingSummary };
             /* ======================================
                So the “refresh” is not a browser refresh. It is a React re-render.
                The screen refresh happens in handleConfirmBooking() through 
                    setSubmittedBooking(), setSubmitted(), setBookingDraft(), and setIsReviewing().   
                Before confirm: bookingDraft has values
                    → form can show old values again
                After confirm:
                    setBookingDraft(null)
                    → bookingDraft is empty
                    → defaultValue becomes ""
                    → fields are empty if the form is shown again
              ===================================================  */
            setSubmittedBooking(result.booking);
            setSubmitted(true);
            setBookingDraft(null);
            setIsReviewing(false);
            setHasPets(false);
            setPickupLocation(null);
            setDestinationLocation(null);
            // Clears the previous Mapbox journey result after successful booking.
            setRouteEstimate(null);
            setRouteEstimateError("");
            setIsCalculatingRoute(false);
        } catch (error) {
            console.error("Could not submit booking:", error);
            setErrorMessage(getBookingFormText("submitErrorMessage"));
        } finally {
            setIsSending(false);
        }
    }

  return (
    <section id="booking" className="bg-slate-900 px-4 py-16 text-white sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400"> {getBookingFormText("label")} </p>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl"> {getBookingFormText("title")} </h2>
                <p className="mt-4 text-slate-300"> {getBookingFormText("description")} </p>
            </div>

            {isReviewing && bookingDraft ? (
                <div className="mt-8 rounded-2xl border-2 border-cyan-300/40 bg-slate-950 p-4 sm:mt-12 sm:p-6">
                    <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> {getBookingFormText("reviewLabel")} </p>
                    <h3 className={formStyles.formH3SemiBold}> {getBookingFormText("reviewTitle")} </h3>

                    <div className="mt-6 space-y-2">
                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryNameLabel")} </span>
                            <span className={formStyles.formP}>{bookingDraft.name}</span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryPhoneLabel")} </span>
                            <span className={formStyles.formP}>{bookingDraft.phone}</span>
                        </div>
                        <div className="md:col-span-2">
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryEmailLabel")} </span>
                            <span className={formStyles.formP}>{bookingDraft.email}</span>
                        </div>
                        <p>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryPickupLabel")} </span>
                            <span className={formStyles.formP}>{bookingDraft.pickup}</span>
                        </p>
                        <p>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryDestinationLabel")} </span>
                            <span className={formStyles.formP}>{bookingDraft.destination}</span>
                        </p>
                        <div className="grid gap-2 grid-cols-2">
                            <div>
                                <span className={formStyles.formPCyan}> {getBookingFormText("summaryDateLabel")} </span>
                                <span className={formStyles.formP}>{formatShortDate(bookingDraft.date)}</span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> {getBookingFormText("summaryTimeLabel")} </span>
                                <span className={formStyles.formP}>{formatShortTime(bookingDraft.time)}</span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> {getBookingFormText("summaryEstimatedDurationLabel")} </span>
                                <span className={formStyles.formP}> {bookingDraft.estimatedDurationMinutes} {getBookingFormText("minutesUnit")} </span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> {getBookingFormText("summaryPassengersLabel")} </span>
                                <span className={formStyles.formP}>{bookingDraft.passengers}</span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> {getBookingFormText("summaryLuggageLabel")} </span>
                                <span className={formStyles.formP}>{bookingDraft.luggage || "0"}</span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> {getBookingFormText("summaryTripLabel")} </span>
                                <span className={formStyles.formP}>{getTripTypeLabel(bookingDraft.tripType)}</span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> {getBookingFormText("summaryHasPetsLabel")} </span>
                                <span className={bookingDraft.hasPets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>
                                    {bookingDraft.hasPets ? "✓" : "X"}
                                </span>
                            </div>
                        </div>

                        {bookingDraft.notes && (
                            <div className="md:col-span-2">
                                <span className={formStyles.formPCyan}> {getBookingFormText("summaryExtraNotesLabel")} </span>
                                <span className={formStyles.formP}>{bookingDraft.notes}</span>
                            </div>
                        )}
                    </div>

                    {errorMessage && ( <p className={tableStyles.errorCell}> {errorMessage} </p> )}

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <button type="button" onClick={handleBackToEdit} className={formStyles.submitSmallButtonUserPage}>
                            {getBookingFormText("backToEditButton")}
                        </button>

                        <button type="button" onClick={handleConfirmBooking} disabled={isSending} className={formStyles.submitSmallButtonUserPage}>
                            {isSending ? getBookingFormText("sendingButton") : getBookingFormText("confirmBookingButton")}
                        </button>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleReviewBooking} className="mt-8 rounded-2xl border-2 border-white/10 bg-white/5 p-4 sm:mt-12 sm:p-6">
                    <div className="grid gap-5 sm:gap-6 md:grid-cols-2">
                        <MapboxLocationSearchInput
                            id="pickup"
                            name="pickup"
                            label={getBookingFormText("pickupLabel")}
                            selectedLocation={pickupLocation}
                            onSelectedLocationChange={handlePickupLocationChange}
                        />

                        <MapboxLocationSearchInput
                            id="destination"
                            name="destination"
                            label={getBookingFormText("destinationLabel")}
                            selectedLocation={destinationLocation}
                            onSelectedLocationChange={handleDestinationLocationChange}
                        />
                        {/* Shows the automatically calculated Mapbox route estimate. */}
                        {(isCalculatingRoute || routeEstimate || routeEstimateError) && (
                            <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-4 md:col-span-2">
                                <h3 className="font-semibold text-yellow-300 text-start">{getBookingFormText("routeEstimateTitle")}</h3>
                                {isCalculatingRoute && (<p className="mt-2 text-sm text-slate-300 text-start">{getBookingFormText("routeCalculatingText")}</p>  )}
                                {routeEstimate && !isCalculatingRoute && (
                                    <>
                                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                            <p className="text-start">
                                                <span className="font-semibold text-cyan-300">{getBookingFormText("routeDistanceLabel")} </span>
                                                <span className="technical-value">{routeEstimate.distanceKilometers} {getBookingFormText("routeKilometersUnit")}</span>
                                            </p>

                                            <p className="text-start">
                                                <span className="font-semibold text-cyan-300">{getBookingFormText("routeDurationLabel")} </span>
                                                <span className="technical-value">{routeEstimate.durationMinutes} {getBookingFormText("routeMinutesUnit")}</span>
                                            </p>
                                        </div>
                                        <p className="mt-3 text-sm text-slate-400 text-start">{getBookingFormText("routeEstimateNotice")}</p>
                                    </>
                                )}
                                {routeEstimateError && <p className="mt-2 text-sm text-red-300 text-start">{routeEstimateError}</p>}
                            </div>
                        )}
                        <div>
                            <label htmlFor="date" className="mb-2 block text-sm font-medium"> {getBookingFormText("dateLabel")} </label>
                            <input id="date" name="date" type="date" min={todayDate} max="2099-12-31" required defaultValue={bookingDraft?.date || ""} className={formStyles.inputDateUserPage} />
                        </div>

                        <div>
                            <label htmlFor="time" className="mb-2 block text-sm font-medium"> {getBookingFormText("timeLabel")} </label>
                            <input id="time" name="time" type="time" required defaultValue={bookingDraft?.time || ""} className={formStyles.inputDateUserPage} />
                        </div>
  
                        <div>
                            <label htmlFor="passengers" className="mb-2 block text-sm font-medium"> {getBookingFormText("passengersLabel")} </label>
                            <input id="passengers" name="passengers" type="number" min="1" required placeholder={getBookingFormText("passengersPlaceholder")} defaultValue={bookingDraft?.passengers || ""} className={formStyles.inputUserPage} />
                        </div>

                        <div>
                            <label htmlFor="luggage" className="mb-2 block text-sm font-medium"> {getBookingFormText("luggageLabel")} </label>
                            <input id="luggage" name="luggage" type="number" min="0" placeholder={getBookingFormText("luggagePlaceholder")} defaultValue={bookingDraft?.luggage || ""} className={formStyles.inputUserPage}/>
                        </div>

                        <div>
                            <label htmlFor="name" className="mb-2 block text-sm font-medium"> {getBookingFormText("nameLabel")} </label>
                            <input id="name" name="name" type="text" required placeholder={getBookingFormText("namePlaceholder")} defaultValue={bookingDraft?.name || ""} className={formStyles.inputUserPage} />
                        </div>

                        <div>
                            <label htmlFor="phone" className="mb-2 block text-sm font-medium"> {getBookingFormText("phoneLabel")} </label>
                            <input id="phone" name="phone" type="tel" required inputMode="tel" pattern="\+?[0-9 ]{7,20}" title={getBookingFormText("phoneTitle")} placeholder={getBookingFormText("phonePlaceholder")} defaultValue={bookingDraft?.phone || ""} className={formStyles.inputUserPage}/>
                        </div>

                        <div>
                            <label htmlFor="email" className="mb-2 block text-sm font-medium"> {getBookingFormText("emailLabel")} </label>
                            <input id="email" name="email" type="email" required placeholder={getBookingFormText("emailPlaceholder")} defaultValue={bookingDraft?.email || ""} className={formStyles.inputUserPage}/>
                        </div>

                        <div>
                            <label htmlFor="tripType" className="mb-2 block text-sm font-medium"> {getBookingFormText("tripTypeLabel")} </label>
                            <select id="tripType" name="tripType" required defaultValue={bookingDraft?.tripType || ""} className={formStyles.inputDateUserPage} >
                                <option value=""> {getBookingFormText("selectTripType")} </option>
                                {tripTypes.map((tripType) => (
                                    <option key={tripType.value} value={tripType.value}>
                                        {getTripTypeLabel(tripType.value)}
                                    </option>  ))}
                            </select>
                        </div>

                        <label className="flex items-center gap-3 text-sm text-white">
                            <input type="checkbox" name="has_pets" checked={hasPets} onChange={(event) => setHasPets(event.target.checked)} className="h-5 w-5" />
                            {getBookingFormText("hasPetsLabel")}
                        </label>
                    </div>

                    <div className="mt-5 sm:mt-6">
                        <label htmlFor="notes" className="mb-2 block text-sm font-medium"> {getBookingFormText("notesLabel")} </label>
                        <textarea id="notes" name="notes" rows={4} placeholder={getBookingFormText("notesPlaceholder")} defaultValue={bookingDraft?.notes || ""} className={formStyles.textareaMainPg}/>
                    </div>

                    <button type="submit" className={formStyles.submitSmallButtonUserPage}> {getBookingFormText("reviewBookingButton")} </button>
                </form>
            )}

            {!isReviewing && errorMessage && ( <p className={tableStyles.errorCell}> {errorMessage} </p> )}
            {submitted && (<div className={pageStyles.successMsgPage}> {getBookingFormText("bookingReceivedMessage")} </div>) }

            {submittedBooking && (
            <div ref={bookingResultRef}>
                <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950 p-6">
                    <h5 className={formStyles.formH3SemiBold}> {getBookingFormText("bookingSummaryTitle")} </h5>
                    <div className="mt-6">                       
                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryNameLabel")} </span>
                            <span className={formStyles.formP}>{submittedBooking.name}</span>
                        </div>
                        <div className="grid grid-cols-2">
                            <div>
                                <span className={formStyles.formPCyan}> {getBookingFormText("summaryEmailLabel")} </span>
                                <span className={formStyles.formP}> {submittedBooking.email} </span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> {getBookingFormText("summaryPhoneLabel")} </span>
                                <span className={formStyles.formP}> {submittedBooking.phone} </span>
                            </div>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryPickupLabel")} </span>
                            <span className= {formStyles.formP} >{submittedBooking.pickup}</span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryDestinationLabel")} </span>
                            <span className= {formStyles.formP} >{submittedBooking.destination}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2">
                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryDateLabel")} </span>
                            <span className={formStyles.formP}>{formatShortDate(submittedBooking.date)}</span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryTimeLabel")} </span>
                            <span className={formStyles.formP}>{formatShortTime(submittedBooking.time)}</span>
                        </div>

                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryPassengersLabel")} </span>
                            <span className={formStyles.formP}>{submittedBooking.passengers}</span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryLuggageLabel")} </span>
                            <span className={formStyles.formP}>{submittedBooking.luggage}</span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryTripTypeLabel")} </span>
                            <span className={formStyles.formP}> {getTripTypeLabel(submittedBooking.tripType)} </span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryEstimatedDurationLabel")} </span>
                            <span className={formStyles.formP}> {submittedBooking.estimatedDurationMinutes} {getBookingFormText("minutesUnit")} </span>
                        </div>

                        <div>
                            <span className={formStyles.formPCyan}> {getBookingFormText("summaryStatusLabel")} </span>
                            <span className={formStyles.formP}>  {getBookingStatusLabel(submittedBooking.status)}</span>
                        </div>
                        <div className= "mt-1">
                           <span className={formStyles.formPCyan}> {getBookingFormText("summaryHasPetsLabel")} </span>
                            <span  className={ submittedBooking.hasPets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed  } >
                                    {submittedBooking.hasPets ? "✓" : "X"}
                            </span>
                        </div>

                    </div>
                    <div className="mt-8 rounded-2xl border-2 border-white/10 bg-white/5 p-4 sm:mt-12 sm:p-6">
                        <p className={formStyles.formH5MediumSemiBold}> {getBookingFormText("bookingReferenceTitle")} </p>
                        {/* explanation: This is important because booking IDs are long. On mobile, break-all allows the ID to wrap safely instead of pushing the layout wider. */}
                        <p className={`${formStyles.formPYellow} break-all`}> {submittedBooking.id} </p>
                        <p className={formStyles.formP}> {getBookingFormText("bookingReferenceDescription")} </p>
                        {/* explanation: Now the booking ID goes to the status page through the URL. */}
                        <div className= "mt-8">
                            <Link href={`/status?bookingId=${submittedBooking.id}`} className={formStyles.submitSmallButtonUserPage} >
                                {getBookingFormText("checkBookingStatusButton")}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>) }
        </div>
    </section> );
}
