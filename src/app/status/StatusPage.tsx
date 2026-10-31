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
import { type FormEvent, useState, useEffect } from "react";
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
    /* Exact pickup timestamp, including timezone information. */
    pickup_at: string | null;
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
    
    // getBookingStatusLabel converts the database booking status into readable page text.
    // Example: "assigned" becomes "Assigned" or "Chauffeur toegewezen".
    function getBookingStatusLabel(statusValue: string) {
      if (statusValue === "pending") { return getStatusPageText("statusPending"); }
      if (statusValue === "approved") { return getStatusPageText("statusApproved"); }
      if (statusValue === "assigned") { return getStatusPageText("statusAssigned"); }
      if (statusValue === "completed") { return getStatusPageText("statusCompleted"); }
      if (statusValue === "cancelled") { return getStatusPageText("statusCancelled"); }

      return statusValue;
    }

    // getTripTypeLabel converts the database trip type into readable page text.
    // Example: "one_way" becomes "One-way trip" or "Enkele rit".
    function getTripTypeLabel(tripTypeValue: string) {
      if (tripTypeValue === "one_way") { return getStatusPageText("tripTypeOneWay"); }
      if (tripTypeValue === "return") { return getStatusPageText("tripTypeReturn"); }

      return tripTypeValue;
    }

    const [booking, setBooking] = useState<BookingStatusResult | null>(null);
    /* Controls whether the cancellation confirmation dialog is visible. */
    const [showCancelDialog, setShowCancelDialog] = useState(false);

    /* Stores the optional cancellation reason entered by the client. */
    const [cancellationReason, setCancellationReason] = useState("");

    /* Tracks cancellation requests to prevent repeated submissions. */
    const [isCancelling, setIsCancelling] = useState(false);

    const safeInitialBookingId = initialBookingId ?? "";
    const [errorMessage, setErrorMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);

   /* Update the current timestamp outside React's rendering process. */
    const [currentTime, setCurrentTime] = useState<number | null>(null);

    useEffect(() => {
        const updateTime = () => setCurrentTime(Date.now());
        const timerId = window.setInterval(updateTime, 60_000);
        return () => window.clearInterval(timerId);
    }, []);

    /* Determine whether client cancellation is allowed by booking status and pickup time. */
    const canCancelBooking = (() => {
        if (!booking || isLoading || !booking.pickup_at || currentTime === null) return false;

        const allowedStatuses = ["pending", "assigned"];
        if (!allowedStatuses.includes(booking.status)) return false;

        const pickupTimestamp = new Date(booking.pickup_at).getTime();
        if (!Number.isFinite(pickupTimestamp)) return false;

        const hoursUntilPickup = (pickupTimestamp - currentTime) / (1000 * 60 * 60);

        return hoursUntilPickup > 24;
    })();

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
        /* Update the cancellation clock immediately after loading the booking. */
        setCurrentTime(Date.now());
      } 
      catch (error) {
          console.error("Could not find booking:", error);
          setErrorMessage(getStatusPageText("bookingNotFound"));
      } 
      finally { setIsLoading(false); }
    }

    /* ============================================================
    CLIENT BOOKING CANCELLATION

    Sends the booking ID, registered email and optional reason
    to the cancellation API. Updates the displayed booking only
    after the server confirms successful cancellation.
  ============================================================ */
  async function handleConfirmCancellation() {
      if (!booking || !canCancelBooking || isCancelling) return;

      setIsCancelling(true);
      setErrorMessage("");

      try {
          const response = await fetch("/api/bookings/cancel", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  bookingId: booking.id,
                  email: booking.clients?.email,
                  reason: cancellationReason.trim(),
              }),
          });

          const result = await response.json();

          if (!response.ok) {
              setErrorMessage(result.message || "Booking cancellation failed.");
              return;
          }

          /* Update the page after the database confirms cancellation. */
          setBooking((previousBooking) =>
              previousBooking
                  ? { ...previousBooking, status: "cancelled", chauffeurs: null }
                  : null
          );

          setShowCancelDialog(false);
          setCancellationReason("");

      } catch (error) {
          console.error("Client booking cancellation error:", error);
          setErrorMessage("Unable to cancel the booking. Please try again.");
      } finally {
          setIsCancelling(false);
      }
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

            <div className="mt-8 flex flex-wrap items-end gap-4">
                {/* Check the booking status using the existing form. */}
                <button className={formStyles.submitSmallButtonUserPage}>
                    {isLoading ? getStatusPageText("searchingButton") : getStatusPageText("checkStatusButton")}
                </button>
            </div>

            {errorMessage && ( <p className={tableStyles.errorCell}> {errorMessage} </p> )}
          </form>

          {booking && (
            <section className={formStyles.form}>
              <h3 className={formStyles.formH5MediumSemiBold}> {getStatusPageText("bookingStatusTitle")} <span className={formStyles.formPCyan}>{getBookingStatusLabel(booking.status)}</span> </h3>

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
                        <span className={formStyles.formP}>{getTripTypeLabel(booking.trip_type)}</span>
                    </div>
                    <div>
                        <span className={formStyles.formPCyan}> {getStatusPageText("statusLabel")} </span>
                        <span className={formStyles.formP}>{getBookingStatusLabel(booking.status)}</span>
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

              {/* Allow cancellation only when the booking meets eligibility rules. */}
              <div className="mt-8 flex justify-end">
                  <button type="button" disabled={!canCancelBooking} onClick={() => {setCancellationReason(""); setShowCancelDialog(true);}}
                      className={`rounded-lg border px-5 py-2 text-sm font-medium transition-colors ${
                          !canCancelBooking
                              ? "cursor-not-allowed border-gray-500 text-gray-400 opacity-50"
                              : "cursor-pointer border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black"
                      }`}
                  >
                      Cancel Booking
                  </button>
              </div>
            </section>
          )}
          {/* Cancellation confirmation dialog. No cancellation is executed yet. */}
          {showCancelDialog && booking && (
              <div className="mt-6 rounded-xl border border-gray-600 bg-gray-900/40 p-4">
                  <div
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="cancel-booking-title"
                      className="w-full p-6 text-white"
                  >
                      <h3 id="cancel-booking-title" className="text-xl font-semibold">
                          Cancel Booking
                      </h3>

                      <p className="mt-4 text-sm text-gray-300">
                          Are you sure you want to cancel this booking?
                      </p>

                      <p className="mt-3 break-all text-sm text-gray-400">
                          Booking reference: {booking.id}
                      </p>

                      {/* The cancellation reason is optional for clients. */}
                      <label htmlFor="cancellationReason" className="mt-6 block text-sm font-medium">
                          Cancellation reason (optional)
                      </label>

                      <textarea
                          id="cancellationReason"
                          value={cancellationReason}
                          onChange={(event) => setCancellationReason(event.target.value)}
                          rows={3}
                          maxLength={1000}
                          placeholder="Enter your reason..."
                          className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-800 p-3 text-sm text-white"
                      />

                      <div className="mt-6 flex flex-wrap justify-end gap-3">
                          <button
                              type="button"
                              onClick={() => setShowCancelDialog(false)}
                              className="rounded-lg border border-gray-500 px-4 py-2 text-sm hover:bg-gray-800"
                          >
                              Keep Booking
                          </button>

                          {/* Submit the cancellation request and prevent duplicate clicks. */}
                          <button
                              type="button"
                              onClick={handleConfirmCancellation}
                              disabled={isCancelling || !canCancelBooking}
                              className={`rounded-lg bg-red-700 px-4 py-2 text-sm text-white transition-colors ${
                                  isCancelling || !canCancelBooking
                                      ? "cursor-not-allowed opacity-50"
                                      : "cursor-pointer hover:bg-red-600"
                              }`}
                          >
                              {isCancelling ? "Cancelling..." : "Confirm Cancellation"}
                          </button>
                      </div>
                  </div>
              </div>
          )}
        </div>
      </main>
    );
}