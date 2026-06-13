"use client";

import { formStyles, tableStyles,pageStyles } from "@/styles/classNames";
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
        email: string;
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
      <main className={pageStyles.main}>
      <div className={pageStyles.container}> 
          <Link  href="./" className={formStyles.link} > ← Back to homepage </Link>
          <p className={pageStyles.pageLabelUpper}> Booking status </p>
          <h1 className={pageStyles.pageTitle}>Check your taxi booking</h1>
          <p className={pageStyles.pageDescription}> Enter your booking id and email address to view the current status of your trip. </p>
      
          <form onSubmit={handleStatusSearch} className={formStyles.form}>
              <div className={formStyles.formDivGridCol3}>
                <label className="block">
                  <span className={formStyles.span}> Booking id </span>
                  <input name="bookingId" required placeholder="Paste your booking id" className={formStyles.inputWFull}/>
                </label>

                <label className="block">
                  <span className={formStyles.span}> Email address </span>
                  <input name="email" type="email" required placeholder="you@example.com" className={formStyles.inputWFull} />
                </label>
            </div>

            <button className={`mt-8 ${formStyles.primaryButtonDP}`}>
              {isLoading ? "Searching..." : "Check status"}
            </button>
            {errorMessage && ( <p className={tableStyles.errorCell}> {errorMessage} </p> )}
          </form>

          {booking && (
            <section className={formStyles.form}>
              <h3 className={formStyles.formH3SemiBold}> Booking found </h3>  
              <div className={formStyles.formDivGridCol2}>
                  <p className={formStyles.formInfoCellCaption}> <span className={formStyles.formInfoCell}>Status</span> {booking.status} </p>
                  <p className={formStyles.formInfoCellCaption}> <span className={formStyles.formInfoCell}>Client</span> {booking.clients?.name} </p>
                  <p className={formStyles.formInfoCellCaption}> <span className={formStyles.formInfoCell}>Client phone</span> {booking.clients?.phone} </p>
                  <p className={formStyles.formInfoCellCaption}> <span className={formStyles.formInfoCell}>Pickup</span> {booking.pickup_location} </p>
                  <p className={formStyles.formInfoCellCaption}> <span className={formStyles.formInfoCell}>Destination</span> {booking.destination} </p>
                  <p className={formStyles.formInfoCellCaption}> <span className={formStyles.formInfoCell}>Date</span> {booking.pickup_date} </p>
                  <p className={formStyles.formInfoCellCaption}> <span className={formStyles.formInfoCell}>Time</span> {booking.pickup_time} </p>
                  <p className={formStyles.formInfoCellCaption}> <span className={formStyles.formInfoCell}>Passengers</span> {booking.passengers} </p>
                  <p className={formStyles.formInfoCellCaption}> <span className={formStyles.formInfoCell}>Trip type</span>  {booking.trip_type}  </p>
              </div>
              {booking.chauffeurs? (
                  <div className={formStyles.formDivCyan}>
                      <h3 className={formStyles.formLabel}> Assigned chauffeur  </h3>
                      <p className={formStyles.formInfoCellCaption}> Name:  {booking.chauffeurs?.name} </p>
                      <p className={formStyles.formInfoCellCaption}> Phone: {booking.chauffeurs?.phone}  </p>
                      <p className={formStyles.formInfoCellCaption}> Email: {booking.chauffeurs?.email}  </p>
                  </div>
                  ) : ( <p className={pageStyles.errorMessage}>  No chauffeur has been assigned yet.  </p> )
              }
            </section>
          )}
        </div>
      </main>
    );
}