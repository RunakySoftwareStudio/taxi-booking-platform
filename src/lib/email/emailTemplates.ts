//→ creates email content
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

export function createClientBookingReceivedEmail(inputData: BookingEmailData): EmailContent {
    const subject = `Your Voya Taxi booking request was received`;
    const text = `
        Hello ${inputData.name},
        Thank you for your booking request.
        Booking reference: ${inputData.id}
        Trip details:
        Pickup: ${inputData.pickup}
        Destination: ${inputData.destination}
        Date: ${inputData.date}
        Time: ${inputData.time}
        Passengers: ${inputData.passengers}
        Luggage: ${inputData.luggage}
        Trip type: ${inputData.tripType}
        Pets: ${formatPetsText(inputData.hasPets)}
        Status: ${inputData.status}

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
            <li><strong>Time:</strong> ${escapeHtml(inputData.time)}</li>
            <li><strong>Passengers:</strong> ${escapeHtml(inputData.passengers)}</li>
            <li><strong>Luggage:</strong> ${escapeHtml(inputData.luggage)}</li>
            <li><strong>Trip type:</strong> ${escapeHtml(inputData.tripType)}</li>
            <li><strong>Pets:</strong> ${formatPetsText(inputData.hasPets)}</li>
            <li><strong>Status:</strong> ${escapeHtml(inputData.status)}</li>
        </ul>
        <p>We will connect you with an available chauffeur.</p>
        <p>
            Voya Taxi<br />
            Where the journey begins
        </p>
    `.trim();

    return { subject, text, html, };
}

export function createAdminNewBookingEmail(inputData: BookingEmailData): EmailContent {
    const subject = `New Voya Taxi booking request`;
    const text = `
        New booking request received.
        Booking reference:
        ${inputData.id}
            Client:
            Name: ${inputData.name}
            Email: ${inputData.email}
            Phone: ${inputData.phone}

            Trip details:
            Pickup: ${inputData.pickup}
            Destination: ${inputData.destination}
            Date: ${inputData.date}
            Time: ${inputData.time}
            Passengers: ${inputData.passengers}
            Luggage: ${inputData.luggage}
            Trip type: ${inputData.tripType}
            Pets: ${formatPetsText(inputData.hasPets)}
            Status: ${inputData.status}
            Notes:
            ${inputData.notes || "No notes"}
    `.trim();

    const html = `
        <h2>New Voya Taxi booking request</h2>

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
            <li><strong>Time:</strong> ${escapeHtml(inputData.time)}</li>
            <li><strong>Passengers:</strong> ${escapeHtml(inputData.passengers)}</li>
            <li><strong>Luggage:</strong> ${escapeHtml(inputData.luggage)}</li>
            <li><strong>Trip type:</strong> ${escapeHtml(inputData.tripType)}</li>
            <li><strong>Pets:</strong> ${formatPetsText(inputData.hasPets)}</li>
            <li><strong>Status:</strong> ${escapeHtml(inputData.status)}</li>
        </ul>

        <h3>Notes</h3>
        <p>${escapeHtml(inputData.notes || "No notes")}</p>
    `.trim();

    return { subject, text, html, };
}