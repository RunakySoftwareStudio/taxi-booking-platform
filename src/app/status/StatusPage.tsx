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
      has_pets:boolean,
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

  type BookingStatusResponse = {message: string; booking?: BookingStatusResult; };
  type StatusPageProps = { initialBookingId?: string;};

export default function StatusPage({ initialBookingId = "" }: StatusPageProps) {

    const [booking, setBooking] = useState<BookingStatusResult | null>(null);
    const safeInitialBookingId = initialBookingId ?? "";
    const [errorMessage, setErrorMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    async function handleStatusSearch(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);
      const statusRequest = {
        bookingId: String(formData.get("bookingId") || "").trim(),
        email: String(formData.get("email") || "").trim().toLowerCase(),
      };

      if (!statusRequest.bookingId || !statusRequest.email) {
        setErrorMessage("Please enter both your booking id and email address.");
        setBooking(null);
        return;
      }

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

            if (!response.ok || !result.booking) {
            setBooking(null);
            setErrorMessage(result.message || "Booking not found.");
            return;
            }
            setBooking(result.booking);
        } 
        catch (error) {
            console.error("Could not find booking:", error);
            setErrorMessage("Booking not found. Please check your booking id and email.");
        } 
        finally { setIsLoading(false);  }
    }

  return (
      <main className={pageStyles.main}>
      <div className={pageStyles.container}> 
          <Link  href="./" className={formStyles.formInfoCell} > ← Back to homepage </Link>
          <p className={`mt-8 ${formStyles.captionUpTracking03Yellow}`}> Booking status </p>
          <h1 className={pageStyles.pageTitle}>Check your taxi booking</h1>
          <p className={pageStyles.pageDescription}> Enter your booking id and email address to view the current status of your trip. </p>
      
          <form onSubmit={handleStatusSearch} className="mt-8 rounded-2xl border-2 border-white/10 bg-white/5 p-4 sm:mt-12 sm:p-6">
              <div className={formStyles.formDivGridCol2}>
                <label className="block">
                  <span className={formStyles.span}> Booking id </span>
                  {/*defaultValue= The browser controls the value after the first load. */}
                  <input name="bookingId"  defaultValue={safeInitialBookingId} required placeholder="Paste your booking id" autoComplete="off"  spellCheck={false}  className={`${formStyles.inputWFullYellow} break-all`}  />

                </label>

                <label className="block">
                  <span className={formStyles.span}> Email address </span>
                  <input name="email" type="email" required placeholder="you@example.com"  autoComplete="email" className={formStyles.inputWFullYellow}  />
                </label>
            </div>

            <button type="submit" disabled={isLoading} className={`mt-8 ${formStyles.submitSmallButtonUserPage}`} >
              {isLoading ? "Searching..." : "Check status"}
            </button>
            {errorMessage && ( <p className={tableStyles.errorCell}> {errorMessage} </p> )}
          </form>

          {booking && (
            <section className={formStyles.form}>
              <h3 className={formStyles.formH5MediumSemiBold}> Booking Status: <span className={formStyles.formPCyan}>{booking.status}</span> </h3>
              <p className={`${formStyles.formPYellow} mt-3 break-all`}> Booking reference: {booking.id} </p>
              <div className="mt-8">  
                  <div>
                      <span className={formStyles.formPCyan}> Name: </span>
                      <span className={formStyles.formP}>{booking.clients?.name}</span>
                  </div>   
                  <div className="grid grid-cols-2">
                      <div>
                          <span className={formStyles.formPCyan}> Email:   </span>
                          <span className={formStyles.formP}> {booking.clients?.email} </span> 
                      </div>
                      <div>
                          <span className={formStyles.formPCyan}> Phone:   </span>
                          <span className={formStyles.formP}> {booking.clients?.phone} </span> 
                      </div>
                  </div>     
                  <div>
                      <span className= {formStyles.formPCyan}>Pickup: </span>
                      <span className= {formStyles.formP} >{booking.pickup_location}</span>
                  </div>        
                  <div>
                      <span className= {formStyles.formPCyan}>Destination: </span>
                      <span className= {formStyles.formP} >{booking.destination}</span>
                  </div>                  
              </div>
              <div className="grid grid-cols-2">
                    <div>
                        <span className={formStyles.formPCyan}> Date:  </span>
                        <span className={formStyles.formP}>{booking.pickup_date}</span>
                    </div>
                    <div>
                        <span className={formStyles.formPCyan}> Time:  </span>
                        <span className={formStyles.formP}>{booking.pickup_time}</span>
                    </div>
                    <div>
                        <span className={formStyles.formPCyan}> Passengers:  </span>
                        <span className={formStyles.formP}>{booking.passengers}</span>
                    </div>
                    <div>
                        <span className={formStyles.formPCyan}> Luggage:  </span>
                        <span className={formStyles.formP}>{booking.luggage}</span>
                    </div>
                    <div>
                        <span className={formStyles.formPCyan}> Trip type:  </span>
                        <span className={formStyles.formP}>{booking.trip_type}</span>
                    </div>
                    <div>
                        <span className={formStyles.formPCyan}> Status:  </span>
                        <span className={formStyles.formP}>{booking.status}</span>
                    </div>
                    <div className= "mt-1">                           
                        <span className={formStyles.formPCyan}> Has pets:  </span>
                        <span  className={ booking.has_pets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed  } >
                                {booking.has_pets ? "✓" : "X"}
                        </span>
                    </div>
              </div>
              {booking.chauffeurs? (
                  <div className={formStyles.formDivCyan}>
                      <h3 className={formStyles.formLabel}> Assigned chauffeur  </h3>
                      <p className={formStyles.formInfoCellCaption}> Name:  {booking.chauffeurs?.name} </p>
                      <p className={formStyles.formInfoCellCaption}> Phone: {booking.chauffeurs?.phone}  </p>
                      <p className={formStyles.formInfoCellCaption}> Email: {booking.chauffeurs?.email}  </p>
                  </div>
                  ) : ( <p className={pageStyles.errorMsg}>  No chauffeur has been assigned yet.  </p> )
              }
            </section>
          )}
        </div>
      </main>
    );
}