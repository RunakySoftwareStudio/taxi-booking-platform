/*
  TopMenu is the fixed navigation bar at the top of the website.

  It contains:
    - the Voya Taxi logo
    - public navigation links
    - the language switcher
    - login/logout/admin links from AuthMenuLinks

  The visible navigation text now uses TranslatedText.
  This allows English and Dutch text without changing the route URLs.
*/

import Link from "next/link";
import AuthMenuLinks from "@/components/AuthMenuLinks";
import Image from "next/image";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TranslatedText } from "@/components/TranslatedText";

/*
  Jump links:
    <a href="#how-it-works"> jumps to the matching section id.

  Example:
    href="#how-it-works"

  must match:
    <section id="how-it-works">
*/

export default function TopMenu() {
  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src="/brand/TaxiVoyer-192.png"  alt="Voya taxi logo"  width={64}   height={64}  className="h-14 w-14 rounded-full object-contain" />
          <span className="text-lg font-bold text-yellow-300 sm:text-xl">
            TX • VOYΛ
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-slate-300 lg:flex">
          <Link href="/" className="text-xl font-bold text-white">
            <TranslatedText sectionName="navigation" textKey="home" />
          </Link>

          <a href="#how-it-works" className="transition hover:text-white">
            <TranslatedText sectionName="navigation" textKey="howItWorks" />
          </a>

          <a href="#chauffeurs" className="transition hover:text-white">
            <TranslatedText sectionName="navigation" textKey="chauffeurs" />
          </a>

          <a href="#booking" className="transition hover:text-white">
            <TranslatedText sectionName="navigation" textKey="booking" />
          </a>

          <Link href="/status" className="text-sm text-slate-300 hover:text-cyan-300"  >
            <TranslatedText sectionName="navigation" textKey="checkBooking" />
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          {/* LanguageSwitcher changes the selected language for public pages. */}
          <LanguageSwitcher />

          <AuthMenuLinks />
        </div>
      </div>
    </header>
  );
}