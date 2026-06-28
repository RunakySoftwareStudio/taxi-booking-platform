"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { type BookingRequest } from "@/types/bookingType";
import { type BookingSummary } from "@/types/bookingSummaryType";
import { tripTypes } from "@/data/tripTypeData";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";

function getTodayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function BookingForm() {
    const [submitted, setSubmitted] = useState(false);
    const [submittedBooking, setSubmittedBooking] = useState<BookingSummary | null>(null);
    const [bookingDraft, setBookingDraft] = useState<BookingRequest | null>(null);
    const [isReviewing, setIsReviewing] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const todayDate = getTodayDateInputValue();
    const bookingResultRef = useRef<HTMLDivElement | null>(null);
    const [hasPets, setHasPets] = useState(false);

    // When submittedBooking changes from null to a real booking, scroll smoothly to the result area.
    useEffect(() => {
        if (submittedBooking) {
            bookingResultRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }
    }, [submittedBooking]);

    function getTripTypeLabel(tripTypeValue: string) { return tripTypes.find((tripType) => tripType.value === tripTypeValue)?.label || tripTypeValue;  }

    function createBookingRequest(formData: FormData): BookingRequest {
        return {
            pickup: String(formData.get("pickup") || ""),
            destination: String(formData.get("destination") || ""),
            date: String(formData.get("date") || ""),
            time: String(formData.get("time") || ""),
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

        const form = event.currentTarget;
        const formData = new FormData(form);
        const bookingRequest = createBookingRequest(formData);

        setErrorMessage("");
        setSubmitted(false);
        setSubmittedBooking(null);
        setBookingDraft(bookingRequest);
        setIsReviewing(true);
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
        } catch (error) {
            console.error("Could not submit booking:", error);
            setErrorMessage("Something went wrong. Please try again.");
        } finally {
            setIsSending(false);
        }
    }

  return (
    <section id="booking" className="bg-slate-900 px-4 py-16 text-white sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400"> Booking </p>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl"> Request your taxi trip </h2>
                <p className="mt-4 text-slate-300"> Enter your trip details and the platform will help connect you with an available chauffeur. </p>
            </div>

            {isReviewing && bookingDraft ? (
                <div className="mt-8 rounded-2xl border-2 border-cyan-300/40 bg-slate-950 p-4 sm:mt-12 sm:p-6">
                    <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> Review booking </p>
                    <h3 className={formStyles.formH3SemiBold}> Please check your booking details before sending. </h3>

                    <div className="mt-6 space-y-2">
                                                <div>
                        <span className={formStyles.formPCyan}> Name: </span>
                            <span className={formStyles.formP}>{bookingDraft.name}</span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> Phone: </span>
                            <span className={formStyles.formP}>{bookingDraft.phone}</span>
                        </div>
                        <div className="md:col-span-2">
                            <span className={formStyles.formPCyan}> Email: </span>
                            <span className={formStyles.formP}>{bookingDraft.email}</span>
                        </div>
                        <p>
                            <span className={formStyles.formPCyan}> Pickup: </span>
                            <span className={formStyles.formP}>{bookingDraft.pickup}</span>
                        </p>
                        <p>
                            <span className={formStyles.formPCyan}> Destination: </span>
                            <span className={formStyles.formP}>{bookingDraft.destination}</span>
                        </p>
                        <div className="grid gap-2 grid-cols-2">
                            <div>
                                <span className={formStyles.formPCyan}> Date: </span>
                                <span className={formStyles.formP}>{bookingDraft.date}</span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> Time: </span>
                                <span className={formStyles.formP}>{bookingDraft.time}</span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> Passengers: </span>
                                <span className={formStyles.formP}>{bookingDraft.passengers}</span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> Luggage: </span>
                                <span className={formStyles.formP}>{bookingDraft.luggage || "0"}</span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> Trip: </span>
                                <span className={formStyles.formP}>{getTripTypeLabel(bookingDraft.tripType)}</span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> Has pets: </span>
                                <span className={bookingDraft.hasPets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>
                                    {bookingDraft.hasPets ? "✓" : "X"}
                                </span>
                            </div>
                        </div>

                        {bookingDraft.notes && (
                            <div className="md:col-span-2">
                                <span className={formStyles.formPCyan}> Extra notes: </span>
                                <span className={formStyles.formP}>{bookingDraft.notes}</span>
                            </div>
                        )}
                    </div>

                    {errorMessage && ( <p className={tableStyles.errorCell}> {errorMessage} </p> )}

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <button type="button" onClick={handleBackToEdit} className={formStyles.submitSmallButtonUserPage}>
                            Back to edit
                        </button>

                        <button type="button" onClick={handleConfirmBooking} disabled={isSending} className={formStyles.submitSmallButtonUserPage}>
                            {isSending ? "Sending..." : "Confirm booking"}
                        </button>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleReviewBooking} className="mt-8 rounded-2xl border-2 border-white/10 bg-white/5 p-4 sm:mt-12 sm:p-6">
                    <div className="grid gap-5 sm:gap-6 md:grid-cols-2">
                        <div>
                            <label htmlFor="pickup" className="mb-2 block text-sm font-medium"> Pickup location </label>
                            <input id="pickup" name="pickup" type="text" required placeholder="Amsterdam Central Station" defaultValue={bookingDraft?.pickup || ""} className={formStyles.inputUserPage} />
                        </div>

                        <div>
                            <label htmlFor="destination" className="mb-2 block text-sm font-medium" > Destination </label>
                            <input id="destination" name="destination" type="text" required placeholder="Schiphol Airport" defaultValue={bookingDraft?.destination || ""} className={formStyles.inputUserPage} />
                        </div>

                        <div>
                            <label htmlFor="date" className="mb-2 block text-sm font-medium"> Date </label>
                            <input id="date" name="date" type="date" min={todayDate} max="2099-12-31" required defaultValue={bookingDraft?.date || ""} className={formStyles.inputDateUserPage} />
                        </div>

                        <div>
                            <label htmlFor="time" className="mb-2 block text-sm font-medium"> Time </label>
                            <input id="time" name="time" type="time" required defaultValue={bookingDraft?.time || ""} className={formStyles.inputDateUserPage} />
                        </div>

                        <div>
                            <label htmlFor="passengers"  className="mb-2 block text-sm font-medium"> Passengers </label>
                            <input id="passengers" name="passengers" type="number" min="1" required placeholder="2" defaultValue={bookingDraft?.passengers || ""} className={formStyles.inputUserPage} />
                        </div>

                        <div>
                            <label htmlFor="luggage" className="mb-2 block text-sm font-medium"> Luggage </label>
                            <input id="luggage" name="luggage" type="number"  min="0" placeholder="1" defaultValue={bookingDraft?.luggage || ""} className={formStyles.inputUserPage}/>
                        </div>

                        <div>
                            <label htmlFor="name" className="mb-2 block text-sm font-medium"> Your name</label>
                            <input id="name" name="name" type="text" required placeholder="Your full name" defaultValue={bookingDraft?.name || ""} className={formStyles.inputUserPage} />
                        </div>

                        <div>
                            <label htmlFor="phone" className="mb-2 block text-sm font-medium"> Phone number </label>
                            <input id="phone" name="phone" type="tel" required inputMode="tel" pattern="\+?[0-9 ]{7,20}" title="Please enter a valid phone number. Use numbers, +, spaces, or - only." placeholder="+31 6 12345678" defaultValue={bookingDraft?.phone || ""} className={formStyles.inputUserPage}/>
                        </div>

                        <div>
                            <label htmlFor="email" className="mb-2 block text-sm font-medium"> Email address </label>
                            <input id="email" name="email" type="email" required placeholder="client@example.com" defaultValue={bookingDraft?.email || ""} className={formStyles.inputUserPage}/>
                        </div>

                        <div>
                            <label htmlFor="tripType" className="mb-2 block text-sm font-medium"> Trip type </label>
                            <select id="tripType" name="tripType" required defaultValue={bookingDraft?.tripType || ""} className={formStyles.inputDateUserPage} >
                                <option value=""> Select trip type </option>
                                {tripTypes.map((tripType) => ( <option key={tripType.value} value={tripType.value}> {tripType.label} </option>))}
                            </select>
                        </div>

                        <label className="flex items-center gap-3 text-sm text-white">
                            <input type="checkbox" name="has_pets" checked={hasPets} onChange={(event) => setHasPets(event.target.checked)}  className="h-5 w-5" />
                            Has pets
                        </label>
                    </div>

                    <div className="mt-5 sm:mt-6">
                        <label htmlFor="notes" className="mb-2 block text-sm font-medium"> Extra notes </label>
                        <textarea id="notes" name="notes"  rows={4} placeholder="Flight number, child seat request, exact pickup point, or other information..." defaultValue={bookingDraft?.notes || ""} className={formStyles.textarea}/>
                    </div>

                    <button type="submit" className={formStyles.submitSmallButtonUserPage}> Review booking </button>
                </form>
            )}

            {!isReviewing && errorMessage && ( <p className={tableStyles.errorCell}> {errorMessage} </p> )}
            {submitted && (<div className={pageStyles.successMsgPage}> Your booking request has been received. We will connect you with an available chauffeur. </div>) }

            {submittedBooking && (
            <div ref={bookingResultRef}>
                <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950 p-6">
                    <h5 className={formStyles.formH3SemiBold}> Booking summary: </h5>
                    <div className="mt-6">                       
                        <div>
                            <span className={formStyles.formPCyan}> Name:   </span>
                            <span className={formStyles.formP}>{submittedBooking.name}</span>
                        </div>
                        <div className="grid grid-cols-2">
                            <div>
                                <span className={formStyles.formPCyan}> Email:   </span>
                                <span className={formStyles.formP}> {submittedBooking.email} </span>
                            </div>
                            <div>
                                <span className={formStyles.formPCyan}> Phone:   </span>
                                <span className={formStyles.formP}> {submittedBooking.phone} </span>
                            </div>
                        </div>
                        <div>
                            <span className= {formStyles.formPCyan}>Pickup: </span>
                            <span className= {formStyles.formP} >{submittedBooking.pickup}</span>
                        </div>
                        <div>
                            <span className= {formStyles.formPCyan}>Destination: </span>
                            <span className= {formStyles.formP} >{submittedBooking.destination}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2">
                        <div>
                            <span className={formStyles.formPCyan}> Date:  </span>
                            <span className={formStyles.formP}>{submittedBooking.date}</span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> Time:  </span>
                            <span className={formStyles.formP}>{submittedBooking.time}</span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> Passengers:  </span>
                            <span className={formStyles.formP}>{submittedBooking.passengers}</span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> Luggage:  </span>
                            <span className={formStyles.formP}>{submittedBooking.luggage}</span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> Trip type:  </span>
                            <span className={formStyles.formP}>{submittedBooking.tripType}</span>
                        </div>
                        <div>
                            <span className={formStyles.formPCyan}> Status:  </span>
                            <span className={formStyles.formP}>{submittedBooking.status}</span>
                        </div>
                        <div className= "mt-1">
                            <span className={formStyles.formPCyan}> Has pets:  </span>
                                <span  className={ submittedBooking.hasPets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed  } >
                                    {submittedBooking.hasPets ? "✓" : "X"}
                            </span>
                        </div>

                    </div>
                    <div className="mt-8 rounded-2xl border-2 border-white/10 bg-white/5 p-4 sm:mt-12 sm:p-6">
                        <p className={formStyles.formH5MediumSemiBold}> Your booking reference </p>
                        {/* explanation: This is important because booking IDs are long. On mobile, break-all allows the ID to wrap safely instead of pushing the layout wider. */}
                        <p className={`${formStyles.formPYellow} break-all`}> {submittedBooking.id} </p>
                        <p className={formStyles.formP}> Save this booking reference. You can use it later together with your email address to check your booking status. </p>
                        {/* explanation: Now the booking ID goes to the status page through the URL. */}
                        <div className= "mt-8">
                            <Link href={`/status?bookingId=${submittedBooking.id}`} className={formStyles.submitSmallButtonUserPage} >
                                Check booking status
                            </Link>
                        </div>
                    </div>
                </div>
            </div>) }
        </div>
    </section> );
}
