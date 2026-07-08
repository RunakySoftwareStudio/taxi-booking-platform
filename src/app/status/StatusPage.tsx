"use client";

/*
  StatusPage lets a client check the status of a booking.

  The client enters:
    - booking ID
    - email address

  In Version 5, the visible page text uses the language system so the page
  can switch between English and Dutch.
*/

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { formStyles, tableStyles, pageStyles } from "@/styles/classNames";
import { getTranslation } from "@/lib/i18n/translations";
import { useLanguage } from "@/components/LanguageProvider";

// BookingStatusResult describes the booking data returned by the status API.
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
    has_pets: boolean;
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

// BookingStatusResponse describes the API response from /api/bookings/status.
type BookingStatusResponse = { message: string; booking?: BookingStatusResult; };

// StatusPageProps receives the optional booking id from the URL.
type StatusPageProps = { initialBookingId?: string;};

export default function StatusPage({ initialBookingId = "" }: StatusPageProps) {
    const { languageCode } = useLanguage();

    // getStatusPageText returns translated text for this status page.
    // This keeps the JSX shorter and easier to read.
    function getStatusPageText(textKey: string) { return getTranslation("bookingStatusPage", textKey, languageCode); }

    const [booking, setBooking] = useState<BookingStatusResult | null>(null);
    const safeInitialBookingId = initialBookingId ?? "";
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

        if (!response.ok || !result.booking) {
            setBooking(null);
            setErrorMessage(getStatusPageText("bookingNotFound"));
            return;        
        }

        setBooking(result.booking);
      } 
      catch (error) {
          console.error("Could not find booking:", error);
          setErrorMessage(getStatusPageText("bookingNotFound"));
      } 
      finally { setIsLoading(false); }
    }

  return (
      <main className={pageStyles.main}>
      <div className={pageStyles.container}> 
          <Link href="/" className={formStyles.formInfoCell}> {getStatusPageText("backToHomepage")} </Link>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400"> {getStatusPageText("label")} </p>
          <h1 className={pageStyles.pageTitle}> {getStatusPageText("title")} </h1>
          <p className={pageStyles.pageDescription}> {getStatusPageText("description")} </p>
      
          <form onSubmit={handleStatusSearch} className="mt-8 rounded-2xl border-2 border-white/10 bg-white/5 p-4 sm:mt-12 sm:p-6">
              <div className={formStyles.formDivGridCol2}>
                <label className="block">
                  <span className={formStyles.span}> {getStatusPageText("bookingIdLabel")} </span>
                  {/* defaultValue means the browser controls the value after the first load. */}
                  <input name="bookingId" defaultValue={safeInitialBookingId} required placeholder={getStatusPageText("bookingIdPlaceholder")} className={`${formStyles.inputWFullYellow} break-all`}/>
                </label>

                <label className="block">
                  <span className={formStyles.span}> {getStatusPageText("emailLabel")} </span>
                  <input name="email" type="email" required placeholder={getStatusPageText("emailPlaceholder")} className={formStyles.inputWFullYellow} />
                </label>
            </div>

            <button className={`mt-8 ${formStyles.submitSmallButtonUserPage}`}>
              {isLoading ? getStatusPageText("searchingButton") : getStatusPageText("checkStatusButton")}
            </button>

            {errorMessage && ( <p className={tableStyles.errorCell}> {errorMessage} </p> )}
          </form>

          {booking && (
            <section className={formStyles.form}>
              <h3 className={formStyles.formH5MediumSemiBold}> {getStatusPageText("bookingStatusTitle")} <span className={formStyles.formPCyan}>{booking.status}</span> </h3>  

              <div className="mt-8">  
                  <div>
                      <span className={formStyles.formPCyan}> {getStatusPageText("nameLabel")} </span>
                      <span className={formStyles.formP}>{booking.clients?.name}</span>
                  </div>   

                  <div className="grid grid-cols-2">
                      <div>
                          <span className={formStyles.formPCyan}> {getStatusPageText("emailSummaryLabel")} </span>
                          <span className={formStyles.formP}> {booking.clients?.email} </span> 
                      </div>
                      <div>
                          <span className={formStyles.formPCyan}> {getStatusPageText("phoneLabel")} </span>
                          <span className={formStyles.formP}> {booking.clients?.phone} </span> 
                      </div>
                  </div>     

                  <div>
                      <span className={formStyles.formPCyan}> {getStatusPageText("pickupLabel")} </span>
                      <span className={formStyles.formP}>{booking.pickup_location}</span>
                  </div>        

                  <div>
                      <span className={formStyles.formPCyan}> {getStatusPageText("destinationLabel")} </span>
                      <span className={formStyles.formP}>{booking.destination}</span>
                  </div>                  
              </div>

              <div className="grid grid-cols-2">
                    <div>
                        <span className={formStyles.formPCyan}> {getStatusPageText("dateLabel")} </span>
                        <span className={formStyles.formP}>{booking.pickup_date}</span>
                    </div>
                    <div>
                        <span className={formStyles.formPCyan}> {getStatusPageText("timeLabel")} </span>
                        <span className={formStyles.formP}>{booking.pickup_time}</span>
                    </div>
                    <div>
                        <span className={formStyles.formPCyan}> {getStatusPageText("passengersLabel")} </span>
                        <span className={formStyles.formP}>{booking.passengers}</span>
                    </div>
                    <div>
                        <span className={formStyles.formPCyan}> {getStatusPageText("luggageLabel")} </span>
                        <span className={formStyles.formP}>{booking.luggage}</span>
                    </div>
                    <div>
                        <span className={formStyles.formPCyan}> {getStatusPageText("tripTypeLabel")} </span>
                        <span className={formStyles.formP}>{booking.trip_type}</span>
                    </div>
                    <div>
                        <span className={formStyles.formPCyan}> {getStatusPageText("statusLabel")} </span>
                        <span className={formStyles.formP}>{booking.status}</span>
                    </div>
                    <div className="mt-1">                           
                        <span className={formStyles.formPCyan}> {getStatusPageText("hasPetsLabel")} </span>
                        <span className={booking.has_pets ? tableStyles.cellCheckBoxTextGreen : tableStyles.cellCheckBoxTextRed}>
                            {booking.has_pets ? "✓" : "X"}
                        </span>
                    </div>
              </div>

              {booking.chauffeurs? (
                  <div className={formStyles.formDivCyan}>
                      <h3 className={formStyles.formLabel}> {getStatusPageText("assignedChauffeurTitle")} </h3>
                      <p className={formStyles.formInfoCellCaption}> {getStatusPageText("nameLabel")} {booking.chauffeurs?.name} </p>
                      <p className={formStyles.formInfoCellCaption}> {getStatusPageText("phoneLabel")} {booking.chauffeurs?.phone} </p>
                      <p className={formStyles.formInfoCellCaption}> {getStatusPageText("emailSummaryLabel")} {booking.chauffeurs?.email} </p>
                  </div>
                  ) : ( <p className={pageStyles.errorMsg}> {getStatusPageText("noChauffeurAssigned")} </p> )
              }
            </section>
          )}
        </div>
      </main>
    );
}