/*
  This file defines all languages supported by Voya Taxi.

  Each language has:
  - a visible name for the language switcher
  - a text direction

  English and Dutch use left-to-right text.
  Arabic uses right-to-left text.
*/

export type TextDirection = "ltr" | "rtl";

export const languages = {
  en: { label: "English", direction: "ltr", },
  nl: { label: "Nederlands",  direction: "ltr",  },
  ar: { label: "العربية",  direction: "rtl",  },
  tr: { label: "Türkçe",  direction: "ltr",  },
  fa: { label: "فارسی", direction: "rtl",  },

} as const satisfies Record< string, { label: string; direction: TextDirection; }>;

/*
  LanguageCode is automatically created from the keys above.
  Current allowed values:
  "en" | "nl" | "ar"| "tr"| "fa"
*/
export type LanguageCode = keyof typeof languages;
export const defaultLanguage: LanguageCode = "en";

/*
  Checks whether a value is a supported language code.
  This is used when reading a language from localStorage or another
  external source, because external values cannot be trusted automatically.
*/
export function isLanguageCode( inputValue: string,): inputValue is LanguageCode {
  return inputValue in languages;
}

/*
  Returns the writing direction belonging to a language.

  Examples:
  getLanguageDirection("en") returns "ltr"
  getLanguageDirection("ar") returns "rtl"
*/
export function getLanguageDirection( languageCode: LanguageCode,): TextDirection {
  return languages[languageCode].direction;
}
