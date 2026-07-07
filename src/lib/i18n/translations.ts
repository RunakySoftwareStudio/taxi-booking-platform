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
  howItWorks: {
    label: {
      en: "How it works",
      nl: "Hoe het werkt",
    },
    title: {
      en: "Book a chauffeur in three simple steps",
      nl: "Boek een chauffeur in drie eenvoudige stappen",
    },
    description: {
      en: "The platform helps clients find available chauffeurs, request a trip, and stay informed until the ride is completed.",
      nl: "Het platform helpt klanten beschikbare chauffeurs te vinden, een rit aan te vragen en op de hoogte te blijven tot de rit is voltooid.",
    },
    stepOneTitle: {
      en: "Enter trip details",
      nl: "Vul ritgegevens in",
    },
    stepOneDescription: {
      en: "The client enters pickup location, destination, date, time, passengers, and luggage information.",
      nl: "De klant vult de ophaallocatie, bestemming, datum, tijd, passagiers en bagagegegevens in.",
    },
    stepTwoTitle: {
      en: "View chauffeurs",
      nl: "Bekijk chauffeurs",
    },
    stepTwoDescription: {
      en: "The client sees available chauffeurs with vehicle type, rating, service area, and availability status.",
      nl: "De klant ziet beschikbare chauffeurs met voertuigtype, beoordeling, servicegebied en beschikbaarheidsstatus.",
    },
    stepThreeTitle: {
      en: "Book the trip",
      nl: "Boek de rit",
    },
    stepThreeDescription: {
      en: "The client sends the booking request, receives confirmation, and can contact the chauffeur when needed.",
      nl: "De klant verstuurt de boekingsaanvraag, ontvangt een bevestiging en kan indien nodig contact opnemen met de chauffeur.",
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