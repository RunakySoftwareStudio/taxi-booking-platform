
/*
 Short explanation
    This file protects us from language mistakes.
    For example, only these values are allowed:"en","nl"
    So later we cannot accidentally use "english" or "dutch" in one file and "en" in another file.* 
 */
export const languages = {
  en: "English",
  nl: "Nederlands",
} as const;

export type LanguageCode = keyof typeof languages;

export const defaultLanguage: LanguageCode = "en";

export function isLanguageCode(inputValue: string): inputValue is LanguageCode {
  return inputValue === "en" || inputValue === "nl";
}