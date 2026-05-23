const chauffeurs = [
  {
    name: "Hassan",
    vehicle: "Mercedes E-Class",
    area: "Amsterdam / Schiphol",
    status: "Available today",
    rating: "4.9",
  },
  {
    name: "Rozbeh",
    vehicle: "Tesla Model Y",
    area: "Utrecht / Amsterdam",
    status: "Available tomorrow",
    rating: "4.8",
  },
  {
    name: "Dominik",
    vehicle: "Mercedes Vito Van",
    area: "Rotterdam / The Hague",
    status: "Busy now",
    rating: "4.7",
  },
];

export default function ChauffeursPreview() {
  return (
    <section id="chauffeurs" className="bg-slate-950 px-6 py-24 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400">
            Chauffeurs
          </p>

          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            View available chauffeurs before booking
          </h2>

          <p className="mt-4 text-slate-300">
            Clients can compare chauffeurs by vehicle, service area, rating,
            and availability before sending a booking request.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {chauffeurs.map((chauffeur) => (
            <div
              key={chauffeur.name}
              className="rounded-2xl border border-white/10 bg-white/5 p-6"
            >
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400 text-xl font-bold text-slate-950">
                {chauffeur.name.charAt(0)}
              </div>

              <h3 className="text-xl font-semibold">{chauffeur.name}</h3>

              <p className="mt-2 text-slate-300">{chauffeur.vehicle}</p>
              <p className="mt-1 text-sm text-slate-400">{chauffeur.area}</p>

              <div className="mt-6 flex items-center justify-between">
                <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-slate-200">
                  {chauffeur.status}
                </span>

                <span className="text-sm font-semibold text-yellow-400">
                  ★ {chauffeur.rating}
                </span>
              </div>
            </div>
          ))
          }
        </div>
      </div>
    </section>
  );
}