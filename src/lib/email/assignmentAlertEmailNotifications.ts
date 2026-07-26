/* ============================================================
   GROUPED ASSIGNMENT ALERT EMAIL NOTIFICATION

   Prepares and sends one grouped admin email after all affected
   booking alerts have been synchronized.

   It does not create the email content itself.

   Receives grouped alert data
   → creates the email content
   → sends one email to the admin
============================================================ */

import { createAdminAssignmentAlertEmail } from "./assignmentAlertEmailTemplates";
import { sendEmail } from "./emailSender";
import {
    type AssignmentAlertEmailData,
    type SendEmailResult,
} from "./emailTypes";

/* Sends one grouped assignment-alert email to the administrator. */
export async function sendGroupedAssignmentAlertEmail(inputData: AssignmentAlertEmailData): Promise<SendEmailResult> {
    const adminEmailAddress = process.env.ADMIN_BOOKING_EMAIL;

    if (!adminEmailAddress) {
        return {
            success: true,
            skipped: true,
            message: "ADMIN_BOOKING_EMAIL is not configured. Assignment alert email was not sent.",
        };
    }

    if (inputData.bookings.length === 0) {
        return {
            success: true,
            skipped: true,
            message: "No affected bookings were found. Assignment alert email was not sent.",
        };
    }

    const emailContent = createAdminAssignmentAlertEmail(inputData);

    return sendEmail({
        to: adminEmailAddress,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
    });
}