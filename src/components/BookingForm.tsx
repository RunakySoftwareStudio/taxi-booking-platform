"use client";

import { type FormEvent, useState } from "react";

export default function BookingForm() 
{
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);


    const bookingRequest = {
    pickup: formData.get("pickup"),
    destination: formData.get("destination"),
    date: formData.get("date"),
    time: formData.get("time"),
    passengers: formData.get("passengers"),
    luggage: formData.get("luggage"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    tripType: formData.get("tripType"),
    notes: formData.get("notes"),
    };
    console.log("Booking request:", bookingRequest);

    setSubmitted(true);
    event.currentTarget.reset();
}

  return (
    <section id="booking" className="bg-slate-900 px-6 py-24 text-white">
        <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400">
                Booking
            </p>

            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Request your taxi trip
            </h2>

            <p className="mt-4 text-slate-300">
                Enter your trip details and the platform will help connect you with
                an available chauffeur.
            </p>
            </div>

            {submitted && (
            <div className="mt-8 rounded-2xl border border-green-400/30 bg-green-400/10 p-4 text-green-200">
                Your booking request has been received. We will connect you with an
                available chauffeur.
            </div>
            )}

            <form
            onSubmit={handleSubmit}
            className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6"
            >
                <div className="grid gap-6 md:grid-cols-2">
                    <div>
                    <label htmlFor="pickup" className="mb-2 block text-sm font-medium">
                        Pickup location
                    </label>
                    <input
                        id="pickup"
                        name="pickup"
                        type="text"
                        required
                        placeholder="Amsterdam Central Station"
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"
                    />
                    </div>

                    <div>
                    <label
                        htmlFor="destination"
                        className="mb-2 block text-sm font-medium"
                    >
                        Destination
                    </label>
                    <input
                        id="destination"
                        name="destination"
                        type="text"
                        required
                        placeholder="Schiphol Airport"
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"
                    />
                    </div>

                    <div>
                    <label htmlFor="date" className="mb-2 block text-sm font-medium">
                        Date
                    </label>
                    <input
                        id="date"
                        name="date"
                        type="date"
                        min="2026-01-01"
                        max="2099-12-31"
                        required
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
                    />
                    </div>

                    <div>
                    <label htmlFor="time" className="mb-2 block text-sm font-medium">
                        Time
                    </label>
                    <input
                        id="time"
                        name="time"
                        type="time"
                        required
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
                    />
                    </div>

                    <div>
                    <label
                        htmlFor="passengers"
                        className="mb-2 block text-sm font-medium"
                    >
                        Passengers
                    </label>
                    <input
                        id="passengers"
                        name="passengers"
                        type="number"
                        min="1"
                        required
                        placeholder="2"
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"
                    />
                    </div>

                    <div>
                    <label htmlFor="luggage" className="mb-2 block text-sm font-medium">
                        Luggage
                    </label>
                    <input
                        id="luggage"
                        name="luggage"
                        type="number"
                        min="0"
                        placeholder="1"
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"
                    />
                    </div>

                    <div>
                    <label htmlFor="name" className="mb-2 block text-sm font-medium">
                        Your name
                    </label>
                    <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        placeholder="Your full name"
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"
                    />
                    </div>

                    <div>
                    <label htmlFor="phone" className="mb-2 block text-sm font-medium">
                        Phone number
                    </label>
                    <input
                        id="phone"
                        name="phone"
                        type="tel"
                        
                        required
                        inputMode="tel"
                        pattern="\+?[0-9 ]{7,20}"
                        title="Please enter a valid phone number. Use numbers, +, spaces, or - only."
                        placeholder="+31 6 12345678"
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"
                    />
                    </div>

                    <div>
                        <label htmlFor="email" className="mb-2 block text-sm font-medium">
                            Email address
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            placeholder="client@example.com"
                            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"
                        />
                    </div>

                    <div>
                        <label htmlFor="tripType" className="mb-2 block text-sm font-medium">
                            Trip type
                        </label>
                        <select
                            id="tripType"
                            name="tripType"
                            required
                            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
                        >
                            <option value="">Select trip type</option>
                            <option value="one-way">One-way trip</option>
                            <option value="return">Return trip</option>
                            <option value="airport">Airport transfer</option>
                            <option value="business">Business trip</option>
                            <option value="hourly">Hourly chauffeur</option>
                        </select>
                    </div>

                </div>

                <div className="md:col-span-2">
                    <label htmlFor="notes" className="mb-2 block text-sm font-medium">
                        Extra notes
                    </label>
                    <textarea
                        id="notes"
                        name="notes"
                        rows={4}
                        placeholder="Flight number, child seat request, exact pickup point, or other information..."
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-yellow-400"
                    />
                </div>

                <button
                    type="submit"
                    className="mt-8 rounded-full bg-yellow-400 px-8 py-4 font-semibold text-slate-950 transition hover:bg-yellow-300"
                >
                    Send booking request
                </button>
            </form>
        </div>
    </section>
  );
}