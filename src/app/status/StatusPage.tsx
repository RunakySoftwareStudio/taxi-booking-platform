"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

  type BookingStatusResult = {
      id: string;
      pickup_location: string;
      destination: string;
      pickup_date: string;
      pickup_time: string;
      passengers: number;
      luggage: number | null;
      trip_type: string;
      notes: string | null;
      status: string;
      clients: {
        name: string;
        email: string;
        phone: string;
      } | null;
      chauffeurs: {
        name: string;
        phone: string;
        availability: string;
      } | null;
  };

  type BookingStatusResponse = {
      message: string;
      booking?: BookingStatusResult;
  };

export default function StatusPage() {
    const [booking, setBooking] = useState<BookingStatusResult | null>(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    async function handleStatusSearch(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);

      const statusRequest = {
        bookingId: String(formData.get("bookingId") || ""),
        email: String(formData.get("email") || ""),
      };

      setIsLoading(true);
      setErrorMessage("");
      setBooking(null);

      try {
          const response = await fetch("/api/bookings/status", {
              method: "POST",
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify(statusRequest)
          });

          const result = (await response.json()) as BookingStatusResponse;

          if (!response.ok || !result.booking) { throw new Error(result.message); }

          setBooking(result.booking);
      } 
      catch (error) {
          console.error("Could not find booking:", error);
          setErrorMessage("Booking not found. Please check your booking id and email.");
      } 
      finally {
          setIsLoading(false);
      }
    }

  return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
        <div className="mx-auto max-w-4xl">
          <Link href="/" className="text-sm text-cyan-300 hover:text-cyan-200"> ← Back to homepage </Link>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> Booking status </p>
          <h1 className="mt-3 text-3xl font-bold">  Check your taxi booking </h1>
          <p className="mt-4 max-w-2xl text-slate-300">Enter your booking id and email address to view the current status of your trip. </p>

          <form onSubmit={handleStatusSearch} className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6" >
            <div className="grid gap-6 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-200"> Booking id </span>
                <input name="bookingId" required placeholder="Paste your booking id" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-300" />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200"> Email address </span>
                <input name="email" type="email" required placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-300" />
              </label>
            </div>

            <button className="mt-6 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60" >
              {isLoading ? "Searching..." : "Check status"}
            </button>
            {errorMessage && ( <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"> {errorMessage} </p> )}
          </form>

          {booking && (
            <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-2xl font-semibold text-white"> Booking found </h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <p className="text-slate-300">
                    <span className="block text-sm text-slate-400">Status</span>
                    <span className="mt-1 inline-block rounded-full bg-cyan-400/10 px-3 py-1 text-sm font-medium text-cyan-200"> {booking.status} </span>
                  </p>
                  <p className="text-slate-300"> <span className="block text-sm text-slate-400">Client</span> {booking.clients?.name} </p>
                  <p className="text-slate-300"> <span className="block text-sm text-slate-400">Pickup</span> {booking.pickup_location} </p>
                  <p className="text-slate-300">  <span className="block text-sm text-slate-400">Destination</span> {booking.destination} </p>
                  <p className="text-slate-300"> <span className="block text-sm text-slate-400">Date</span> {booking.pickup_date} </p>
                  <p className="text-slate-300"> <span className="block text-sm text-slate-400">Time</span> {booking.pickup_time} </p>
                  <p className="text-slate-300"> <span className="block text-sm text-slate-400">Passengers</span> {booking.passengers} </p>
                  <p className="text-slate-300"> <span className="block text-sm text-slate-400">Trip type</span>  {booking.trip_type}  </p>
              </div>

              {booking.chauffeurs ? (
                  <div className="mt-6 rounded-xl border border-white/10 bg-slate-950 p-4">
                      <h3 className="font-semibold text-white"> Assigned chauffeur  </h3>
                      <p className="mt-2 text-sm text-slate-300">   {booking.chauffeurs.name} </p>
                      <p className="text-sm text-slate-400"> Phone: {booking.chauffeurs.phone}  </p>
                      <p className="text-sm text-slate-400"> Availability: {booking.chauffeurs.availability} </p>
                  </div>
                  ) : ( <p className="mt-6 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">  No chauffeur has been assigned yet.  </p> )
              }
            </section>
          )}
        </div>
      </main>
    );
}