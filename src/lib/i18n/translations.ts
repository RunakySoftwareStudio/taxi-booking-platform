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
  logoutButton: {
    signingOut: {
      en: "Signing out...",
      nl: "Bezig met uitloggen...",
    },
    logout: {
      en: "Logout",
      nl: "Uitloggen",
    },
  },
  
  unauthorizedPage: {
    label: {
      en: "Access denied",
      nl: "Toegang geweigerd",
    },
    title: {
      en: "You do not have permission",
      nl: "U heeft geen toestemming",
    },
    description: {
      en: "Your account is logged in, but it does not have permission to open this page.",
      nl: "Uw account is ingelogd, maar heeft geen toestemming om deze pagina te openen.",
    },
    homepageButton: {
      en: "Go to homepage",
      nl: "Ga naar homepage",
    },
  },
    
  loginPage: {
    backToHomepage: {
      en: "← Back to homepage",
      nl: "← Terug naar homepage",
    },
    label: {
      en: "Login",
      nl: "Inloggen",
    },
    title: {
      en: "Sign in",
      nl: "Inloggen",
    },
    description: {
      en: "Sign in to manage bookings, chauffeurs, clients, and vehicles.",
      nl: "Log in om boekingen, chauffeurs, klanten en voertuigen te beheren.",
    },
    emailLabel: {
      en: "Email address",
      nl: "E-mailadres",
    },
    emailPlaceholder: {
      en: "admin@example.com",
      nl: "admin@example.com",
    },
    passwordLabel: {
      en: "Password",
      nl: "Wachtwoord",
    },
    passwordPlaceholder: {
      en: "Your password",
      nl: "Uw wachtwoord",
    },
    signingInButton: {
      en: "Signing in...",
      nl: "Bezig met inloggen...",
    },
    signInButton: {
      en: "Sign in",
      nl: "Inloggen",
    },
    loginFailedMessage: {
      en: "Login failed. Please check your email and password.",
      nl: "Inloggen mislukt. Controleer uw e-mailadres en wachtwoord.",
    },
    userNotFoundMessage: {
      en: "Login failed. User could not be found.",
      nl: "Inloggen mislukt. Gebruiker kon niet worden gevonden.",
    },
    profileNotFoundMessage: {
      en: "Login failed. No user profile was found.",
      nl: "Inloggen mislukt. Er is geen gebruikersprofiel gevonden.",
    },
    roleNotConfiguredMessage: {
      en: "Login failed. Your account role is not configured correctly.",
      nl: "Inloggen mislukt. De rol van uw account is niet correct ingesteld.",
    },
  },

  chauffeurRegisterPage: {
    brand: {
      en: "VOYΛ TAXI",
      nl: "VOYΛ TAXI",
    },
    title: {
      en: "Register as chauffeur",
      nl: "Registreer als chauffeur",
    },
    description: {
      en: "Join Voya Taxi and send your chauffeur registration request for admin approval.",
      nl: "Word chauffeur bij Voya Taxi en verstuur uw registratieaanvraag voor goedkeuring door de beheerder.",
    },
    fullNameLabel: {
      en: "Full name",
      nl: "Volledige naam",
    },
    emailLabel: {
      en: "Email",
      nl: "E-mail",
    },
    phoneLabel: {
      en: "Phone",
      nl: "Telefoon",
    },
    companyNameLabel: {
      en: "Company name",
      nl: "Bedrijfsnaam",
    },
    licenseNumberLabel: {
      en: "License number",
      nl: "Vergunningsnummer",
    },
    serviceAreaLabel: {
      en: "Service area",
      nl: "Servicegebied",
    },
    serviceAreaPlaceholder: {
      en: "Example: Almere, Amsterdam, Lelystad",
      nl: "Voorbeeld: Almere, Amsterdam, Lelystad",
    },
    acceptsPetsLabel: {
      en: "I accept passengers with pets",
      nl: "Ik accepteer passagiers met huisdieren",
    },
    reviewRegistrationButton: {
      en: "Review registration",
      nl: "Registratie controleren",
    },
    submitErrorMessage: {
      en: "Could not submit chauffeur registration.",
      nl: "Chauffeurregistratie kon niet worden verstuurd.",
    },
    serverErrorMessage: {
      en: "Could not connect to the server. Please try again later.",
      nl: "Kan geen verbinding maken met de server. Probeer het later opnieuw.",
    },
        reviewTitle: {
      en: "Review registration",
      nl: "Registratie controleren",
    },
    reviewDescription: {
      en: "Please check the chauffeur registration details before confirming.",
      nl: "Controleer de chauffeurregistratiegegevens voordat u bevestigt.",
    },
    yes: {
      en: "Yes",
      nl: "Ja",
    },
    no: {
      en: "No",
      nl: "Nee",
    },
    editRegistrationButton: {
      en: "Edit registration",
      nl: "Registratie aanpassen",
    },
    submittingButton: {
      en: "Submitting...",
      nl: "Bezig met versturen...",
    },
    confirmRegistrationButton: {
      en: "Confirm registration",
      nl: "Registratie bevestigen",
    },
        submittedTitle: {
      en: "Registration ready",
      nl: "Registratie ontvangen",
    },
    submittedDescription: {
      en: "Your chauffeur registration has been submitted successfully. Please save your Registration ID. You can use it later to check your registration status.",
      nl: "Uw chauffeurregistratie is succesvol verstuurd. Bewaar uw registratie-ID goed. U kunt deze later gebruiken om uw registratiestatus te controleren.",
    },
    registrationIdLabel: {
      en: "Registration ID:",
      nl: "Registratie-ID:",
    },
    statusLabel: {
      en: "Status:",
      nl: "Status:",
    },
    checkRegistrationStatusButton: {
      en: "Check registration status",
      nl: "Registratiestatus controleren",
    },
    startNewRegistrationButton: {
      en: "Start new registration",
      nl: "Nieuwe registratie starten",
    },
    statusPendingApproval: {
      en: "Pending approval",
      nl: "In afwachting van goedkeuring",
    },
    statusApproved: {
      en: "Approved",
      nl: "Goedgekeurd",
    },
    statusInactive: {
      en: "Inactive",
      nl: "Inactief",
    },
    statusSuspended: {
      en: "Suspended",
      nl: "Geschorst",
    },
  },

  chauffeurStatusPage: {
    backToHomepage: {
      en: "← Back to homepage",
      nl: "← Terug naar homepage",
    },
    label: {
      en: "Chauffeur registration status",
      nl: "Chauffeur registratiestatus",
    },
    title: {
      en: "Check your chauffeur registration",
      nl: "Controleer uw chauffeurregistratie",
    },
    description: {
      en: "Enter your registration ID and email address to view the current status of your chauffeur registration.",
      nl: "Vul uw registratie-ID en e-mailadres in om de huidige status van uw chauffeurregistratie te bekijken.",
    },
    registrationIdLabel: {
      en: "Registration ID",
      nl: "Registratie-ID",
    },
    registrationIdPlaceholder: {
      en: "Paste your registration ID",
      nl: "Plak uw registratie-ID",
    },
    emailLabel: {
      en: "Email address",
      nl: "E-mailadres",
    },
    emailPlaceholder: {
      en: "you@example.com",
      nl: "u@example.com",
    },
    searchingButton: {
      en: "Searching...",
      nl: "Bezig met zoeken...",
    },
    checkStatusButton: {
      en: "Check registration status",
      nl: "Registratiestatus controleren",
    },
    notFoundMessage: {
      en: "Chauffeur registration not found. Please check your registration ID and email.",
      nl: "Chauffeurregistratie niet gevonden. Controleer uw registratie-ID en e-mailadres.",
    },
    registrationStatusTitle: {
      en: "Registration Status:",
      nl: "Registratiestatus:",
    },
    nameLabel: {
      en: "Name",
      nl: "Naam",
    },
    phoneLabel: {
      en: "Phone",
      nl: "Telefoon",
    },
    companyNameLabel: {
      en: "Company name",
      nl: "Bedrijfsnaam",
    },
    licenseNumberLabel: {
      en: "License number",
      nl: "Vergunningsnummer",
    },
    serviceAreaLabel: {
      en: "Service area",
      nl: "Servicegebied",
    },
    acceptsPetsLabel: {
      en: "Accepts pets",
      nl: "Accepteert huisdieren",
    },
    submittedOnLabel: {
      en: "Submitted on",
      nl: "Ingediend op",
    },
    yes: {
      en: "Yes",
      nl: "Ja",
    },
    no: {
      en: "No",
      nl: "Nee",
    },
    statusMeaningTitle: {
      en: "What this status means",
      nl: "Wat deze status betekent",
    },
    pendingExplanation: {
      en: "Pending approval means your registration was received and is waiting for admin review.",
      nl: "In afwachting van goedkeuring betekent dat uw registratie is ontvangen en wacht op beoordeling door de beheerder.",
    },
    approvedExplanation: {
      en: "Approved means your chauffeur account has been accepted.",
      nl: "Goedgekeurd betekent dat uw chauffeursaccount is geaccepteerd.",
    },
    inactiveExplanation: {
      en: "Inactive or suspended means your account is not currently active.",
      nl: "Inactief of geschorst betekent dat uw account momenteel niet actief is.",
    },
    statusPendingApproval: {
      en: "Pending approval",
      nl: "In afwachting van goedkeuring",
    },
    statusApproved: {
      en: "Approved",
      nl: "Goedgekeurd",
    },
    statusInactive: {
      en: "Inactive",
      nl: "Inactief",
    },
    statusSuspended: {
      en: "Suspended",
      nl: "Geschorst",
    },
    
  },

  bookingStatusPage: {
    backToHomepage: {
      en: "← Back to homepage",
      nl: "← Terug naar homepage",
    },
    label: {
      en: "Booking status",
      nl: "Boekingsstatus",
    },
    title: {
      en: "Check your taxi booking",
      nl: "Controleer uw taxiboeking",
    },
    description: {
      en: "Enter your booking id and email address to view the current status of your trip.",
      nl: "Vul uw boekings-ID en e-mailadres in om de huidige status van uw rit te bekijken.",
    },
    bookingIdLabel: {
      en: "Booking id",
      nl: "Boekings-ID",
    },
    bookingIdPlaceholder: {
      en: "Paste your booking id",
      nl: "Plak uw boekings-ID",
    },
    emailLabel: {
      en: "Email address",
      nl: "E-mailadres",
    },
    emailPlaceholder: {
      en: "you@example.com",
      nl: "u@example.com",
    },
    searchingButton: {
      en: "Searching...",
      nl: "Bezig met zoeken...",
    },
    checkStatusButton: {
      en: "Check status",
      nl: "Status controleren",
    },
    bookingNotFound: {
      en: "Booking not found. Please check your booking id and email.",
      nl: "Boeking niet gevonden. Controleer uw boekings-ID en e-mailadres.",
    },
    bookingStatusTitle: {
      en: "Booking Status:",
      nl: "Boekingsstatus:",
    },
    nameLabel: {
      en: "Name:",
      nl: "Naam:",
    },
    emailSummaryLabel: {
      en: "Email:",
      nl: "E-mail:",
    },
    phoneLabel: {
      en: "Phone:",
      nl: "Telefoon:",
    },
    pickupLabel: {
      en: "Pickup:",
      nl: "Ophaallocatie:",
    },
    destinationLabel: {
      en: "Destination:",
      nl: "Bestemming:",
    },
    dateLabel: {
      en: "Date:",
      nl: "Datum:",
    },
    timeLabel: {
      en: "Time:",
      nl: "Tijd:",
    },
    passengersLabel: {
      en: "Passengers:",
      nl: "Passagiers:",
    },
    luggageLabel: {
      en: "Luggage:",
      nl: "Bagage:",
    },
    tripTypeLabel: {
      en: "Trip type:",
      nl: "Rittype:",
    },
    statusLabel: {
      en: "Status:",
      nl: "Status:",
    },
    hasPetsLabel: {
      en: "Has pets:",
      nl: "Heeft huisdieren:",
    },
    assignedChauffeurTitle: {
      en: "Assigned chauffeur",
      nl: "Toegewezen chauffeur",
    },
    noChauffeurAssigned: {
      en: "No chauffeur has been assigned yet.",
      nl: "Er is nog geen chauffeur toegewezen.",
    },
        statusPending: {
      en: "Pending",
      nl: "In behandeling",
    },
    statusApproved: {
      en: "Approved",
      nl: "Goedgekeurd",
    },
    statusAssigned: {
      en: "Assigned",
      nl: "Chauffeur toegewezen",
    },
    statusCompleted: {
      en: "Completed",
      nl: "Voltooid",
    },
    statusCancelled: {
      en: "Cancelled",
      nl: "Geannuleerd",
    },
    tripTypeOneWay: {
      en: "One-way trip",
      nl: "Enkele rit",
    },
    tripTypeReturn: {
      en: "Return trip",
      nl: "Retourrit",
    },
  },

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
  
  chauffeurPreview: {
    label: {
      en: "Chauffeurs",
      nl: "Chauffeurs",
    },
    title: {
      en: "View available chauffeurs before booking",
      nl: "Bekijk beschikbare chauffeurs voordat u boekt",
    },
    description: {
      en: "Clients can compare approved chauffeurs by vehicle, service area, and availability before sending a booking request.",
      nl: "Klanten kunnen goedgekeurde chauffeurs vergelijken op voertuig, servicegebied en beschikbaarheid voordat zij een boekingsaanvraag versturen.",
    },
    noApprovedChauffeurs: {
      en: "No approved chauffeurs are available yet.",
      nl: "Er zijn nog geen goedgekeurde chauffeurs beschikbaar.",
    },
    vehicleNotAdded: {
      en: "Vehicle not added yet",
      nl: "Voertuig nog niet toegevoegd",
    },
    serviceAreaNotAdded: {
      en: "Service area not added yet",
      nl: "Servicegebied nog niet toegevoegd",
    },
    noAvailabilityToday: {
      en: "No availability today",
      nl: "Vandaag afwezig",
    },
    approved: {
      en: "Approved",
      nl: "Goedgekeurd",
    },
  },
  bookingForm: {
    label: {
      en: "Booking",
      nl: "Boeking",
    },
    title: {
      en: "Request your taxi trip",
      nl: "Vraag uw taxirit aan",
    },
    description: {
      en: "Enter your trip details and the platform will help connect you with an available chauffeur.",
      nl: "Vul uw ritgegevens in en het platform helpt u verbinding te maken met een beschikbare chauffeur.",
    },
    pickupLabel: {
      en: "Pickup location",
      nl: "Ophaallocatie",
    },
    pickupPlaceholder: {
      en: "Amsterdam Central Station",
      nl: "Amsterdam Centraal Station",
    },
    destinationLabel: {
      en: "Destination",
      nl: "Bestemming",
    },
    destinationPlaceholder: {
      en: "Schiphol Airport",
      nl: "Schiphol Airport",
    },
    dateLabel: {
      en: "Date",
      nl: "Datum",
    },
    timeLabel: {
      en: "Time",
      nl: "Tijd",
    },
    passengersLabel: {
      en: "Passengers",
      nl: "Passagiers",
    },
    passengersPlaceholder: {
      en: "2",
      nl: "2",
    },
    luggageLabel: {
      en: "Luggage",
      nl: "Bagage",
    },
    luggagePlaceholder: {
      en: "1",
      nl: "1",
    },
    nameLabel: {
      en: "Your name",
      nl: "Uw naam",
    },
    namePlaceholder: {
      en: "Your full name",
      nl: "Uw volledige naam",
    },
    phoneLabel: {
      en: "Phone number",
      nl: "Telefoonnummer",
    },
    phonePlaceholder: {
      en: "+31 6 12345678",
      nl: "+31 6 12345678",
    },
    phoneTitle: {
      en: "Please enter a valid phone number. Use numbers, +, spaces, or - only.",
      nl: "Vul een geldig telefoonnummer in. Gebruik alleen cijfers, +, spaties of -.",
    },
    emailLabel: {
      en: "Email address",
      nl: "E-mailadres",
    },
    emailPlaceholder: {
      en: "client@example.com",
      nl: "klant@example.com",
    },
    tripTypeLabel: {
      en: "Trip type",
      nl: "Rittype",
    },
    selectTripType: {
      en: "Select trip type",
      nl: "Selecteer rittype",
    },
    hasPetsLabel: {
      en: "Has pets",
      nl: "Heeft huisdieren",
    },
    notesLabel: {
      en: "Extra notes",
      nl: "Extra opmerkingen",
    },
    notesPlaceholder: {
      en: "Flight number, child seat request, exact pickup point, or other information...",
      nl: "Vluchtnummer, kinderzitje, exacte ophaalplek of andere informatie...",
    },
    reviewBookingButton: {
      en: "Review booking",
      nl: "Boeking controleren",
    },
    reviewLabel: {
      en: "Review booking",
      nl: "Boeking controleren",
    },
    reviewTitle: {
      en: "Please check your booking details before sending.",
      nl: "Controleer uw boekingsgegevens voordat u deze verstuurt.",
    },
    summaryNameLabel: {
      en: "Name:",
      nl: "Naam:",
    },
    summaryPhoneLabel: {
      en: "Phone:",
      nl: "Telefoon:",
    },
    summaryEmailLabel: {
      en: "Email:",
      nl: "E-mail:",
    },
    summaryPickupLabel: {
      en: "Pickup:",
      nl: "Ophaallocatie:",
    },
    summaryDestinationLabel: {
      en: "Destination:",
      nl: "Bestemming:",
    },
    summaryDateLabel: {
      en: "Date:",
      nl: "Datum:",
    },
    summaryTimeLabel: {
      en: "Time:",
      nl: "Tijd:",
    },
    summaryPassengersLabel: {
      en: "Passengers:",
      nl: "Passagiers:",
    },
    summaryLuggageLabel: {
      en: "Luggage:",
      nl: "Bagage:",
    },
    summaryTripLabel: {
      en: "Trip:",
      nl: "Rit:",
    },
    summaryHasPetsLabel: {
      en: "Has pets:",
      nl: "Heeft huisdieren:",
    },
    summaryExtraNotesLabel: {
      en: "Extra notes:",
      nl: "Extra opmerkingen:",
    },
    backToEditButton: {
      en: "Back to edit",
      nl: "Terug naar bewerken",
    },
    sendingButton: {
      en: "Sending...",
      nl: "Bezig met versturen...",
    },
    confirmBookingButton: {
      en: "Confirm booking",
      nl: "Boeking bevestigen",
    },
        submitErrorMessage: {
      en: "Something went wrong. Please try again.",
      nl: "Er is iets misgegaan. Probeer het opnieuw.",
    },
    bookingReceivedMessage: {
      en: "Your booking request has been received. We will connect you with an available chauffeur.",
      nl: "Uw boekingsaanvraag is ontvangen. Wij brengen u in contact met een beschikbare chauffeur.",
    },
    bookingSummaryTitle: {
      en: "Booking summary:",
      nl: "Boekingsoverzicht:",
    },
    summaryTripTypeLabel: {
      en: "Trip type:",
      nl: "Rittype:",
    },
    summaryStatusLabel: {
      en: "Status:",
      nl: "Status:",
    },
    bookingReferenceTitle: {
      en: "Your booking reference",
      nl: "Uw boekingsreferentie",
    },
    bookingReferenceDescription: {
      en: "Save this booking reference. You can use it later together with your email address to check your booking status.",
      nl: "Bewaar deze boekingsreferentie. U kunt deze later samen met uw e-mailadres gebruiken om uw boekingsstatus te controleren.",
    },
    checkBookingStatusButton: {
      en: "Check booking status",
      nl: "Boekingsstatus controleren",
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