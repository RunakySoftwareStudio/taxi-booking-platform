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

  The layout classes are stored in homePageStyles so this file stays easier to read.
*/

import Link from "next/link";
import TopMenu from "@/components/TopMenu";
import HowItWorks from "@/components/HowItWorks";
import ChauffeursPreview from "@/components/ChauffeursPreview";
import BookingForm from "@/components/BookingForm";
import { homePageStyles } from "@/styles/classNames";

export default function HomePage() {
  return (
    <main className={homePageStyles.main}>
      <TopMenu />

      <section className={homePageStyles.heroSection}>
        <p className={homePageStyles.brandText}>VOYΛ TΛXI</p>
        <h1 className={homePageStyles.heroTitle}> Book a professional chauffeur for your next trip </h1>
        <p className={homePageStyles.slogan}>Where the journey begins</p>
        <p className={homePageStyles.description}> Find available chauffeurs, compare vehicles, request a trip, and stay connected from booking to arrival. </p>

        <div className={homePageStyles.heroButtonGroup}>
          <a href="#booking" className={homePageStyles.primaryHeroButton}>
            Book a Trip
          </a>

          <a href="#chauffeurs"  className={homePageStyles.secondaryHeroButton} >
            View Chauffeurs
          </a>

          {/* Public button for chauffeurs who want to register themselves. */}
          <Link href="/chauffeur-register" className={homePageStyles.chauffeurRegisterButton} >
            Register as chauffeur
          </Link>
        </div>

        {/* This link helps chauffeurs check the progress of their registration. */}
        <p className={homePageStyles.chauffeurStatusText}>
          Already registered as a chauffeur?{" "}
          <Link  href="/chauffeur-status"  className={homePageStyles.chauffeurStatusLink} >
            Check your registration status
          </Link>
        </p>

        {/* Mobile quick links replace the hidden desktop menu links on small screens. */}
        <div className={homePageStyles.mobileQuickLinks}>
          <a href="#how-it-works" className={homePageStyles.mobileQuickLink}>
            How it works
          </a>
          <a href="#chauffeurs" className={homePageStyles.mobileQuickLink}>
            Chauffeurs
          </a>
          <a href="#booking" className={homePageStyles.mobileQuickLink}>
            Booking
          </a>
          <Link href="/status" className={homePageStyles.mobileQuickLink}>
            Check booking
          </Link>
        </div>
      </section>

      <HowItWorks />
      <ChauffeursPreview />
      <BookingForm />
    </main>
  );
}