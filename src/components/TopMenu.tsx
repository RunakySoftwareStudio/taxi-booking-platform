import Link from "next/link";
import AuthMenuLinks from "@/components/AuthMenuLinks";

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
        <Link href="/" className="shrink-0 text-lg font-bold text-white sm:text-xl">
          TaxiPlatform
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-slate-300 lg:flex">
          <Link href="/" className="text-xl font-bold text-white">
            Home
          </Link>
          <a href="#how-it-works" className="transition hover:text-white">
            How it works
          </a>
          <a href="#chauffeurs" className="transition hover:text-white">
            Chauffeurs
          </a>
          <a href="#booking" className="transition hover:text-white">
            Booking
          </a>
          <Link href="/status" className="text-sm text-slate-300 hover:text-cyan-300">
            Check booking
          </Link>
        </nav>

        <div className="shrink-0">
          <AuthMenuLinks />
        </div>
      </div>
    </header>
  );
}