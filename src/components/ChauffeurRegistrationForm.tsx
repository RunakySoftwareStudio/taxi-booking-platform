"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useState } from "react";
import { buttonStyles } from "@/styles/classNames";
import { getTranslation } from "@/lib/i18n/translations";
import { useLanguage } from "@/components/LanguageProvider";

/*=========================================**
 * RegistrationStep
 *
 * This type controls which screen the user currently sees.
 *
 * form = user fills in the registration form
 * review = user checks the entered details
 * submitted = temporary success screen for this UI-only step
 =========================================**/
type RegistrationStep = "form" | "review" | "submitted";

/*=========================================**
 * ChauffeurRegistrationFormData
 *
 * This type describes the form data that we collect from the chauffeur.
 * The field names are frontend-friendly camelCase names.
 *
 * Later, in the API route, we will convert some fields to database names:
 * companyName -> company_name
 * licenseNumber -> license_number
 * serviceArea -> service_area
 * acceptsPets -> accepts_pets
 =========================================**/
type ChauffeurRegistrationFormData = {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  licenseNumber: string;
  serviceArea: string;
  acceptsPets: boolean;
};

/*=========================================*
 * SavedChauffeurRegistration
 *
 * This type describes the chauffeur registration data
 * that comes back from our API after saving to Supabase.
 =========================================*/
type SavedChauffeurRegistration = {
  id: string;
  name: string;
  email: string;
  accountStatus: string;
};

/*=========================================*
 * ChauffeurRegistrationApiResponse
 *
 * This type describes the JSON response from:
 * /api/chauffeur-registrations
 =========================================*/
type ChauffeurRegistrationApiResponse = {
  message: string;
  registration?: SavedChauffeurRegistration;
};

/*=========================================**
 * initialFormData
 *
 * This is the empty starting value for the form.
 * We also reuse it when the user wants to start a new registration.
 =========================================**/
const initialFormData: ChauffeurRegistrationFormData = {
  name: "",
  email: "",
  phone: "",
  companyName: "",
  licenseNumber: "",
  serviceArea: "",
  acceptsPets: false,
};

/*=========================================**
 * ChauffeurRegistrationForm
 *
 * This is the main client component for the chauffeur registration flow.
 *
 * It controls:
 * 1. The form input screen
 * 2. The review screen
 * 3. The temporary submitted screen
 *
 * In the next step, the confirm button will call our API route
 * and save the registration in Supabase.
 =========================================**/
export default function ChauffeurRegistrationForm() {
    const { languageCode } = useLanguage();

  // getChauffeurRegisterText returns translated text for this registration form.
  // This keeps the JSX shorter and easier to read.
  function getChauffeurRegisterText(textKey: string) { return getTranslation("chauffeurRegisterPage", textKey, languageCode); }

  // getAccountStatusLabel converts the database status into readable page text.
  // Example: pending_approval becomes "Pending approval" or "In afwachting van goedkeuring".
  function getAccountStatusLabel(accountStatus: string) {
    if (accountStatus === "pending_approval") { return getChauffeurRegisterText("statusPendingApproval"); }
    if (accountStatus === "approved") { return getChauffeurRegisterText("statusApproved"); }
    if (accountStatus === "inactive") { return getChauffeurRegisterText("statusInactive"); }
    if (accountStatus === "suspended") { return getChauffeurRegisterText("statusSuspended"); }

    return accountStatus;
  }

  const [formData, setFormData] = useState<ChauffeurRegistrationFormData>(initialFormData);
  const [registrationStep, setRegistrationStep] =  useState<RegistrationStep>("form");

  /**
     * submittedRegistration
     *
     * This stores the saved registration that comes back from Supabase.
     * We need this so we can show the registration ID to the chauffeur.
     */
    const [submittedRegistration, setSubmittedRegistration] =    useState<SavedChauffeurRegistration | null>(null);

    /**
     * isSubmitting
     *
     * This is true while the form is being sent to the API.
     * We use it to disable the Confirm button and show loading text.
     */
    const [isSubmitting, setIsSubmitting] = useState(false);

    /**
     * errorMessage
     *
     * This stores an error message if the API request fails.
     * Example: duplicate email or server error.
     */
    const [errorMessage, setErrorMessage] = useState("");

  /*=========================================**
   * updateTextField
   *
   * This function creates an onChange handler for text inputs.When the user types in an input field:
    1. Keep all existing form data
    2. Change only the field that belongs to this input
    3. Save the new form data in React state
   *
   * Example:
   * updateTextField("name") updates formData.name
   * updateTextField("email") updates formData.email
   *
   * This avoids writing a separate function for every text input.
   * ...currentData: Copy the old form data, then overwrite one selected field with the new input value.
   * keyof: The fieldName parameter must be the name of one existing field inside ChauffeurRegistrationFormData.
   *        So keyof helps prevent spelling mistakes.
   =========================================**/
  function updateTextField(fieldName: keyof ChauffeurRegistrationFormData) {
    return function handleFieldChange(eventValue: ChangeEvent<HTMLInputElement>) {
      setFormData((currentData) => ({
        ...currentData,
        [fieldName]: eventValue.target.value,
      }));
    };
  }

  /*=========================================**
   * handlePetsChange
   *
   * This function updates the acceptsPets boolean value.
   * A checkbox uses checked instead of value.
   =========================================**/
  function handlePetsChange(eventValue: ChangeEvent<HTMLInputElement>) {
    setFormData((currentData) => ({
      ...currentData,
      acceptsPets: eventValue.target.checked,
    }));
  }

  /*=========================================**
   * handleReviewRegistration
   *
   * This function runs when the user submits the form.
   *
   * preventDefault stops the browser from refreshing the page.
   * Then we move the user to the review screen.
   =========================================**/
  function handleReviewRegistration(eventValue: FormEvent<HTMLFormElement>) {
    eventValue.preventDefault();
    setRegistrationStep("review");
  }

    /*=========================================*
     * handleConfirmRegistration
     *
     * This function runs when the user clicks Confirm registration.
     *
     * It sends the form data to our API route: /api/chauffeur-registrations
     *
     * If the API succeeds, we save the returned registration ID
     * and move the user to the submitted screen.
     ==================================================*/
    async function handleConfirmRegistration() {
        setErrorMessage("");
        setIsSubmitting(true);

        try {
            const response = await fetch("/api/chauffeur-registrations", {
                method: "POST",
                headers: {"Content-Type": "application/json", },
                body: JSON.stringify(formData), });

            const result = (await response.json()) as ChauffeurRegistrationApiResponse;

            if (!response.ok || !result.registration) { setErrorMessage(result.message || getChauffeurRegisterText("submitErrorMessage")); return; }

            setSubmittedRegistration(result.registration);
            setRegistrationStep("submitted");
        } 
        catch { setErrorMessage(getChauffeurRegisterText("serverErrorMessage")); }
        finally { setIsSubmitting(false);  }
    }

    /*=======================================*
     * handleEditRegistration
     *
     * This function sends the user back to the form screen
     * so they can correct their details.
     *
     * It also clears old error messages.
     =========================================*/
    function handleEditRegistration() {
        setErrorMessage("");
        setRegistrationStep("form");
    }

  /*=========================================*
    * handleNewRegistration
    *
    * This function clears the form, clears the saved registration,
    * clears errors, and sends the user back to the first form screen.
    */
    function handleNewRegistration() {
        setFormData(initialFormData);
        setSubmittedRegistration(null);
        setErrorMessage("");
        setRegistrationStep("form");
    }

  /*====================================*
   * Submitted screen section
   *
   * This screen appears after the user clicks Confirm registration.
   * For now this is only a temporary UI success screen.
   ======================================*/
  if (registrationStep === "submitted") {
    return (
      <section className="rounded-2xl border border-cyan-400/30 bg-slate-900 p-6 shadow-xl">
        <h2 className="text-2xl font-bold text-cyan-300"> {getChauffeurRegisterText("submittedTitle")} </h2>
        <p className="mt-4 text-slate-300"> {getChauffeurRegisterText("submittedDescription")} </p>

        <div className="mt-6 rounded-xl bg-slate-800 p-4 text-sm text-slate-300">
          <p> <span className="font-semibold text-white">{getChauffeurRegisterText("registrationIdLabel")}</span>{" "} {submittedRegistration?.id}</p>
          <p> <span className="font-semibold text-white">{getChauffeurRegisterText("fullNameLabel")}:</span>{" "} {submittedRegistration?.name}</p>
          <p> <span className="font-semibold text-white">{getChauffeurRegisterText("emailLabel")}:</span>{" "} {submittedRegistration?.email} </p>
          <p> <span className="font-semibold text-white">{getChauffeurRegisterText("statusLabel")}</span>{" "} {submittedRegistration ? getAccountStatusLabel(submittedRegistration.accountStatus) : "-"} </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={`/chauffeur-status?registrationId=${submittedRegistration?.id ?? ""}`} className={buttonStyles.normalSoftCyan} >
              {getChauffeurRegisterText("checkRegistrationStatusButton")}
          </Link>

          <button type="button" onClick={handleNewRegistration} className={buttonStyles.normalNeutral} >
              {getChauffeurRegisterText("startNewRegistrationButton")}
          </button>
        </div>
      </section>
    );
  }

  /*===================================*
   * Review screen section
   *
   * This screen shows a summary of the entered registration data.
   * The chauffeur can either edit the form or confirm the registration.
   ====================================*/
  if (registrationStep === "review") {
    return (
      <section className="rounded-2xl border border-cyan-400/30 bg-slate-900 p-6 shadow-xl">
        <h2 className="text-2xl font-bold text-cyan-300"> {getChauffeurRegisterText("reviewTitle")} </h2>
        <p className="mt-2 text-slate-300"> {getChauffeurRegisterText("reviewDescription")} </p>

        <div className="mt-6 grid gap-4 text-sm text-slate-300">
          <ReviewRow label={getChauffeurRegisterText("fullNameLabel")} value={formData.name} />
          <ReviewRow label={getChauffeurRegisterText("emailLabel")} value={formData.email} />
          <ReviewRow label={getChauffeurRegisterText("phoneLabel")} value={formData.phone} />
          <ReviewRow label={getChauffeurRegisterText("companyNameLabel")} value={formData.companyName || "-"} />
          <ReviewRow label={getChauffeurRegisterText("licenseNumberLabel")} value={formData.licenseNumber || "-"} />
          <ReviewRow label={getChauffeurRegisterText("serviceAreaLabel")} value={formData.serviceArea || "-"} />
          <ReviewRow label={getChauffeurRegisterText("acceptsPetsLabel")} value={formData.acceptsPets ? getChauffeurRegisterText("yes") : getChauffeurRegisterText("no")} />
        </div>

        {errorMessage ? ( <p className="mt-6 rounded-xl border border-red-400/40 bg-red-950/40 p-4 text-sm text-red-200"> {errorMessage} </p> ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={handleEditRegistration} className={buttonStyles.normalNeutral}>
                {getChauffeurRegisterText("editRegistrationButton")}
            </button>

            <button type="button" onClick={handleConfirmRegistration} disabled={isSubmitting}
                className={`${buttonStyles.normalSoftCyan} ${buttonStyles.disabled}`}>
                {isSubmitting ? getChauffeurRegisterText("submittingButton") : getChauffeurRegisterText("confirmRegistrationButton")}
            </button>
        </div>
      </section>
    );
  }

  /*=========================================**
   * Final return: form screen section
   *
   * This is the first screen the chauffeur sees.
   * The user enters registration details here.
   *
   * When the form is submitted, handleReviewRegistration moves the user
   * to the review screen instead of sending data directly to Supabase.
   =========================================**/
  return (
    <form  onSubmit={handleReviewRegistration} className="rounded-2xl border border-cyan-400/30 bg-slate-900 p-6 shadow-xl" >
      <div className="grid gap-5">
        <FormField  label={getChauffeurRegisterText("fullNameLabel")} inputName="name"  value={formData.name}  onChange={updateTextField("name")}   required />
        <FormField  label={getChauffeurRegisterText("emailLabel")}  inputName="email"  type="email"  value={formData.email} onChange={updateTextField("email")} required />
        <FormField  label={getChauffeurRegisterText("phoneLabel")} inputName="phone"  type="tel"  value={formData.phone}  onChange={updateTextField("phone")}  required  />
        <FormField  label={getChauffeurRegisterText("companyNameLabel")}  inputName="companyName"  value={formData.companyName} onChange={updateTextField("companyName")}  />
        <FormField  label={getChauffeurRegisterText("licenseNumberLabel")} inputName="licenseNumber" value={formData.licenseNumber} onChange={updateTextField("licenseNumber")} />
        <FormField  label={getChauffeurRegisterText("serviceAreaLabel")} inputName="serviceArea" value={formData.serviceArea}  onChange={updateTextField("serviceArea")} placeholder={getChauffeurRegisterText("serviceAreaPlaceholder")} />
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-800 p-4 text-sm text-slate-300">
        <input  type="checkbox"  checked={formData.acceptsPets}  onChange={handlePetsChange} className="h-5 w-5" />  {getChauffeurRegisterText("acceptsPetsLabel")} </label>
      </div>

      <button type="submit" className={buttonStyles.fullWidthSoftCyan}>
        {getChauffeurRegisterText("reviewRegistrationButton")}
      </button>
    </form>
  );
}

    /*=========================================**
     * FormFieldProps
     *
     * This type describes which props the reusable FormField component needs.
    =========================================* */
    type FormFieldProps = {
        label: string;
        inputName: string;
        type?: string;
        value: string;
        placeholder?: string;
        required?: boolean;
        onChange: (eventValue: ChangeEvent<HTMLInputElement>) => void;
    };

    /*=========================================**
     * FormField
     *
     * This reusable component renders one label and one input field.
     *
     * We use this to avoid repeating the same input JSX many times.
     =========================================**/
    function FormField({
        label,
        inputName,
        type = "text",
        value,
        placeholder,
        required = false,
        onChange,
    }: FormFieldProps) {
        return (
            <label className="grid gap-2 text-sm font-medium text-slate-200">
            {label}

            <input
                name={inputName}
                type={type}
                value={value}
                placeholder={placeholder}
                required={required}
                onChange={onChange}
                className="rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
            />
            </label>
        );
    }

    /*=========================================**
     * ReviewRowProps
     *
     * This type describes the data needed for one row in the review screen.
     =========================================**/
    type ReviewRowProps = {
        label: string;
        value: string;
    };

    /*=========================================**
     * ReviewRow
     *
     * This reusable component shows one item in the review summary.
     *
     * Example:
     * label = "Email"
     * value = "driver@example.com"
     =========================================**/
    function ReviewRow({ label, value }: ReviewRowProps) {
        return (
            <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 font-medium text-white">{value}</p>
            </div>
        );
    }