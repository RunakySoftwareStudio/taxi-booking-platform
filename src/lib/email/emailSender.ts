//This is a safe placeholder. It accepts email data, but it does not send anything yet.
//→ sends or skips the email
import { type SendEmailInput, type SendEmailResult } from "./emailTypes";

export async function sendEmail(inputData: SendEmailInput): Promise<SendEmailResult> {
    void inputData;

    return {
        success: true,
        skipped: true,
        message: "Email provider is not connected yet.",
    };
}