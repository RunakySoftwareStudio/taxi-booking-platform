export default function TopMenu() {
  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#" className="text-xl font-bold text-white"> TaxiPlatform </a>

        <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          <a href="#" className="transition hover:text-white"> Home </a>
          <a href="#how-it-works" className="transition hover:text-white"> How it works </a>
          <a href="#chauffeurs" className="transition hover:text-white"> Chauffeurs </a>
          <a href="#booking" className="transition hover:text-white"> Booking </a>
        </nav>

        <a href="#login" className="rounded-full border border-yellow-400 px-5 py-2 text-sm font-semibold text-yellow-400 transition hover:bg-yellow-400 hover:text-slate-950">
          Login
        </a>
        <a href="/admin">Admin</a>
      </div>
    </header>
  );
}