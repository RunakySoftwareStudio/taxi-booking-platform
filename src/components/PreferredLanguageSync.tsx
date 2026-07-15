"use client";

import { useEffect, useRef } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import type { LanguageCode } from "@/lib/i18n/languages";

// Defines the saved language received from the authenticated user profile.
type PreferredLanguageSyncProps = { preferredLanguage: LanguageCode };
/*
// Applies the database preference once without overriding later manual changes.
    Section description
    useRef(false) remembers whether synchronization already happened.
    setLanguageCode() reuses your existing provider logic.
    return null means this component has no visible layout.
*/
export default function PreferredLanguageSync({ preferredLanguage }: PreferredLanguageSyncProps) {
    const { languageCode, setLanguageCode } = useLanguage();
    const hasSynced = useRef(false);

    // Copies the saved database preference into the existing language system once.
    useEffect(() => {
        if (hasSynced.current) { return; }
        hasSynced.current = true;
        if (languageCode !== preferredLanguage) { setLanguageCode(preferredLanguage); }
    }, [languageCode, preferredLanguage, setLanguageCode]);

    // This component changes language state but displays no HTML.
    return null;
}