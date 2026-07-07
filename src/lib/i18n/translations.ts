import type { LanguageCode } from "./languages";

/*
  translations.ts stores public website text in one central place.

  Each text has:
    en: English text
    nl: Dutch text

  This is the first simple i18n system for Voya Taxi.
*/

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
    howItWorks: {
      en: "How it works",
      nl: "Hoe het werkt",
    },
    chauffeurs: {
      en: "Chauffeurs",
      nl: "Chauffeurs",
    },
    booking: {
      en: "Booking",
      nl: "Boeken",
    },
    checkBooking: {
      en: "Check booking",
      nl: "Boeking controleren",
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
      en: "VOYΛ TΛXI",
      nl: "VOYΛ TΛXI",
    },
    heroTitle: {
      en: "Book a professional chauffeur for your next trip",
      nl: "Boek een professionele chauffeur voor uw volgende rit",
    },
    slogan: {
      en: "Where the journey begins",
      nl: "Waar de reis begint",
    },
    description: {
      en: "Find available chauffeurs, compare vehicles, request a trip, and stay connected from booking to arrival.",
      nl: "Vind beschikbare chauffeurs, vergelijk voertuigen, vraag een rit aan en blijf verbonden van boeking tot aankomst.",
    },
    bookTrip: {
      en: "Book a Trip",
      nl: "Boek een rit",
    },
    viewChauffeurs: {
      en: "View Chauffeurs",
      nl: "Bekijk chauffeurs",
    },
    registerAsChauffeur: {
      en: "Register as chauffeur",
      nl: "Registreer als chauffeur",
    },
    alreadyRegisteredChauffeur: {
      en: "Already registered as a chauffeur?",
      nl: "Al geregistreerd als chauffeur?",
    },
    checkRegistrationStatus: {
      en: "Check your registration status",
      nl: "Controleer uw registratiestatus",
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