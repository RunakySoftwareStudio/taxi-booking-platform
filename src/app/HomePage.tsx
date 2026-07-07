/*
  HomePage is the public landing page for Voya Taxi.

  It shows:
    - the top menu
    - the hero section
    - main booking and chauffeur buttons
    - chauffeur registration status link
    - mobile quick links
    - How it works
    - chauffeur preview
    - booking form

  The visible homepage text now uses TranslatedText.
  This lets the language dropdown switch between English and Dutch.
*/

import Link from "next/link";
import TopMenu from "@/components/TopMenu";
import HowItWorks from "@/components/HowItWorks";
import ChauffeursPreview from "@/components/ChauffeursPreview";
import BookingForm from "@/components/BookingForm";
import { TranslatedText } from "@/components/TranslatedText";
import { homePageStyles } from "@/styles/classNames";

export default function HomePage() {
  return (
    <main className={homePageStyles.main}>
      <TopMenu />

      <section className={homePageStyles.heroSection}>
        <p className={homePageStyles.brandText}>
          <TranslatedText sectionName="homepage" textKey="brandName" />
        </p>

        <h1 className={homePageStyles.heroTitle}>
          <TranslatedText sectionName="homepage" textKey="heroTitle" />
        </h1>

        <p className={homePageStyles.slogan}>
          <TranslatedText sectionName="homepage" textKey="slogan" />
        </p>

        <p className={homePageStyles.description}>
          <TranslatedText sectionName="homepage" textKey="description" />
        </p>

        <div className={homePageStyles.heroButtonGroup}>
          <a href="#booking" className={homePageStyles.primaryHeroButton}>
            <TranslatedText sectionName="homepage" textKey="bookTrip" />
          </a>

          <a href="#chauffeurs" className={homePageStyles.secondaryHeroButton}>
            <TranslatedText sectionName="homepage" textKey="viewChauffeurs" />
          </a>

          {/* Public button for chauffeurs who want to register themselves. */}
          <Link  href="/chauffeur-register" className={homePageStyles.chauffeurRegisterButton} >
            <TranslatedText  sectionName="homepage" textKey="registerAsChauffeur"/>
          </Link>
        </div>

        {/* This link helps chauffeurs check the progress of their registration. */}
        <p className={homePageStyles.chauffeurStatusText}>
          <TranslatedText  sectionName="homepage" textKey="alreadyRegisteredChauffeur" />{" "}
          <Link href="/chauffeur-status" className={homePageStyles.chauffeurStatusLink} >
            <TranslatedText sectionName="homepage" textKey="checkRegistrationStatus"/>
          </Link>
        </p>

        {/* Mobile quick links replace the hidden desktop menu links on small screens. */}
        <div className={homePageStyles.mobileQuickLinks}>
          <a href="#how-it-works" className={homePageStyles.mobileQuickLink}>
            <TranslatedText sectionName="navigation" textKey="howItWorks" />
          </a>

          <a href="#chauffeurs" className={homePageStyles.mobileQuickLink}>
            <TranslatedText sectionName="navigation" textKey="chauffeurs" />
          </a>

          <a href="#booking" className={homePageStyles.mobileQuickLink}>
            <TranslatedText sectionName="navigation" textKey="booking" />
          </a>

          <Link href="/status" className={homePageStyles.mobileQuickLink}>
            <TranslatedText sectionName="navigation" textKey="checkBooking" />
          </Link>
        </div>
      </section>

      <HowItWorks />

      <ChauffeursPreview />

      <BookingForm />
    </main>
  );
}