"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type BookingRequest } from "@/types/bookingType";
import { type BookingSummary } from "@/types/bookingSummaryType";
import { tripTypes } from "@/data/tripTypeData";
import { formStyles, tableStyles } from "@/styles/classNames";

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
    const [errorMessage, setErrorMessage] = useState("");
    const todayDate = getTodayDateInputValue();
    const bookingResultRef = useRef<HTMLDivElement | null>(null);
    
    //When submittedBooking changes from null to a real booking,scroll smoothly to the result area.
    useEffect(() => {
        if (submittedBooking) { bookingResultRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
            });
        }
    }, [submittedBooking]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) 
    {
        event.preventDefault();                 // Normally, when you submit a form, the browser refreshes the page.
                                                // So instead of refreshing the page, React/Next.js can handle the form submission with JavaScript.
                                                // Without this line, the page may reload and you may lose the form data.

        const form = event.currentTarget;       // This line gets the form that was submitted:
                                                // So form is now the actual HTML form element.
                                                // <form onSubmit={handleSubmit}> When this form is submitted, event.currentTarget means: this form
                                                // So now we can read all input values from that form.

        const formData = new FormData(form);    // This creates a FormData object from the form:
                                                // FormData collects all values from inputs that have a name.
                                                // <input name="pickup" /> Then FormData can find them by name:formData.get("pickup")
                                                // Important: the word inside get() must match the input name.

        const bookingRequest: BookingRequest =  // This creates an object called bookingRequest.
                                                // This object will contain the data we want to send to the API/database.
        {
            pickup: String(formData.get("pickup") || ""), // Get the value from the input with name="pickup". If it is empty or missing, use "".  Convert the result to a string.
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
        };

        setErrorMessage("");
        try 
        {
            const response = await fetch
                ("/api/bookings", 
                    {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify(bookingRequest),
                    }
                );

            if (!response.ok) {throw new Error("Booking request failed"); }

            //const result = await response.json();
            const result = (await response.json()) as {
                message: string;
                booking: BookingSummary;
                };

            //console.log("API response:", result);

            setSubmittedBooking(result.booking);
            setSubmitted(true);
            form.reset();
        } 
        catch (error) 
        { 
            console.error("Could not submit booking:", error);
            setErrorMessage("Something went wrong. Please try again.");
        }
    }
    
  return (
    <section id="booking" className="bg-slate-900 px-6 py-24 text-white">
        <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400"> Booking </p>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl"> Request your taxi trip </h2>
                <p className="mt-4 text-slate-300"> Enter your trip details and the platform will help connect you with an available chauffeur. </p>
            </div>
             
            <form onSubmit={handleSubmit} className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="grid gap-6 md:grid-cols-2">
                    <div>
                        <label htmlFor="pickup" className="mb-2 block text-sm font-medium"> Pickup location </label>
                        <input id="pickup" name="pickup" type="text" required placeholder="Amsterdam Central Station"  
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400" />
                    </div>

                    <div>
                        <label htmlFor="destination" className="mb-2 block text-sm font-medium" > Destination </label>
                        <input id="destination" name="destination" type="text" required placeholder="Schiphol Airport"  
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400" />
                    </div>

                    <div>
                        <label htmlFor="date" className="mb-2 block text-sm font-medium"> Date </label>
                        <input id="date" name="date" type="date" min={todayDate} max="2099-12-31" required 
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-yellow-400" />
                    </div>

                    <div>
                        <label htmlFor="time" className="mb-2 block text-sm font-medium"> Time </label>
                        <input id="time" name="time" type="time" required 
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-yellow-400" />
                    </div>

                    <div>
                        <label htmlFor="passengers"  className="mb-2 block text-sm font-medium"> Passengers </label>
                        <input id="passengers" name="passengers" type="number" min="1" required placeholder="2" 
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400" />
                    </div>

                    <div>
                        <label htmlFor="luggage" className="mb-2 block text-sm font-medium"> Luggage </label>
                        <input id="luggage" name="luggage" type="number"  min="0" placeholder="1" 
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"/>
                    </div>

                    <div>
                    <label htmlFor="name" className="mb-2 block text-sm font-medium"> Your name</label>
                    <input id="name" name="name" type="text" required placeholder="Your full name"
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"
                    />
                    </div>

                    <div>
                        <label htmlFor="phone" className="mb-2 block text-sm font-medium"> Phone number </label>
                        <input id="phone" name="phone" type="tel" required inputMode="tel" pattern="\+?[0-9 ]{7,20}" title="Please enter a valid phone number. Use numbers, +, spaces, or - only." placeholder="+31 6 12345678"
                            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"/>
                    </div>

                    <div>
                        <label htmlFor="email" className="mb-2 block text-sm font-medium"> Email address </label>
                        <input id="email" name="email" type="email" required placeholder="client@example.com"
                            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"/>
                    </div>

                    <div>
                        <label htmlFor="tripType" className="mb-2 block text-sm font-medium"> Trip type </label>
                        <select id="tripType" name="tripType" required
                            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-yellow-400" >
                                <option value=""> Select trip type </option>  {/* <option value="one-way">One-way trip</option> */}
                                {tripTypes.map((tripType) => ( <option key={tripType.value} value={tripType.value}> {tripType.label} </option>))}
                        </select>
                    </div>

                </div>

                <div className="md:col-span-2">
                    <label htmlFor="notes" className="mb-2 block text-sm font-medium"> Extra notes </label>
                    <textarea id="notes" name="notes"  rows={4} placeholder="Flight number, child seat request, exact pickup point, or other information..."
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"/>
                </div>

                <button type="submit" className="mt-8 rounded-full bg-yellow-400 px-8 py-4 font-semibold text-slate-950 transition hover:bg-yellow-300">
                    Send booking request
                </button>
            </form>

            {errorMessage && ( <p className={tableStyles.errorCell}> {errorMessage} </p> )}
            {submitted && (
                <div className={formStyles.formSuccessMsg}>
                    Your booking request has been received. We will connect you with an available chauffeur.
                </div>)
            }

            {submittedBooking && (
                <div ref={bookingResultRef}>
                    <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950 p-6">
                        <h3 className={formStyles.formH3SemiBold}> Booking summary </h3>                   
                        <div className={formStyles.formDivCyan}>
                            <p className={formStyles.formLabel}> Your booking reference </p>
                            <p className={formStyles.formP}> {submittedBooking.id} </p>
                            <p className={formStyles.formP}> Save this booking reference. You can use it later together with your email address to check your booking status. </p>
                                                        {/* explanation: Now the booking ID goes to the status page through the URL. */}
                            <Link href={`/status?bookingId=${submittedBooking.id}`} className={formStyles.linkHref} > 
                                Check booking status
                            </Link>

                        </div>
                        <div className={formStyles.formDivGridCol2}>
                            <p> <span className={formStyles.formInfoCellCaption}>Pickup:</span>{" "} {submittedBooking.pickup} </p>
                            <p> <span className={formStyles.formInfoCellCaption}>Destination:</span>{" "} {submittedBooking.destination} </p>
                            <p> <span className={formStyles.formInfoCellCaption}>Date:</span>{" "} {submittedBooking.date} </p>
                            <p> <span className={formStyles.formInfoCellCaption}>Time:</span>{" "} {submittedBooking.time} </p>
                            <p><span className={formStyles.formInfoCellCaption}>Passengers:</span>{" "}{submittedBooking.passengers} </p>
                            <p> <span className={formStyles.formInfoCellCaption}>Trip type:</span>{" "}{submittedBooking.tripType} </p>
                            <p> <span className={formStyles.formInfoCellCaption}>Client:</span>{" "} {submittedBooking.name} </p>
                            <p> <span className={formStyles.formInfoCellCaption}>Status:</span>{" "} {submittedBooking.status} </p>
                        </div>
                    </div>
                </div>)
            }
        </div>
    </section>
  );
}