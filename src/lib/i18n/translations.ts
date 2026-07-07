import type { LanguageCode } from "./languages";

// TranslationEntry describes one translated text.
// Every text must have an English and Dutch version.
type TranslationEntry = Record<LanguageCode, string>;

// TranslationSection describes one group of translations,
// for example: navigation, homepage, or language.
type TranslationSection = Record<string, TranslationEntry>;

// TranslationDictionary describes the full translations object.
// It contains multiple sections, and each section contains translated texts.
type TranslationDictionary = Record<string, TranslationSection>;

export const translations = {
  navigation: {
    home: {
      en: "Home",
      nl: "Home",
    },
    bookingStatus: {
      en: "Booking status",
      nl: "Boeking status",
    },
    chauffeurRegister: {
      en: "Become a chauffeur",
      nl: "Chauffeur worden",
    },
    chauffeurStatus: {
      en: "Chauffeur status",
      nl: "Chauffeur status",
    },
    admin: {
      en: "Admin",
      nl: "Admin",
    },
    login: {
      en: "Login",
      nl: "Inloggen",
    },
    logout: {
      en: "Logout",
      nl: "Uitloggen",
    },
  },

  homepage: {
    brandName: {
      en: "VOYΛ TAXI",
      nl: "VOYΛ TAXI",
    },
    slogan: {
      en: "Where the journey begins",
      nl: "Waar de reis begint",
    },
    heroTitle: {
      en: "Reliable taxi booking for every journey",
      nl: "Betrouwbare taxireservering voor elke reis",
    },
    heroDescription: {
      en: "Book your ride, review your details, and follow your booking status online.",
      nl: "Reserveer uw rit, controleer uw gegevens en volg de status van uw boeking online.",
    },
    bookNow: {
      en: "Book now",
      nl: "Nu boeken",
    },
  },

  language: {
    label: {
      en: "Language",
      nl: "Taal",
    },
    english: {
      en: "English",
      nl: "Engels",
    },
    dutch: {
      en: "Dutch",
      nl: "Nederlands",
    },
  },
} satisfies TranslationDictionary;

// TranslationSectionName only allows section names that exist in translations.
// Example: "navigation", "homepage", or "language".
export type TranslationSectionName = keyof typeof translations;

// getTranslation returns the correct text for the selected language.
// If the text key is missing, it returns the key itself as a safe fallback.
export function getTranslation(
  sectionName: TranslationSectionName,
  textKey: string,
  languageCode: LanguageCode,
): string {
  const section: TranslationSection = translations[sectionName];
  const translationGroup = section[textKey];

  if (!translationGroup) {
    return textKey;
  }

  return translationGroup[languageCode] ?? translationGroup.en;
}