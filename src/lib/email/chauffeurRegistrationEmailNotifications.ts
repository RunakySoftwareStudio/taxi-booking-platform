import { sendEmail } from "./emailSender";
import { type SendEmailResult } from "./emailTypes";

/**
 * ChauffeurRegistrationEmailData
 *
 * This type describes the chauffeur registration data
 * that we need for the admin notification email.
 */
type ChauffeurRegistrationEmailData = {
  id: string;
  name: string;
  email: string;
  phone: string;
  companyName: string | null;
  licenseNumber: string | null;
  serviceArea: string | null;
  acceptsPets: boolean;
  accountStatus: string;
};

/**
 * escapeHtml
 *
 * This helper makes user-entered text safer for HTML emails.
 * It prevents characters like < and > from being interpreted as HTML.
 */
function escapeHtml(inputValue: string | null) {
  if (!inputValue) {
    return "-";
  }

  return inputValue
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * sendChauffeurRegistrationAdminEmail
 *
 * This function prepares and sends an email to the admin
 * when a new chauffeur registration is submitted.
 *
 * For now we use ADMIN_CHAUFFEUR_REGISTRATION_EMAIL if it exists.
 * If not, we reuse ADMIN_BOOKING_EMAIL because that is already used
 * in the project for admin notifications.
 */
export async function sendChauffeurRegistrationAdminEmail(inputData: ChauffeurRegistrationEmailData): Promise<SendEmailResult> {
  const adminEmailAddress = process.env.ADMIN_CHAUFFEUR_REGISTRATION_EMAIL ||  process.env.ADMIN_BOOKING_EMAIL;

  if (!adminEmailAddress) {
    return {
      success: true,
      skipped: true,
      message:
        "No admin email configured. Chauffeur registration email was not sent.",
    };
  }

  const acceptsPetsText = inputData.acceptsPets ? "Yes" : "No";
  const subject = `New chauffeur registration: ${inputData.name}`;
  const text = `
    New chauffeur registration received.

    Registration ID: ${inputData.id}
    Name: ${inputData.name}
    Email: ${inputData.email}
    Phone: ${inputData.phone}
    Company name: ${inputData.companyName || "-"}
    License number: ${inputData.licenseNumber || "-"}
    Service area: ${inputData.serviceArea || "-"}
    Accepts pets: ${acceptsPetsText}
    Status: ${inputData.accountStatus}
    `;

  const html = `
    <h1>New chauffeur registration received</h1>
    <p>A new chauffeur has submitted a registration request.</p>
    <table cellpadding="8" cellspacing="0" border="1" style="border-collapse: collapse;">
      <tr>
        <td><strong>Registration ID</strong></td>
        <td>${escapeHtml(inputData.id)}</td>
      </tr>
      <tr>
        <td><strong>Name</strong></td>
        <td>${escapeHtml(inputData.name)}</td>
      </tr>
      <tr>
        <td><strong>Email</strong></td>
        <td>${escapeHtml(inputData.email)}</td>
      </tr>
      <tr>
        <td><strong>Phone</strong></td>
        <td>${escapeHtml(inputData.phone)}</td>
      </tr>
      <tr>
        <td><strong>Company name</strong></td>
        <td>${escapeHtml(inputData.companyName)}</td>
      </tr>
      <tr>
        <td><strong>License number</strong></td>
        <td>${escapeHtml(inputData.licenseNumber)}</td>
      </tr>
      <tr>
        <td><strong>Service area</strong></td>
        <td>${escapeHtml(inputData.serviceArea)}</td>
      </tr>
      <tr>
        <td><strong>Accepts pets</strong></td>
        <td>${acceptsPetsText}</td>
      </tr>
      <tr>
        <td><strong>Status</strong></td>
        <td>${escapeHtml(inputData.accountStatus)}</td>
      </tr>
    </table>

    <p>Please review this chauffeur in the admin dashboard.</p>
  `;

  return sendEmail({
    to: adminEmailAddress,
    subject,
    text,
    html,
  });
}