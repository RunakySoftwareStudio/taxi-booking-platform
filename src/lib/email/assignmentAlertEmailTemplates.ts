/* ============================================================
   GROUPED ASSIGNMENT ALERT EMAIL TEMPLATE

   Creates one admin email containing all bookings affected by
   a chauffeur or vehicle operational-status change.

   This file creates only the email content.
   It does not send the email.
============================================================ */

import {
    type AssignmentAlertEmailData,
    type EmailContent,
} from "./emailTypes";

/* Escapes database values before placing them inside HTML. */
function escapeHtml(inputValue: string) {
    return inputValue
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* Converts values such as on_leave into On leave. */
function formatStatusLabel(statusValue: string) {
    const normalizedStatus = statusValue.replaceAll("_", " ").trim();
    if (!normalizedStatus) {return "Unknown";}

    return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
}

/* Converts a database time such as 09:30:00 into 09:30. */
function formatBookingTime(timeValue: string) {
    return timeValue ? timeValue.slice(0, 5) : "";
}

/* Creates a direct admin link to one affected booking. */
function createAdminBookingUrl(bookingId: string) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {return "";}

    const cleanSiteUrl = siteUrl.replace(/\/$/, "");

    return `${cleanSiteUrl}/admin/bookings?bookingId=${encodeURIComponent(bookingId)}`;
}

/* Creates one grouped email for all affected bookings. */
export function createAdminAssignmentAlertEmail(
    inputData: AssignmentAlertEmailData
): EmailContent {
    const bookingCount = inputData.bookings.length;
    const bookingWord = bookingCount === 1 ? "booking" : "bookings";
    const sourceTypeLabel = inputData.sourceType === "chauffeur" ? "Chauffeur" : "Vehicle";
    const operationalStatus = formatStatusLabel(inputData.operationalStatus);
    const statusReason = inputData.statusReason || "No reason provided";
    const subject = `${bookingCount} ${bookingWord} require reassignment: ${inputData.sourceLabel}`;
    const textBookingList = inputData.bookings
        .map((booking, bookingIndex) => {
            const bookingUrl = createAdminBookingUrl(booking.bookingId);

            return [
                `${bookingIndex + 1}. Booking ${booking.bookingId}`,
                `   Route: ${booking.pickupLocation} → ${booking.destination}`,
                `   Pickup: ${booking.pickupDate} ${formatBookingTime(booking.pickupTime)}`,
                `   Problem: ${booking.issueSummary}`,
                bookingUrl ? `   Review: ${bookingUrl}` : "",
            ]
                .filter(Boolean)
                .join("\n");
        })
        .join("\n\n");

    const text = `
Assignment problem detected.

${sourceTypeLabel}: ${inputData.sourceLabel}
Operational status: ${operationalStatus}
Reason: ${statusReason}

${bookingCount} ${bookingWord} require administrator review:
${textBookingList}

Voya Taxi
Where the journey begins
    `.trim();

    const htmlBookingList = inputData.bookings
        .map((booking) => {
            const bookingUrl = createAdminBookingUrl(booking.bookingId);

            const reviewLink = bookingUrl
                ? `<p><a href="${escapeHtml(bookingUrl)}">Review this booking</a></p>`
                : "";

            return `
                <li style="margin-bottom: 20px;">
                    <p><strong>Booking:</strong> ${escapeHtml(booking.bookingId)}</p>
                    <p><strong>Route:</strong> ${escapeHtml(booking.pickupLocation)} &rarr; ${escapeHtml(booking.destination)}</p>
                    <p><strong>Pickup:</strong> ${escapeHtml(booking.pickupDate)} ${escapeHtml(formatBookingTime(booking.pickupTime))}</p>
                    <p><strong>Problem:</strong> ${escapeHtml(booking.issueSummary)}</p>
                    ${reviewLink}
                </li>
            `;
        })
        .join("");

    const html = `
        <h2>Assignment problem detected</h2>
        <ul>
            <li><strong>${sourceTypeLabel}:</strong> ${escapeHtml(inputData.sourceLabel)}</li>
            <li><strong>Operational status:</strong> ${escapeHtml(operationalStatus)}</li>
            <li><strong>Reason:</strong> ${escapeHtml(statusReason)}</li>
        </ul>
        <h3>${bookingCount} ${bookingWord} require administrator review</h3>
        <ol>${htmlBookingList}</ol>
        <p>Voya Taxi<br />Where the journey begins</p>
    `.trim();

    return { subject, text, html };
}