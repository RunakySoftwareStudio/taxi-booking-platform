import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type AvailabilityRow = {
  id: string;
  chauffeur_id: string;
  available_date: string;
  start_time: string;
  end_time: string;
  status: string;
  created_at: string;
  chauffeurs: { name: string; email: string; phone: string; } | null;
};

export default async function AdminAvailabilityPage() 
{
    const { data: availabilityRecords, error } = await supabaseAdmin
        .from("chauffeur_availability")
        .select( `id, chauffeur_id, available_date, start_time, end_time, status, created_at, chauffeurs (name,email, phone) ` )
        .order("available_date", { ascending: true })
        .order("start_time", { ascending: true });

    if (error) 
        {
            console.error("Could not load chauffeur availability:", error);
            return (
                <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
                    <div className="mx-auto max-w-7xl">
                        <h1 className="text-3xl font-bold">Chauffeur availability</h1>
                        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
                            Could not load chauffeur availability.
                        </p>
                    </div>
                </main>
            );
        }

    const availabilityRows = (availabilityRecords ?? []) as unknown as AvailabilityRow[];

    return (
        <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
        <div className="mx-auto max-w-7xl">
            <Link  href="/admin" className="text-sm text-cyan-300 hover:text-cyan-200" > ← Back to admin dashboard </Link>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> Admin </p>
            <h1 className="mt-3 text-3xl font-bold">Chauffeur availability</h1>
            <p className="mt-4 max-w-2xl text-slate-300">  View availability records added by chauffeurs.  </p>
            <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
            <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/10 text-slate-300">
                <tr>
                    <th className="p-4">Chauffeur</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Start time</th>
                    <th className="p-4">End time</th>
                    <th className="p-4">Status</th>
                </tr>
                </thead>

                <tbody>
                {
                    availabilityRows.map((availability) => 
                    {
                        //available → green, busy→ red,  offline → yellow, holiday → yellow
                        let statusColorClasses = "bg-yellow-600/25 text-yellow-50 ring-1 ring-yellow-500/40";
                        if (availability.status === "available") {statusColorClasses = "bg-green-600/25 text-green-50 ring-1 ring-green-500/40"; }
                        if (availability.status === "busy") { statusColorClasses = "bg-red-600/25 text-red-50 ring-1 ring-red-500/40"; }

                        return (
                            <tr key={availability.id} className="border-b border-white/10">
                                <td className="p-4 font-medium text-white">  {availability.chauffeurs?.name || "Unknown chauffeur"} </td>
                                <td className="p-4 text-slate-300"> {availability.chauffeurs?.email || "-"} </td>
                                <td className="p-4 text-slate-300"> {availability.chauffeurs?.phone || "-"} </td>
                                <td className="p-4 text-slate-300">{availability.available_date} </td>
                                <td className="p-4 text-slate-300"> {availability.start_time} </td>
                                <td className="p-4 text-slate-300"> {availability.end_time} </td>
                                <td className="p-4">
                                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColorClasses}`}> {availability.status} </span>
                                </td>
                            </tr>  
                        );
                    })
                }

                {availabilityRows.length === 0 && ( <tr> <td className="p-4 text-slate-300" colSpan={7}> No availability records found yet. </td> </tr> )}
                </tbody>
            </table>
            </div>
        </div>
        </main>
    );
}