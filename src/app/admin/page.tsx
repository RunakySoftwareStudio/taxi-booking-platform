import Link from "next/link";

export default function AdminDashboardPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
        <div className="mx-auto max-w-6xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> Admin </p>
            <h1 className="mt-3 text-3xl font-bold">Admin dashboard</h1>
            <p className="mt-4 max-w-2xl text-slate-300"> Manage bookings, chauffeurs, clients, and platform settings. </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
                <Link href="/admin/bookings" className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10" >
                    <h2 className="text-xl font-semibold">Bookings</h2>
                    <p className="mt-3 text-sm text-slate-300"> View booking requests and update their status. </p>
                </Link>

                <Link href="/admin/chauffeurs" className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10" >
                    <h2 className="text-xl font-semibold">Chauffeurs</h2>
                    <p className="mt-3 text-sm text-slate-300"> Manage chauffeur profiles and approvals. </p>
                </Link>

                <Link href="/admin/clients" className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10" >
                    <h2 className="text-xl font-semibold">Clients</h2>
                    <p className="mt-3 text-sm text-slate-300">  View clients and their booking history. </p>
                </Link>
                <Link href="/admin/vehicles" className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10" >
                    <h2 className="text-xl font-semibold">Vehicles</h2>
                    <p className="mt-3 text-sm text-slate-300"> Add vehicles and connect them to approved chauffeurs. </p>
                </Link>
            </div>
        </div>
    </main>
  );
}