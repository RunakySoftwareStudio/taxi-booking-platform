export default function HowItWorks() 
{
  return (
    <section id="how-it-works" className="bg-slate-900 px-6 py-24 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400"> How it works  </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl"> Book a chauffeur in three simple steps </h2>
          <p className="mt-4 text-slate-300"> The platform helps clients find available chauffeurs, request a trip, and stay informed until the ride is completed.  </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400 font-bold text-slate-950"> 1 </div>
            <h3 className="text-xl font-semibold">Enter trip details</h3>
            <p className="mt-3 text-slate-300"> The client enters pickup location, destination, date, time, passengers, and luggage information. </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400 font-bold text-slate-950"> 2 </div>
            <h3 className="text-xl font-semibold">View chauffeurs</h3>
            <p className="mt-3 text-slate-300"> The client sees available chauffeurs with vehicle type, rating, service area, and availability status. </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400 font-bold text-slate-950"> 3 </div>
            <h3 className="text-xl font-semibold">Book the trip</h3>
            <p className="mt-3 text-slate-300"> The client sends the booking request, receives confirmation, and can contact the chauffeur when needed. </p>
          </div>
        </div>
      </div>
    </section>
  );
}