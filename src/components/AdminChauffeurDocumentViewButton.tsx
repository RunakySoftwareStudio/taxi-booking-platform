
"use client";

import { useState } from "react";
import { formStyles } from "@/styles/classNames";

/* Defines the chauffeur and document IDs needed by the protected Admin API. */
type AdminChauffeurDocumentViewButtonProps = {
    chauffeurId: string;
    documentId: string;
};

/* Opens a private chauffeur document through a short-lived signed URL. */
export default function AdminChauffeurDocumentViewButton({chauffeurId, documentId}: AdminChauffeurDocumentViewButtonProps) {

    const [isOpening, setIsOpening] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    /* Requests a five-minute signed URL and opens it in an already-approved browser tab. */
    async function handleOpenDocument() {
        setErrorMessage("");
        setIsOpening(true);

        /* Open the tab immediately so the browser recognizes the user click. */
        const documentWindow = window.open("about:blank", "_blank");

        if (!documentWindow) {
            setErrorMessage("The browser blocked the document window.");
            setIsOpening(false);
            return;
        }

        documentWindow.opener = null;

        try {
            const response = await fetch(`/api/admin/chauffeurs/${chauffeurId}/documents/${documentId}`);
            const result = await response.json();

            if (!response.ok) {
                documentWindow.close();
                console.error("Could not open chauffeur document:", result.message);
                setErrorMessage(result.message || "Could not open the document.");
                return;
            }

            documentWindow.location.href = result.signedUrl;
        } catch (error) {
            documentWindow.close();
            console.error("Could not open private chauffeur document:", error);
            setErrorMessage("Could not open the document.");
        } finally {
            setIsOpening(false);
        }
    }

    return (
        <div>
            <button type="button" onClick={handleOpenDocument} disabled={isOpening} className={formStyles.smallButton}>
                {isOpening ? "Opening..." : "View document"}
            </button>

            {errorMessage && (
                <p className="mt-2 text-xs text-red-300">
                    {errorMessage}
                </p>
            )}
        </div>
    );
}