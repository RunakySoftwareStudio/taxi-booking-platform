"use client";

import { useState, type FormEvent } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { getTranslation } from "@/lib/i18n/translations";
import { formStyles, pageStyles } from "@/styles/classNames";
import { useRouter } from "next/navigation";

// Defines the protected chauffeur fields available in the dropdown.
type ChangeableField = "" | "name" | "email" | "company_name" | "license_number";

// Defines the chauffeur ID received from the page.
type ChauffeurChangeRequestFormProps = { chauffeurId: string };

// Connects each stable database field value to its visible translation key.
const fieldOptions: { value: Exclude<ChangeableField, "">; textKey: string }[] = [
    { value: "name", textKey: "fieldName" },
    { value: "email", textKey: "fieldEmail" },
    { value: "company_name", textKey: "fieldCompanyName" },
    { value: "license_number", textKey: "fieldLicenseNumber" },
];

// Creates and submits a protected profile-change request.
export default function ChauffeurChangeRequestForm({ chauffeurId }: ChauffeurChangeRequestFormProps) {
    // Provides the currently selected interface language.
    const { languageCode } = useLanguage();
    
    // Refreshes the server-rendered request history after submission.
    const router = useRouter();

    // Returns translated text for the change-request page.
    function getRequestText(textKey: string) { return getTranslation("chauffeurChangeRequestPage", textKey, languageCode); }

    // Stores the selected field, requested value and optional explanation.
    const [fieldName, setFieldName] = useState<ChangeableField>("");
    const [requestedValue, setRequestedValue] = useState("");
    const [reason, setReason] = useState("");

    // Stores the form result and saving state.
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Sends the request to the protected chauffeur API.
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSuccessMessage("");
        setErrorMessage("");
        setIsSubmitting(true);

        try {
            const response = await fetch(`/api/chauffeur/${chauffeurId}/change-request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldName, requestedValue, reason }) });
            const result = await response.json();

            if (!response.ok) { setErrorMessage(result.message || getRequestText("submitFailedError")); return; }

            setSuccessMessage(getRequestText("submitSuccess"));
            setFieldName("");
            setRequestedValue("");
            setReason("");
            // Reloads the request history without a full browser refresh.
            router.refresh();
        } 
        catch (error) { console.error("Could not submit chauffeur change request:", error);  setErrorMessage(getRequestText("submitFailedError")); } 
        finally { setIsSubmitting(false); }
    }

    // Displays the translated change-request form.
    return (
        <section className="mt-8">
            {/* Shows the request result with space before the form below. */}
            {successMessage && <p className={`${pageStyles.successMsgPage} mb-4`}>{successMessage}</p>}
            {errorMessage && <p className={`${pageStyles.errorMsgPage} mb-4`}>{errorMessage}</p>}

            <form onSubmit={handleSubmit} className={formStyles.sectionCardBorder4}>
                <div className="grid gap-5">
                    {/* Selects which administrator-controlled field should change. */}
                    <label className={formStyles.label}>{getRequestText("fieldLabel")}
                        <select value={fieldName} onChange={(event) => setFieldName(event.target.value as ChangeableField)} required className={formStyles.selectWFull}>
                            <option value="">{getRequestText("selectFieldPlaceholder")}</option>
                            {fieldOptions.map((fieldOption) => <option key={fieldOption.value} value={fieldOption.value}>{getRequestText(fieldOption.textKey)}</option>)}
                        </select>
                    </label>

                    {/* Stores the new information requested by the chauffeur. */}
                    <label className={formStyles.label}>{getRequestText("requestedValueLabel")}
                        <input value={requestedValue} onChange={(event) => setRequestedValue(event.target.value)} type={fieldName === "email" ? "email" : "text"} maxLength={200} required className={formStyles.inputWFullCyan} placeholder={getRequestText("requestedValuePlaceholder")} />
                    </label>

                    {/* Provides a comfortable multiline box for the chauffeur's explanation. */}
                    <label className={formStyles.label}>{getRequestText("reasonLabel")}
                        <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={4} className={`${formStyles.inputWFullCyan} min-h-24 resize-y py-3 leading-5`} placeholder={getRequestText("reasonPlaceholder")} />
                    </label>
                </div>

                {/* Submits the request and prevents duplicate clicks while sending. */}
                <button type="submit" disabled={isSubmitting} className={`${formStyles.primaryButtonOutside} mt-6`}>
                    {isSubmitting ? getRequestText("submittingButton") : getRequestText("submitButton")}
                </button>
            </form>
        </section>
    );
}