import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type ClientRow = 
    {
        id: string;
        name: string;
        email: string;
        phone: string;
        created_at: string;
    };

export default async function AdminClientsPage() 
{
  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, email, phone, created_at")
    .order("created_at", { ascending: false });

  if (error) 
    {    
        console.error("Could not load clients:", error);
        return (
            <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
                <div className="mx-auto max-w-6xl">
                    <h1 className="text-3xl font-bold">Admin clients</h1>
                    <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200"> Could not load clients. </p>
                </div>
            </main>
        );
    }

  const clientRows = (clients ?? []) as ClientRow[];

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300"> Admin </p>
        <h1 className="mt-3 text-3xl font-bold"> Clients </h1>
        <p className="mt-4 max-w-2xl text-slate-300"> View clients who submitted booking requests through the website. </p>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-white/10 bg-white/10 text-slate-300">
              <tr>
                <th className="p-4">Name</th>
                <th className="p-4">Email</th>
                <th className="p-4">Phone</th>
                <th className="p-4">Created at</th>
              </tr>
            </thead>

            <tbody>
              {clientRows.map((client) => (
                <tr key={client.id} className="border-b border-white/10">
                  <td className="p-4 font-medium text-white">{client.name}</td>
                  <td className="p-4 text-slate-300"> {client.email}</td>
                  <td className="p-4 text-slate-300"> {client.phone}</td>
                  <td className="p-4 text-slate-300"> {new Date(client.created_at).toLocaleString()}  </td>
                </tr>
              ))}

              {clientRows.length === 0 && (<tr> <td className="p-4 text-slate-300" colSpan={4}>  No clients found yet. </td> </tr> )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}