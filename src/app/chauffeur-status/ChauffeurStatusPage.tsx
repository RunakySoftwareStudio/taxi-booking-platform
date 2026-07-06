"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { formStyles, pageStyles, tableStyles } from "@/styles/classNames";

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
 * If the date is missing or invalid, it returns "-".
 */
function formatDateForDisplay(inputValue: string) {
  if (!inputValue) { return "-"; }
  const dateValue = new Date(inputValue);
  if (Number.isNaN(dateValue.getTime())) { return "-"; }

  return dateValue.toLocaleDateString("en-GB");
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
  const safeInitialRegistrationId = initialRegistrationId ?? "";
  const [registration, setRegistration] =useState<ChauffeurStatusResult | null>(null);
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
        setErrorMessage( result.message || "Chauffeur registration not found." );
        return;
      }

      setRegistration(result.registration);
    } catch (error) {
      console.error("Could not find chauffeur registration:", error);
      setErrorMessage("Chauffeur registration not found. Please check your registration ID and email." );
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
        <Link href="/" className={formStyles.formInfoCell}>  ← Back to homepage </Link>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> Chauffeur registration status </p>
        <h1 className={pageStyles.pageTitle}> Check your chauffeur registration </h1>
        <p className={pageStyles.pageDescription}> Enter your registration ID and email address to view the current status of your chauffeur registration. </p>

        <form onSubmit={handleStatusSearch} className="mt-8 rounded-2xl border-2 border-white/10 bg-white/5 p-4 sm:mt-12 sm:p-6" >
          <div className={formStyles.formDivGridCol2}>
            <label className="block">
              <span className={formStyles.span}>Registration ID</span>
              <input name="registrationId" defaultValue={safeInitialRegistrationId} required placeholder="Paste your registration ID" className={`${formStyles.inputWFullCyan} break-all`}  />
            </label>

            <label className="block">
              <span className={formStyles.span}>Email address</span>
              <input name="email" type="email" required  placeholder="you@example.com" className={formStyles.inputWFullCyan} />
            </label>
          </div>

          <button
            type="submit"  disabled={isLoading}  className={`mt-8 ${formStyles.primaryButtonOutside} disabled:cursor-not-allowed disabled:opacity-60`} >
            {isLoading ? "Searching..." : "Check registration status"}
          </button>

          {errorMessage ? (<p className={tableStyles.errorCell}>{errorMessage}</p> ) : null}
        </form>

        {registration ? (
          <section className={formStyles.form}>
            <h3 className={formStyles.formH5MediumSemiBold}>  Registration Status:{" "}
              <span className={formStyles.formPCyan}>
                {registration.accountStatus}
              </span>
            </h3>

            <div className="mt-8 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
              <StatusRow label="Registration ID" value={registration.id} />
              <StatusRow label="Name" value={registration.name} />
              <StatusRow label="Email" value={registration.email} />
              <StatusRow label="Phone" value={registration.phone} />
              <StatusRow label="Company name" value={registration.companyName || "-"} />
              <StatusRow label="License number" value={registration.licenseNumber || "-"} />
              <StatusRow label="Service area" value={registration.serviceArea || "-"} />
              <StatusRow label="Accepts pets" value={registration.acceptsPets ? "Yes" : "No"} />
              <StatusRow label="Submitted on" value={formatDateForDisplay(registration.createdAt)} />
            </div>

            <div className={formStyles.formDivCyan}>
              <h3 className={formStyles.formLabel}>What this status means</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li className={formStyles.formInfoCellCaption}> Pending_approval means your registration was received and is waiting for admin review. </li>
                <li className={formStyles.formInfoCellCaption}> Approved means your chauffeur account has been accepted.  </li>
                <li className={formStyles.formInfoCellCaption}> Inactive or suspended means your account is not currently active. </li>
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
      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
        {label}
      </p>

      <p className="mt-2 wrap-break-words text-white">{value}</p>
    </div>
  );
}