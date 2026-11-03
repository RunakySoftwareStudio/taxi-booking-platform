import {
    createAdminChauffeurWithdrawalEmail,
    createChauffeurWithdrawalConfirmationEmail,
} from "./chauffeurWithdrawalEmailTemplates";

import { sendEmail } from "./emailSender";

import type {
    ChauffeurWithdrawalEmailData,
    SendEmailResult,
} from "./emailTypes";

/*
    CHAUFFEUR WITHDRAWAL EMAIL NOTIFICATIONS

    Sends two separate notification previews after a
    successful chauffeur withdrawal:

    1. Admin notification — booking requires reassignment.
    2. Chauffeur confirmation — assignment was withdrawn.

    DEVELOPMENT EMAIL POLICY:
    Both previews are sent ONLY to ADMIN_BOOKING_EMAIL.

    No actual chauffeur or client email delivery.
*/

/* Result of the two independent notification attempts. */
export type ChauffeurWithdrawalNotificationResult = {
    admin: SendEmailResult;
    chauffeur: SendEmailResult;
};

/*
    Sends withdrawal notification previews.

    This function must only be called AFTER the protected
    PostgreSQL withdrawal operation succeeds.

    Email delivery failures must not reverse a successful
    database withdrawal.
*/
export async function sendChauffeurWithdrawalEmails(
    data: ChauffeurWithdrawalEmailData
): Promise<ChauffeurWithdrawalNotificationResult> {
    const adminEmailAddress = process.env.ADMIN_BOOKING_EMAIL;

    /* Skip delivery when the development preview address is missing. */
    if (!adminEmailAddress) {
        const skippedResult: SendEmailResult = {
            success: true,
            skipped: true,
            message: "ADMIN_BOOKING_EMAIL is not configured. Withdrawal previews were not sent.",
        };

        return {
            admin: skippedResult,
            chauffeur: skippedResult,
        };
    }

    /* Generate separate Admin and chauffeur email content. */
    const adminContent = createAdminChauffeurWithdrawalEmail(data);
    const chauffeurContent = createChauffeurWithdrawalConfirmationEmail(data);

    /*
        Both notification previews deliberately use the
        Admin email address as the actual recipient.
    */
    const adminResult = await sendEmail({
        to: adminEmailAddress,
        subject: `[ADMIN PREVIEW] ${adminContent.subject}`,
        text: adminContent.text,
        html: adminContent.html,
    });

    const chauffeurResult = await sendEmail({
        to: adminEmailAddress,
        subject: `[CHAUFFEUR PREVIEW] ${chauffeurContent.subject}`,
        text: chauffeurContent.text,
        html: chauffeurContent.html,
    });

    return {
        admin: adminResult,
        chauffeur: chauffeurResult,
    };
}