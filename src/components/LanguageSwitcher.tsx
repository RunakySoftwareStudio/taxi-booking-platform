
"use client";

/*
  LanguageSwitcher shows a compact language selection box.

  We use a select box because:
  - it takes little space in the top menu
  - it works well on mobile screens
  - new languages can be added from one central languages object

  The visible label is removed to save space.
  aria-label still explains the field to screen readers.
*/

import {
  isLanguageCode,
  languages,
} from "@/lib/i18n/languages";

import { useLanguage } from "./LanguageProvider";

export function LanguageSwitcher() {
  const { languageCode, setLanguageCode } = useLanguage();

  /*
    Reads the selected value from the dropdown.

    The browser gives us a normal string, so isLanguageCode checks
    whether it is one of the supported values before we save it.
  */
  function handleLanguageChange( event: React.ChangeEvent<HTMLSelectElement>,  ) {
    const selectedValue = event.target.value;

    if (isLanguageCode(selectedValue)) { setLanguageCode(selectedValue); }
  }

  return (
    <select  value={languageCode} onChange={handleLanguageChange}
      className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-xs font-medium text-white outline-none transition hover:border-cyan-300 focus:border-cyan-300 sm:text-sm"  aria-label="Select language"  >
      {Object.entries(languages).map(
        ([languageCodeValue, languageDetails]) => (
          <option  key={languageCodeValue}  value={languageCodeValue} >
            {languageDetails.label}
          </option>  ),)}
    </select>
  );
}

