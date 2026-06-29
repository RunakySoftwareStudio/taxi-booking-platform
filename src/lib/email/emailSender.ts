//This is a safe placeholder. It accepts email data, but it does not send anything yet.
//→ sends or skips the email
import { Resend } from "resend";
import { type SendEmailInput, type SendEmailResult } from "./emailTypes";

export async function sendEmail(inputData: SendEmailInput): Promise<SendEmailResult> {
    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL;

    if (!resendApiKey) {
        return {
            success: true,
            skipped: true,
            message: "RESEND_API_KEY is not configured.",
        };
    }

    if (!resendFromEmail) {
        return {
            success: true,
            skipped: true,
            message: "RESEND_FROM_EMAIL is not configured.",
        };
    }

    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
        from: resendFromEmail,
        to: [inputData.to],
        subject: inputData.subject,
        text: inputData.text,
        html: inputData.html,
    });

    if (error) {
        console.error("Resend email error:", error);

        return {
            success: false,
            skipped: false,
            message: "Email sending failed.",
        };
    }

    return {
        success: true,
        skipped: false,
        message: "Email sent successfully.",
    };
}