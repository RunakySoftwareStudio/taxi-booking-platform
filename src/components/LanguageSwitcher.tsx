"use client";

/*
  LanguageSwitcher shows a small language selection box.

  We use a select box because:
    - it takes less space in the top menu
    - it works well on mobile screens
    - it is easier to add more languages later

  The visible label is removed to save space.
  aria-label is still used so screen readers understand what the select box does.
*/

import { languages, type LanguageCode } from "@/lib/i18n/languages";
import { useLanguage } from "./LanguageProvider";

export function LanguageSwitcher() {
  const { languageCode, setLanguageCode } = useLanguage();

  // handleLanguageChange reads the selected language from the dropdown.
  // We only update the language when the selected value is "en" or "nl".
  function handleLanguageChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLanguageCode = event.target.value as LanguageCode;
    setLanguageCode(nextLanguageCode);
  }

  return (
    <select
      value={languageCode}
      onChange={handleLanguageChange}
      className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-xs font-medium text-white outline-none transition hover:border-cyan-300 focus:border-cyan-300 sm:text-sm"
      aria-label="Select language"
    >
      <option value="" disabled>
        Language
      </option>

      <option value="en">{languages.en}</option>
      <option value="nl">{languages.nl}</option>
    </select>
  );
}