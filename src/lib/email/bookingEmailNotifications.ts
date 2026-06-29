/* ===========================================
    → decides which booking emails must be prepared and sent
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
    const clientEmail = createClientBookingReceivedEmail(inputData);
    const adminEmail = createAdminNewBookingEmail(inputData);

    const clientEmailResult = await sendEmail({
        to: inputData.email,
        subject: clientEmail.subject,
        text: clientEmail.text,
        html: clientEmail.html,
    });

    const adminEmailAddress = process.env.ADMIN_BOOKING_EMAIL;

    if (!adminEmailAddress) {
        return {
            clientEmail: clientEmailResult,
            adminEmail: {
                success: true,
                skipped: true,
                message: "ADMIN_BOOKING_EMAIL is not configured yet.",
            },
        };
    }

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