import type {
    ChauffeurWithdrawalEmailData,
    EmailContent,
} from "./emailTypes";

/*
    CHAUFFEUR WITHDRAWAL EMAIL TEMPLATES

    Creates separate notifications for the administrator
    and withdrawing chauffeur.

    Withdrawal does not cancel the customer's booking.

    These functions only create email content.
    Actual delivery is handled by the notification service.
*/

/*
    Escape dynamic text before inserting it into HTML.
    This prevents customer-provided content from being
    interpreted as HTML markup.
*/
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/*
    ADMIN WITHDRAWAL NOTIFICATION

    Informs Admin that a chauffeur has withdrawn
    and the booking requires reassignment.
*/
export function createAdminChauffeurWithdrawalEmail(
    data: ChauffeurWithdrawalEmailData
): EmailContent {
    const subject = `Voya Taxi - Chauffeur withdrawal - ${data.bookingId}`;

    const text = [
        "A chauffeur has withdrawn from a booking.",
        "",
        `Booking ID: ${data.bookingId}`,
        `Client: ${data.clientName}`,
        `Chauffeur: ${data.chauffeurName}`,
        `Chauffeur email: ${data.chauffeurEmail}`,
        `Pickup: ${data.pickupLocation}`,
        `Destination: ${data.destination}`,
        `Pickup date: ${data.pickupDate}`,
        `Pickup time: ${data.pickupTime}`,
        "",
        "The customer booking remains active.",
        "The booking has returned to the unassigned pool.",
        "A new chauffeur must be assigned.",
    ].join("\n");

    const html = `
        <h2>Voya Taxi - Chauffeur Withdrawal</h2>
        <p>A chauffeur has withdrawn from a booking.</p>

        <p><strong>Booking ID:</strong> ${escapeHtml(data.bookingId)}</p>
        <p><strong>Client:</strong> ${escapeHtml(data.clientName)}</p>
        <p><strong>Chauffeur:</strong> ${escapeHtml(data.chauffeurName)}</p>
        <p><strong>Chauffeur email:</strong> ${escapeHtml(data.chauffeurEmail)}</p>
        <p><strong>Pickup:</strong> ${escapeHtml(data.pickupLocation)}</p>
        <p><strong>Destination:</strong> ${escapeHtml(data.destination)}</p>
        <p><strong>Pickup date:</strong> ${escapeHtml(data.pickupDate)}</p>
        <p><strong>Pickup time:</strong> ${escapeHtml(data.pickupTime)}</p>

        <p>The customer booking remains active.</p>
        <p><strong>Action required:</strong> Assign another chauffeur.</p>
    `;

    return { subject, text, html };
}

/*
    CHAUFFEUR WITHDRAWAL CONFIRMATION

    Confirms that the chauffeur is no longer
    assigned to the booking.
*/
export function createChauffeurWithdrawalConfirmationEmail(
    data: ChauffeurWithdrawalEmailData
): EmailContent {
    const subject = `Voya Taxi - Withdrawal confirmation - ${data.bookingId}`;

    const text = [
        `Hello ${data.chauffeurName},`,
        "",
        "Your withdrawal from the following booking has been confirmed.",
        "",
        `Booking ID: ${data.bookingId}`,
        `Pickup: ${data.pickupLocation}`,
        `Destination: ${data.destination}`,
        `Pickup date: ${data.pickupDate}`,
        `Pickup time: ${data.pickupTime}`,
        "",
        "You are no longer assigned to this booking.",
        "The customer's reservation remains active.",
        "",
        "Voya Taxi",
    ].join("\n");

    const html = `
        <h2>Voya Taxi - Withdrawal Confirmation</h2>
        <p>Hello ${escapeHtml(data.chauffeurName)},</p>

        <p>Your withdrawal from the following booking has been confirmed.</p>

        <p><strong>Booking ID:</strong> ${escapeHtml(data.bookingId)}</p>
        <p><strong>Pickup:</strong> ${escapeHtml(data.pickupLocation)}</p>
        <p><strong>Destination:</strong> ${escapeHtml(data.destination)}</p>
        <p><strong>Pickup date:</strong> ${escapeHtml(data.pickupDate)}</p>
        <p><strong>Pickup time:</strong> ${escapeHtml(data.pickupTime)}</p>

        <p>You are no longer assigned to this booking.</p>
        <p>The customer's reservation remains active.</p>

        <p>Voya Taxi</p>
    `;

    return { subject, text, html };
}