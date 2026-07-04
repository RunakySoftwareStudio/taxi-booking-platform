"use client";

import { ChangeEvent, FormEvent, useState } from "react";

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
  const [formData, setFormData] = useState<ChauffeurRegistrationFormData>(initialFormData);
  const [registrationStep, setRegistrationStep] =  useState<RegistrationStep>("form");

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

  /*=========================================**
   * handleConfirmRegistration
   *
   * This function runs when the user clicks Confirm registration.
   *
   * For now, it only moves to the submitted screen.
   * In the next step, this is where we will call the API route.
   =========================================**/
  function handleConfirmRegistration() {
    setRegistrationStep("submitted");
  }

  /*=========================================**
   * handleEditRegistration
   *
   * This function sends the user back to the form screen
   * so they can correct their details.
   =========================================**/
  function handleEditRegistration() {
    setRegistrationStep("form");
  }

  /*=========================================*
   * handleNewRegistration
   *
   * This function clears the form and sends the user back
   * to the first form screen.
   =========================================*/
  function handleNewRegistration() {
    setFormData(initialFormData);
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
        <h2 className="text-2xl font-bold text-cyan-300"> Registration ready </h2>
        <p className="mt-4 text-slate-300">
          Your chauffeur registration form is working. In the next step, we will
          connect this confirmation button to Supabase and save the registration
          with status pending_approval.
        </p>
        <div className="mt-6 rounded-xl bg-slate-800 p-4 text-sm text-slate-300">
          <p> <span className="font-semibold text-white">Name:</span>{" "} {formData.name}</p>
          <p> <span className="font-semibold text-white">Email:</span>{" "}  {formData.email} </p>
          <p> <span className="font-semibold text-white">Status:</span>{" "}  pending_approval </p>
        </div>
        <button type="button" onClick={handleNewRegistration}  className="mt-6 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300"  >
            Start new registration
        </button>
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
        <h2 className="text-2xl font-bold text-cyan-300"> Review registration </h2>
        <p className="mt-2 text-slate-300"> Please check the chauffeur registration details before confirming. </p>
        <div className="mt-6 grid gap-4 text-sm text-slate-300">
          <ReviewRow label="Name" value={formData.name} />
          <ReviewRow label="Email" value={formData.email} />
          <ReviewRow label="Phone" value={formData.phone} />
          <ReviewRow label="Company name" value={formData.companyName || "-"} />
          <ReviewRow label="License number"  value={formData.licenseNumber || "-"}   />
          <ReviewRow label="Service area" value={formData.serviceArea || "-"} />
          <ReviewRow label="Accepts pets" value={formData.acceptsPets ? "Yes" : "No"} />
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button  type="button"  onClick={handleEditRegistration} className="rounded-xl border border-slate-600 px-5 py-3 font-semibold text-white hover:bg-slate-800">
            Edit registration
          </button>

          <button type="button"  onClick={handleConfirmRegistration} className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300">
            Confirm registration
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
    <form  onSubmit={handleReviewRegistration} className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl" >
      <div className="grid gap-5">
        <FormField  label="Full name" inputName="name"  value={formData.name}  onChange={updateTextField("name")}   required />
        <FormField  label="Email"  inputName="email"  type="email"  value={formData.email} onChange={updateTextField("email")} required />
        <FormField  label="Phone" inputName="phone"  type="tel"  value={formData.phone}  onChange={updateTextField("phone")}  required  />
        <FormField  label="Company name"  inputName="companyName"  value={formData.companyName} onChange={updateTextField("companyName")}  />
        <FormField  label="License number" inputName="licenseNumber" value={formData.licenseNumber} onChange={updateTextField("licenseNumber")} />
        <FormField  label="Service area" inputName="serviceArea" value={formData.serviceArea}  onChange={updateTextField("serviceArea")} placeholder="Example: Almere, Amsterdam, Lelystad" />
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-800 p-4 text-sm text-slate-300">
        <input  type="checkbox"  checked={formData.acceptsPets}  onChange={handlePetsChange} className="h-5 w-5" />  I accept passengers with pets </label>
      </div>

      <button type="submit" className="mt-8 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300" >
        Review registration
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