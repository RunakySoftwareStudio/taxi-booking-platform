export type BookingEmailData = {
    id: string;
    name: string;
    email: string;
    phone: string;
    pickup: string;
    destination: string;
    date: string;
    time: string;
    passengers: string;
    luggage: string;
    tripType: string;
    status: string;
    hasPets: boolean;
    notes: string;
};

export type EmailContent = {
    subject: string;
    text: string;
    html: string;
};
export type SendEmailInput = {
    to: string;
    subject: string;
    text: string;
    html: string;
};

export type SendEmailResult = {
    success: boolean;
    skipped: boolean;
    message: string;
};

/* ============================================================
   ASSIGNMENT ALERT EMAIL TYPES

   Describes one affected booking and one grouped operational
   alert caused by a chauffeur or vehicle status change.
============================================================ */

/* One booking included in the grouped admin alert email. */
export type AssignmentAlertEmailBooking = {
    bookingId: string;
    pickupLocation: string;
    destination: string;
    pickupDate: string;
    pickupTime: string;
    issueSummary: string;
};

/* Complete data used to create one grouped admin alert email. */
export type AssignmentAlertEmailData = {
    sourceType: "chauffeur" | "vehicle";
    sourceLabel: string;
    operationalStatus: string;
    statusReason: string;
    bookings: AssignmentAlertEmailBooking[];
};