"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import { getTranslation } from "@/lib/i18n/translations";
import { formStyles, pageStyles } from "@/styles/classNames";
// Reuses the central Voya Taxi language configuration.
import { languages, type LanguageCode } from "@/lib/i18n/languages";
import { isLanguageCode } from "@/lib/i18n/languages";

// Defines chauffeur-table fields managed by this form.
type ChauffeurProfileData = { id: string; phone: string; service_area: string | null; accepts_pets: boolean; bio: string | null };

// Defines both chauffeur data and the account-language preference.
type ChauffeurProfileFormProps = { chauffeur: ChauffeurProfileData; preferredLanguage: LanguageCode };

// Allows a chauffeur to update only phone, service area and pet acceptance.
export default function ChauffeurProfileForm({ chauffeur, preferredLanguage: savedPreferredLanguage }: ChauffeurProfileFormProps) {
    // Provides page refresh and the currently selected interface language.
    const router = useRouter();
    const { languageCode, setLanguageCode } = useLanguage();

    // Stores the biography and saved interface-language preference.
    const [bio, setBio] = useState(chauffeur.bio ?? "");
    const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>(savedPreferredLanguage);

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
            const response = await fetch(`/api/chauffeur/${chauffeur.id}/profile`, 
                {   method: "PATCH", headers: { "Content-Type": "application/json" }, 
                    body: JSON.stringify({ phone, serviceArea, acceptsPets, bio, preferredLanguage }) });
            const result = await response.json();

            if (!response.ok) { setErrorMessage(result.message || getProfileText("updateFailedError")); return; }
            
            // Applies the saved preferred language immediately to the current page.
            if (isLanguageCode(preferredLanguage)) { setLanguageCode(preferredLanguage);  }

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
                    {/* Allows the chauffeur to write a public introduction. */}
                    <label className={`${formStyles.label} md:col-span-2`}>
                        {getProfileText("bioLabel")}
                        {/* Aligns the biography with the interface while preserving its own text direction. */}
                        <textarea value={bio} onChange={(event) => setBio(event.target.value)} 
                            maxLength={1000} rows={5} dir="auto" 
                            className={`${formStyles.inputWFullCyan} language-text-input min-h-28 resize-y py-3 leading-5`} 
                            placeholder={getProfileText("bioPlaceholder")} />
                        {/*extra explanation below of this textarea */}        
                        <span className="text-xs text-slate-400">{getProfileText("bioDescription")} {1000 - bio.length} {getProfileText("bioCharactersRemaining")}.</span>
                    </label>


                        
                    {/* Saves the chauffeur's preferred application-interface language. */}
                    <label className={formStyles.label}>
                        {getProfileText("preferredLanguageLabel")}
                        <select value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value as LanguageCode)} className={formStyles.selectWFull}>
                            {(Object.keys(languages) as LanguageCode[]).map((languageOption) => <option key={languageOption} value={languageOption}>{languages[languageOption].label}</option>)}
                        </select>
                        <span className="text-xs text-slate-400">{getProfileText("preferredLanguageDescription")}</span>
                    </label>
                    {/* saves the chauffeur acceping pets or not */}
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