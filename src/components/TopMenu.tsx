/*
  TopMenu is the fixed navigation bar at the top of the website.

  It contains:
    - the Voya Taxi logo
    - public navigation links
    - the language switcher
    - login/logout/admin links from AuthMenuLinks

  In Version 5, we add LanguageSwitcher here so visitors can choose
  between English and Dutch.
*/

import Link from "next/link";
import AuthMenuLinks from "@/components/AuthMenuLinks";
import Image from "next/image";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
/*
  jump to the right section:
    <a href="#how-it-works"> this is important to jump to the right section when we click on the href.
    so in HowItWorks.tsx we should have a section id with exact the same name.
    in HowItWorks.tsx we have: return ( <section id="how-it-works" className="bg-slate-900 px-6 py-24 text-white">
*/

export default function TopMenu() {
  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">

        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image  src="/brand/TaxiVoyer-192.png"   alt="Voya taxi logo"  width={64}  height={64}  className="h-14 w-14 rounded-full object-contain"  />
          <span className="text-lg font-bold text-yellow-300 sm:text-xl">  TX • VOYΛ </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate-300 lg:flex">
            <Link href="/" className="text-xl font-bold text-white"> Home </Link>
            <a href="#how-it-works" className="transition hover:text-white"> How it works </a>
            <a href="#chauffeurs" className="transition hover:text-white"> Chauffeurs </a>
            <a href="#booking" className="transition hover:text-white"> Booking </a>
            <Link href="/status" className="text-sm text-slate-300 hover:text-cyan-300"> Check booking  </Link>
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