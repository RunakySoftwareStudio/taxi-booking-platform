//→ creates email content
//Creates the subject, plain text, and HTML content for booking emails.
import { type BookingEmailData, type EmailContent } from "./emailTypes";

function escapeHtml(inputValue: string) {
    return inputValue
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatPetsText(hasPets: boolean) {
    return hasPets ? "Yes" : "No";
}

function formatBookingTime(timeValue: string) {
    if (!timeValue) {
        return "";
    }

    return timeValue.slice(0, 5);
}

function formatTripType(tripType: string) {
    const tripTypeLabels: Record<string, string> = {
        "one-way": "One-way trip",
        return: "Return trip",
        airport: "Airport transfer",
        business: "Business trip",
    };

    return tripTypeLabels[tripType] || tripType;
}

function createBookingStatusUrl(bookingId: string) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    if (!siteUrl) {
        return "";
    }

    const cleanSiteUrl = siteUrl.replace(/\/$/, "");

    return `${cleanSiteUrl}/status?bookingId=${encodeURIComponent(bookingId)}`;
}

export function createClientBookingReceivedEmail(inputData: BookingEmailData): EmailContent {
    const subject = "Your Voya Taxi booking request was received";
    const bookingStatusUrl = createBookingStatusUrl(inputData.id);
    const formattedTime = formatBookingTime(inputData.time);
    const formattedTripType = formatTripType(inputData.tripType);

    const text = `
        Hello ${inputData.name},
        Thank you for your booking request.
        Booking reference: ${inputData.id}
        Trip details:
        Pickup: ${inputData.pickup}
        Destination: ${inputData.destination}
        Date: ${inputData.date}
        Time: ${formattedTime}
        Passengers: ${inputData.passengers}
        Luggage: ${inputData.luggage}
        Trip type: ${formattedTripType}
        Pets: ${formatPetsText(inputData.hasPets)}
        Status: ${inputData.status}
        ${bookingStatusUrl ? `Check your booking status here:\n${bookingStatusUrl}` : "You can check your booking status on the Voya Taxi website."}
        We will connect you with an available chauffeur.
        Voya Taxi
        Where the journey begins
    `.trim();

    const html = `
            <h2>Your Voya Taxi booking request was received</h2>
            <p>Hello ${escapeHtml(inputData.name)},</p>
            <p>Thank you for your booking request.</p>
            <h3>Booking reference</h3>
            <p><strong>${escapeHtml(inputData.id)}</strong></p>
            <h3>Trip details</h3>
            <ul>
                <li><strong>Pickup:</strong> ${escapeHtml(inputData.pickup)}</li>
                <li><strong>Destination:</strong> ${escapeHtml(inputData.destination)}</li>
                <li><strong>Date:</strong> ${escapeHtml(inputData.date)}</li>
                <li><strong>Time:</strong> ${escapeHtml(formattedTime)}</li>
                <li><strong>Passengers:</strong> ${escapeHtml(inputData.passengers)}</li>
                <li><strong>Luggage:</strong> ${escapeHtml(inputData.luggage)}</li>
                <li><strong>Trip type:</strong> ${escapeHtml(formattedTripType)}</li>
                <li><strong>Pets:</strong> ${formatPetsText(inputData.hasPets)}</li>
                <li><strong>Status:</strong> ${escapeHtml(inputData.status)}</li>
            </ul>

            ${
                bookingStatusUrl
                    ? `<p> <a href="${escapeHtml(bookingStatusUrl)}">Check your booking status</a></p>`
                    : "<p>You can check your booking status on the Voya Taxi website.</p>"
            }

            <p>We will connect you with an available chauffeur.</p>
            <p> Voya Taxi<br />  Where the journey begins</p>
    `.trim();
    
    return {subject, text,  html, };
}

export function createAdminNewBookingEmail(inputData: BookingEmailData): EmailContent {
    const subject = "New Voya Taxi booking request";
    const formattedTime = formatBookingTime(inputData.time);
    const formattedTripType = formatTripType(inputData.tripType);
    const text = `New booking request received.
        Booking reference:${inputData.id}
        Client:
        Name: ${inputData.name}
        Email: ${inputData.email}
        Phone: ${inputData.phone}
        
        Trip details:
        Pickup: ${inputData.pickup}
        Destination: ${inputData.destination}
        Date: ${inputData.date}
        Time: ${formattedTime}
        Passengers: ${inputData.passengers}
        Luggage: ${inputData.luggage}
        Trip type: ${formattedTripType}
        Pets: ${formatPetsText(inputData.hasPets)}
        Status: ${inputData.status}
        Notes:  ${inputData.notes || "No notes"}
    `.trim();

    const html = `<h2>New Voya Taxi booking request</h2>
        <h3>Booking reference</h3>
        <p><strong>${escapeHtml(inputData.id)}</strong></p>
        <h3>Client</h3>
        <ul>
            <li><strong>Name:</strong> ${escapeHtml(inputData.name)}</li>
            <li><strong>Email:</strong> ${escapeHtml(inputData.email)}</li>
            <li><strong>Phone:</strong> ${escapeHtml(inputData.phone)}</li>
        </ul>
        <h3>Trip details</h3>
        <ul>
            <li><strong>Pickup:</strong> ${escapeHtml(inputData.pickup)}</li>
            <li><strong>Destination:</strong> ${escapeHtml(inputData.destination)}</li>
            <li><strong>Date:</strong> ${escapeHtml(inputData.date)}</li>
            <li><strong>Time:</strong> ${escapeHtml(formattedTime)}</li>
            <li><strong>Passengers:</strong> ${escapeHtml(inputData.passengers)}</li>
            <li><strong>Luggage:</strong> ${escapeHtml(inputData.luggage)}</li>
            <li><strong>Trip type:</strong> ${escapeHtml(formattedTripType)}</li>
            <li><strong>Pets:</strong> ${formatPetsText(inputData.hasPets)}</li>
            <li><strong>Status:</strong> ${escapeHtml(inputData.status)}</li>
        </ul>
        <h3>Notes</h3>
        <p>${escapeHtml(inputData.notes || "No notes")}</p>
    `.trim();

    return {subject, text,  html, };
}