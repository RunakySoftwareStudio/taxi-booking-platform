"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import { getTranslation } from "@/lib/i18n/translations";
import { formStyles, pageStyles } from "@/styles/classNames";

// Defines the chauffeur ID and existing public photo URL received from the profile page.
type ChauffeurProfilePhotoFormProps = { chauffeurId: string; currentPhotoUrl: string | null };

// Defines the accepted image rules shared with the server API and Storage bucket.
const maximumFileSize = 2 * 1024 * 1024;
const allowedFileTypes = ["image/jpeg", "image/png", "image/webp"];

// Selects, previews and uploads a chauffeur profile photo.
export default function ChauffeurProfilePhotoForm({ chauffeurId, currentPhotoUrl }: ChauffeurProfilePhotoFormProps) {
    // Provides translations, page refresh and stored component values.
    const router = useRouter();
    const { languageCode } = useLanguage();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
    const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(currentPhotoUrl);
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    // Tracks the profile-photo removal request.
    const [isRemoving, setIsRemoving] = useState(false);
    // Connects the translated button to the hidden native file input.
    const photoInputId = `chauffeur-photo-${chauffeurId}`;

    // Returns translated text for the profile-photo form.
    function getProfileText(textKey: string) { return getTranslation("chauffeurProfilePage", textKey, languageCode); }

    // Removes temporary browser preview URLs when replaced or when the component closes.
    useEffect(() => { return () => { if (localPreviewUrl) { URL.revokeObjectURL(localPreviewUrl); } }; }, [localPreviewUrl]);

    // Clears the currently selected local photo.
    function clearSelectedPhoto() {
        setSelectedFile(null);
        setLocalPreviewUrl(null);
    }
    
    // Validates the chosen file and creates an immediate local preview.
    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const nextFile = event.target.files?.[0] ?? null;

        setSuccessMessage("");
        setErrorMessage("");

        if (!nextFile) {
            clearSelectedPhoto();
            return;
        }

        if (!allowedFileTypes.includes(nextFile.type) || nextFile.size > maximumFileSize) {
            clearSelectedPhoto();
            setErrorMessage(getProfileText("photoUploadFailed"));
            return;
        }

        setSelectedFile(nextFile);
        setLocalPreviewUrl(URL.createObjectURL(nextFile));
    }

    // Sends the selected image to the protected chauffeur upload API.
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSuccessMessage("");
        setErrorMessage("");

        // Explains that selecting a file is the required first step.
        if (!selectedFile) {
            setErrorMessage(getProfileText("choosePhotoFirstMessage"));
            return;
        }

        setIsUploading(true);

        try {
            const formData = new FormData();
            formData.append("photo", selectedFile);

            const response = await fetch(`/api/chauffeur/${chauffeurId}/profile-photo`, {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                console.error("Profile photo upload failed:", result.message);
                setErrorMessage(getProfileText("photoUploadFailed"));
                return;
            }

            setUploadedPhotoUrl(result.profilePhotoUrl);
            clearSelectedPhoto();
            setSuccessMessage(getProfileText("photoUploadSuccess"));
            router.refresh();
        } catch (error) {
            console.error("Could not upload chauffeur profile photo:", error);
            setErrorMessage(getProfileText("photoUploadFailed"));
        } finally {
            setIsUploading(false);
        }
    }

    /*
        Section description
            window.confirm() prevents accidental deletion.
            DELETE calls the protected route created earlier.
            The local preview and saved-photo state are cleared after success.
            router.refresh() reloads the server-rendered profile information.
        Removes the current profile photo after chauffeur confirmation.
     */
    async function handleRemovePhoto() {
        if (!uploadedPhotoUrl || !window.confirm(getProfileText("removePhotoConfirm"))) { return; }

        setSuccessMessage("");
        setErrorMessage("");
        setIsRemoving(true);

        try {
            const response = await fetch(`/api/chauffeur/${chauffeurId}/profile-photo`, { method: "DELETE" });
            const result = await response.json();

            if (!response.ok) { console.error("Profile photo removal failed:", result.message); setErrorMessage(getProfileText("photoRemoveFailed")); return; }

            setUploadedPhotoUrl(null);
            clearSelectedPhoto();
            setSuccessMessage(getProfileText("photoRemoveSuccess"));
            router.refresh();
        } catch (error) {
            console.error("Could not remove chauffeur profile photo:", error);
            setErrorMessage(getProfileText("photoRemoveFailed"));
        } finally {
            setIsRemoving(false);
        }
    }

    // Uses the local selection first and otherwise displays the previously uploaded photo.
    const visiblePhotoUrl = localPreviewUrl || uploadedPhotoUrl;

    // Displays the photo preview, file selector and upload button.
    return (
        <div className="mt-8">
        {/* Shows upload and removal results above the photo box. */}
            {(successMessage || errorMessage) && (
                <div className="mb-4">
                    {successMessage && <p className={pageStyles.successMsgPage}>{successMessage}</p>}
                    {errorMessage && <p className={pageStyles.errorMsgPage}>{errorMessage}</p>}
                </div>
            )}

            <section className={formStyles.sectionCardBorder4}>
                <h2 className="text-xl font-semibold text-white text-start">{getProfileText("profilePhotoTitle")}</h2>
                <p className="mt-1 text-sm text-slate-400 text-start">{getProfileText("profilePhotoDescription")}</p>

                <div className="mt-6 grid gap-6 sm:grid-cols-[160px_1fr] sm:items-center">
                    {/* Shows either the selected/uploaded image or an empty-photo message. */}
                    {visiblePhotoUrl ? (
                        <div role="img" aria-label={getProfileText("profilePhotoTitle")} className="h-40 w-40 rounded-2xl border border-cyan-400/30 bg-cover bg-center" style={{ backgroundImage: `url("${visiblePhotoUrl}")` }} />
                    ) : (
                        <div className="flex h-40 w-40 items-center justify-center rounded-2xl border border-dashed border-cyan-400/30 p-4 text-center text-sm text-slate-400">{getProfileText("noPhotoMessage")}</div>
                    )}

                    {/* Selects and submits a validated profile image. */}
                    <form onSubmit={handleSubmit} className="grid gap-4">
<div>
    <p className={formStyles.label}>{getProfileText("selectPhotoLabel")}</p>

    {/* The real browser file input stays hidden. */}
    <input
        id={photoInputId}
        type="file"
        name="photo"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="sr-only"
    />

    {/* Shows a translated file-selection button and the selected filename. */}
    <div className="flex min-h-10 w-full items-center rounded-xl border border-cyan-400/50 bg-slate-950">
        <label
            htmlFor={photoInputId}
            className="cursor-pointer rounded-s-xl bg-cyan-950 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-900"
        >
            {getProfileText("chooseFileButton")}
        </label>

        <span className="min-w-0 flex-1 truncate px-4 text-sm text-slate-300">
            {selectedFile?.name || getProfileText("noFileChosenText")}
        </span>
    </div>
</div>
                        <p className="text-sm text-slate-400 text-start">{getProfileText("photoRequirements")}</p>

                        {/* Reminds the chauffeur that the selected file still needs to be uploaded. */}
                        {selectedFile && !isUploading && (
                            <p className="text-sm font-semibold text-red-300 text-start">
                                {getProfileText("uploadPhotoReminder")}
                            </p>
                        )}

                        {/* Provides upload, replacement and removal actions. */}
                        <div className="flex flex-wrap gap-3">
                            <button type="submit" disabled={isUploading || isRemoving} className={formStyles.primaryButtonOutside}>
                                {isUploading ? getProfileText("uploadingPhotoButton") : !selectedFile
                                        ? getProfileText("choosePhotoFirstButton") : uploadedPhotoUrl
                                            ? getProfileText("replaceSelectedPhotoButton") : getProfileText("uploadSelectedPhotoButton")}
                            </button>

                            {uploadedPhotoUrl && (
                                <button type="button" onClick={handleRemovePhoto} disabled={isUploading || isRemoving} className="rounded-xl border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50">
                                    {isRemoving ? getProfileText("removingPhotoButton") : getProfileText("removePhotoButton")}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </section>
        </div>
    );
}