"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import { getTranslation } from "@/lib/i18n/translations";
import { formStyles, pageStyles } from "@/styles/classNames";

// Defines the chauffeur fields that may be edited through this form.
type ChauffeurProfileData = { id: string; phone: string; service_area: string | null; accepts_pets: boolean };

// Defines the chauffeur information received from the profile page.
type ChauffeurProfileFormProps = { chauffeur: ChauffeurProfileData };

// Allows a chauffeur to update only phone, service area and pet acceptance.
export default function ChauffeurProfileForm({ chauffeur }: ChauffeurProfileFormProps) {
    // Provides page refresh and the currently selected interface language.
    const router = useRouter();
    const { languageCode } = useLanguage();

    // Returns translated text for this profile form.
    function getProfileText(textKey: string) { return getTranslation("chauffeurProfilePage", textKey, languageCode); }

    // Stores the editable chauffeur values.
    const [phone, setPhone] = useState(chauffeur.phone);
    const [serviceArea, setServiceArea] = useState(chauffeur.service_area ?? "");
    const [acceptsPets, setAcceptsPets] = useState(chauffeur.accepts_pets);

    // Stores the form status messages.
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Sends the allowed profile values to the protected chauffeur API.
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSuccessMessage("");
        setErrorMessage("");
        setIsSaving(true);

        try {
            const response = await fetch(`/api/chauffeur/${chauffeur.id}/profile`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, serviceArea, acceptsPets }) });
            const result = await response.json();

            if (!response.ok) { setErrorMessage(result.message || getProfileText("updateFailedError")); return; }

            setSuccessMessage(getProfileText("updateSuccess"));
            router.refresh();
        } catch (error) {
            console.error("Could not update chauffeur profile:", error);
            setErrorMessage(getProfileText("updateFailedError"));
        } finally {
            setIsSaving(false);
        }
    }

    // Displays the editable chauffeur profile fields.
    return (
            <section className="mt-8">
                {/* Shows the editable-section title before its form messages. */}
                <h2 className="text-xl font-semibold text-white">{getProfileText("editableTitle")}</h2>

                {/* Shows the save result with space below the section title. */}
                {successMessage && <p className={`${pageStyles.successMsgPage} mt-4`}>{successMessage}</p>}
                {errorMessage && <p className={`${pageStyles.errorMsgPage} mt-4`}>{errorMessage}</p>}

                {/* Contains the chauffeur-editable profile fields. */}
                <form onSubmit={handleSubmit} className={`${formStyles.sectionCardBorder4} mt-4`}>
                <div className="grid gap-5 md:grid-cols-2">
                    <label className={formStyles.label}>{getProfileText("phoneLabel")}
                         {/* Keeps the telephone number LTR but follows the page's visual alignment. */}
                        <input value={phone} onChange={(event) => setPhone(event.target.value)} required className={`${formStyles.inputWFullCyan} technical-input`} />
                    </label>

                    <label className={formStyles.label}>{getProfileText("serviceAreaLabel")}
                        <input value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} placeholder={getProfileText("serviceAreaPlaceholder")} className={formStyles.inputWFullCyan} />
                    </label>

                    <label className="flex items-center gap-3 text-sm text-white md:col-span-2">
                        <input type="checkbox" checked={acceptsPets} onChange={(event) => setAcceptsPets(event.target.checked)} className="h-5 w-5" />
                        {getProfileText("acceptsPetsLabel")}
                    </label>
                </div>

                <button type="submit" disabled={isSaving} className={`${formStyles.primaryButtonOutside} mt-6`}>
                    {isSaving ? getProfileText("savingButton") : getProfileText("saveButton")}
                </button>
            </form>
        </section>
    );
}