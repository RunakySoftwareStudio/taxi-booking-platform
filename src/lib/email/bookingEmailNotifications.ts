/* ===========================================
    decides which booking emails must be prepared and sent
    This file is the manager/coordinator for booking emails.
    It does not create the email text itself.
    It does not send the email directly itself.

    When a new booking is created, later we can call:
        await sendBookingCreatedEmails(bookingEmailData);
    Then bookingEmailNotifications.ts will prepare:
        1. Email to client:  "Your booking request was received"
        2. Email to admin:   "New booking request received"
    Then it sends both through:
        sendEmail(...)
    Right now sendEmail(...) is still a safe placeholder, so no real email is sent yet.

    Short description for the 3 new files
        emailTypes.ts→  Defines TypeScript types for booking email data and email sending results.
        emailTemplates.ts→  Creates the subject, text, and HTML content for booking emails.
        bookingEmailNotifications.ts→  Coordinates which booking emails should be sent after a booking is created.
        And later:
            emailSender.ts →  Will contain the real email provider code, for example Resend.
            For now, it is only a safe placeholder.
==================================================*/
import { createAdminNewBookingEmail, createClientBookingReceivedEmail } from "./emailTemplates";
import { type BookingEmailData, type SendEmailResult } from "./emailTypes";
import { sendEmail } from "./emailSender";

type BookingEmailNotificationResult = {
    clientEmail: SendEmailResult;
    adminEmail: SendEmailResult;
};

export async function sendBookingCreatedEmails(
    inputData: BookingEmailData
): Promise<BookingEmailNotificationResult> {
    const adminEmailAddress = process.env.ADMIN_BOOKING_EMAIL;

    if (!adminEmailAddress) {
        return {
            clientEmail: {
                success: true,
                skipped: true,
                message: "ADMIN_BOOKING_EMAIL is not configured. Client preview email was not sent.",
            },
            adminEmail: {
                success: true,
                skipped: true,
                message: "ADMIN_BOOKING_EMAIL is not configured. Admin email was not sent.",
            },
        };
    }

    const clientEmail = createClientBookingReceivedEmail(inputData);
    const adminEmail = createAdminNewBookingEmail(inputData);

    // Temporary development setup:
    // Resend blocks real customer emails until a sender domain is verified.
    // So for now, we send the client email layout as a preview to the admin address.
    const clientEmailResult = await sendEmail({
        to: adminEmailAddress,
        subject: `[Client preview] ${clientEmail.subject}`,
        text: clientEmail.text,
        html: clientEmail.html,
    });

    const adminEmailResult = await sendEmail({
        to: adminEmailAddress,
        subject: adminEmail.subject,
        text: adminEmail.text,
        html: adminEmail.html,
    });

    return {
        clientEmail: clientEmailResult,
        adminEmail: adminEmailResult,
    };
}