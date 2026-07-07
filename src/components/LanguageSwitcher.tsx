/**
 * Short explanation
    This is the visible switcher:
    English | Nederlands
    But for now, it is not connected to the menu yet. That will be Step 5.2.
 */
"use client";

import { languages, type LanguageCode } from "@/lib/i18n/languages";
import { useLanguage } from "./LanguageProvider";

export function LanguageSwitcher() {
  const { languageCode, setLanguageCode } = useLanguage();
  function handleLanguageChange(nextLanguageCode: LanguageCode) { setLanguageCode(nextLanguageCode);  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <button  type="button"
        onClick={() => handleLanguageChange("en")}
        className={languageCode === "en" ? "font-semibold text-cyan-300" : "text-slate-300 hover:text-white"  } >
        {languages.en}
      </button>

      <span className="text-slate-500">|</span>

      <button type="button"  onClick={() => handleLanguageChange("nl")}
        className={languageCode === "nl" ? "font-semibold text-cyan-300" : "text-slate-300 hover:text-white"  }  >
        {languages.nl}
      </button>
    </div>
  );
}