"use client";

/*
  ChauffeurStatusPage lets a chauffeur check the status of a registration.

  The chauffeur enters:
    - registration ID
    - email address

  In Version 5, the visible page text uses the language system so this page
  can switch between English and Dutch.
*/

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";
import { getTranslation } from "@/lib/i18n/translations";
import { useLanguage } from "@/components/LanguageProvider";
import type { LanguageCode } from "@/lib/i18n/languages";

/**
 * ChauffeurStatusResult
 *
 * This type describes the chauffeur registration data
 * that comes back from our chauffeur status API.
 */
type ChauffeurStatusResult = {
  id: string;
  name: string;
  email: string;
  phone: string;
  companyName: string | null;
  licenseNumber: string | null;
  serviceArea: string | null;
  acceptsPets: boolean;
  accountStatus: string;
  createdAt: string;
};

/**
 * ChauffeurStatusResponse
 *
 * This type describes the JSON response from:
 * /api/chauffeur-status
 */
type ChauffeurStatusResponse = {
  message: string;
  registration?: ChauffeurStatusResult;
};

/**
 * ChauffeurStatusPageProps
 *
 * initialRegistrationId is optional.
 * It allows us to prefill the registration ID input from the URL.
 */
type ChauffeurStatusPageProps = {
  initialRegistrationId?: string;
};

/**
 * formatDateForDisplay
 *
 * This helper converts the database createdAt date into a readable date.
 * The selected language decides which date locale we use.
 * If the date is missing or invalid, it returns "-".
 */
function formatDateForDisplay(inputValue: string, languageCode: LanguageCode) {
  if (!inputValue) { return "-"; }

  const dateValue = new Date(inputValue);
  if (Number.isNaN(dateValue.getTime())) { return "-"; }

  const dateLocale = languageCode === "nl" ? "nl-NL" : "en-GB";
  return dateValue.toLocaleDateString(dateLocale);
}

/**
 * ChauffeurStatusPage
 *
 * This component shows the public chauffeur registration status page.
 *
 * The chauffeur enters:
 * 1. Registration ID
 * 2. Email address
 *
 * Then this page calls:
 * /api/chauffeur-status
 *
 * If the registration is found, we show the current account status.
 */
export default function ChauffeurStatusPage({initialRegistrationId = "",}: ChauffeurStatusPageProps) {
  const { languageCode } = useLanguage();

  // getChauffeurStatusText returns translated text for this page.
  // This keeps the JSX shorter and easier to read.
  function getChauffeurStatusText(textKey: string) { return getTranslation("chauffeurStatusPage", textKey, languageCode); }

  // getAccountStatusLabel converts the database account status into readable page text.
  // Example: "pending_approval" becomes "Pending approval" or "In afwachting van goedkeuring".
  function getAccountStatusLabel(accountStatus: string) {
    if (accountStatus === "pending_approval") { return getChauffeurStatusText("statusPendingApproval"); }
    if (accountStatus === "approved") { return getChauffeurStatusText("statusApproved"); }
    if (accountStatus === "inactive") { return getChauffeurStatusText("statusInactive"); }
    if (accountStatus === "suspended") { return getChauffeurStatusText("statusSuspended"); }

    return accountStatus;
  }

  const safeInitialRegistrationId = initialRegistrationId ?? "";
  const [registration, setRegistration] = useState<ChauffeurStatusResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /**
   * handleStatusSearch
   *
   * This function runs when the chauffeur submits the status form.
   *
   * It reads the form values, sends them to the API,
   * and stores the result in React state.
   */
  async function handleStatusSearch(eventValue: FormEvent<HTMLFormElement>) {
    eventValue.preventDefault();

    const formData = new FormData(eventValue.currentTarget);
    const statusRequest = {
      registrationId: String(formData.get("registrationId") || ""),
      email: String(formData.get("email") || ""),
    };

    setIsLoading(true);
    setErrorMessage("");
    setRegistration(null);

    try {
      const response = await fetch("/api/chauffeur-status", {
        method: "POST",
        headers: {"Content-Type": "application/json", },
        body: JSON.stringify(statusRequest),
      });

      const result = (await response.json()) as ChauffeurStatusResponse;

      if (!response.ok || !result.registration) {
        setRegistration(null);
        setErrorMessage(getChauffeurStatusText("notFoundMessage"));
        return;
      }

      setRegistration(result.registration);
    } catch (error) {
      console.error("Could not find chauffeur registration:", error);
      setErrorMessage(getChauffeurStatusText("notFoundMessage"));
    } finally { setIsLoading(false); }
  }

  /**
   * Final return page section
   *
   * This section renders:
   * 1. Back link
   * 2. Page title
   * 3. Status search form
   * 4. Registration result card
   */
  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.container}>
        <Link href="/" className={formStyles.formInfoCell}> {getChauffeurStatusText("backToHomepage")} </Link>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> {getChauffeurStatusText("label")} </p>
        <h1 className={pageStyles.pageTitle}> {getChauffeurStatusText("title")} </h1>
        <p className={pageStyles.pageDescription}> {getChauffeurStatusText("description")} </p>

        <form onSubmit={handleStatusSearch} className="mt-8 rounded-2xl border-2 border-white/10 bg-white/5 p-4 sm:mt-12 sm:p-6" >
          <div className={formStyles.formDivGridCol2}>
            <label className="block">
              <span className={formStyles.span}> {getChauffeurStatusText("registrationIdLabel")} </span>
              <input name="registrationId" defaultValue={safeInitialRegistrationId} required placeholder={getChauffeurStatusText("registrationIdPlaceholder")} className={`${formStyles.inputWFullCyan} break-all`}  />
            </label>

            <label className="block">
              <span className={formStyles.span}> {getChauffeurStatusText("emailLabel")} </span>
              <input name="email" type="email" required placeholder={getChauffeurStatusText("emailPlaceholder")} className={formStyles.inputWFullCyan} />
            </label>
          </div>

          <button type="submit" disabled={isLoading} className={`mt-8 ${formStyles.primaryButtonOutside} disabled:cursor-not-allowed disabled:opacity-60`} >
            {isLoading ? getChauffeurStatusText("searchingButton") : getChauffeurStatusText("checkStatusButton")}
          </button>

          {errorMessage ? (<p className={tableStyles.errorCell}>{errorMessage}</p> ) : null}
        </form>

        {registration ? (
          <section className={formStyles.form}>
            <h3 className={formStyles.formH5MediumSemiBold}> {getChauffeurStatusText("registrationStatusTitle")}{" "}
              <span className={formStyles.formPCyan}>{getAccountStatusLabel(registration.accountStatus)}</span>
            </h3>

            <div className="mt-8 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
              <StatusRow label={getChauffeurStatusText("registrationIdLabel")} value={registration.id} />
              <StatusRow label={getChauffeurStatusText("nameLabel")} value={registration.name} />
              <StatusRow label={getChauffeurStatusText("emailLabel")} value={registration.email} />
              <StatusRow label={getChauffeurStatusText("phoneLabel")} value={registration.phone} />
              <StatusRow label={getChauffeurStatusText("companyNameLabel")} value={registration.companyName || "-"} />
              <StatusRow label={getChauffeurStatusText("licenseNumberLabel")} value={registration.licenseNumber || "-"} />
              <StatusRow label={getChauffeurStatusText("serviceAreaLabel")} value={registration.serviceArea || "-"} />
              <StatusRow label={getChauffeurStatusText("acceptsPetsLabel")} value={registration.acceptsPets ? getChauffeurStatusText("yes") : getChauffeurStatusText("no")} />
              <StatusRow label={getChauffeurStatusText("submittedOnLabel")} value={formatDateForDisplay(registration.createdAt, languageCode)} />
            </div>

            <div className={formStyles.formDivCyan}>
              <h3 className={formStyles.formLabel}> {getChauffeurStatusText("statusMeaningTitle")} </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li className={formStyles.formInfoCellCaption}> {getChauffeurStatusText("pendingExplanation")} </li>
                <li className={formStyles.formInfoCellCaption}> {getChauffeurStatusText("approvedExplanation")} </li>
                <li className={formStyles.formInfoCellCaption}> {getChauffeurStatusText("inactiveExplanation")} </li>
              </ul>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

/**
 * StatusRowProps
 *
 * This type describes one row in the registration result card.
 */
type StatusRowProps = {
  label: string;
  value: string;
};

/**
 * StatusRow
 *
 * This small reusable component shows one label and one value.
 * It keeps the result card clean and avoids repeated JSX.
 */
function StatusRow({ label, value }: StatusRowProps) {
  return (
    <div className="rounded-xl border border-cyan-400/20 bg-slate-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300"> {label} </p>
      <p className="mt-2 wrap-break-words text-white">{value}</p>
    </div>
  );
}