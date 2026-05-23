import TopMenu from "@/components/TopMenu";
import HowItWorks from "@/components/HowItWorks";
import ChauffeursPreview from "@/components/ChauffeursPreview";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <TopMenu />

      <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400">
          Taxi Chauffeur Platform
        </p>

        <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">
          Book a professional chauffeur for your next trip
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-slate-300">
          Find available chauffeurs, compare vehicles, request a trip, and stay
          connected from booking to arrival.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <a
            href="#booking"
            className="rounded-full bg-yellow-400 px-8 py-4 font-semibold text-slate-950 transition hover:bg-yellow-300"
          >
            Book a Trip
          </a>

          <a
            href="#chauffeurs"
            className="rounded-full border border-white/20 px-8 py-4 font-semibold text-white transition hover:bg-white hover:text-slate-950"
          >
            View Chauffeurs
          </a>
        </div>
      </section>
      <HowItWorks />
      <ChauffeursPreview />
    </main>
  );
}