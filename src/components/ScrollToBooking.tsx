/* ============================================================
   SCROLL TO BOOKING

   Finds the visible mobile card or desktop row for a booking
   and scrolls it into view after the page has rendered.
============================================================ */

"use client";

import { useEffect } from "react";

type ScrollToBookingProps = { bookingId: string | null;};

/* Scrolls to the visible element matching the selected booking ID. */
export default function ScrollToBooking({bookingId,}: ScrollToBookingProps) {
  useEffect(() => { 
        if (!bookingId) { return; }

        const bookingElements = document.querySelectorAll<HTMLElement>(`[data-booking-id="${bookingId}"]` );
        /* Finds the card or row that is currently visible on screen. */
        const visibleBooking = Array.from(bookingElements).find((bookingElement) => bookingElement.offsetParent !== null );
        visibleBooking?.scrollIntoView({behavior: "smooth", block: "center", }); 
    }, [bookingId]);

  /* This component only performs scrolling and displays nothing. */
  return null;
}